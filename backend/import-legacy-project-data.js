import crypto from "node:crypto";
import fs from "node:fs";

import { db, getSetting, listProjects, saveProject, setSetting } from "./db.js";

const collections = ["projects", "location_rules", "general_descriptions", "general_descriptions_cpr", "requests", "shopdrawings"];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  signer.end();
  const assertion = `${header}.${claim}.${signer.sign(account.private_key).toString("base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error(`Google authentication failed: ${body.error_description || body.error || response.status}`);
  return body.access_token;
}

function firestoreValue(value = {}) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(firestoreValue);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, entry]) => [key, firestoreValue(entry)]));
  return null;
}

function documentValue(document) {
  const id = String(document.name || "").split("/").pop();
  return { id, data: Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, firestoreValue(value)])) };
}

async function fetchCollection(projectId, token, collection) {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${collection}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(`Reading ${collection} failed: ${body.error?.message || response.status}`);
    documents.push(...(body.documents || []).map(documentValue));
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return documents;
}

function cleanName(value) {
  return String(value || "").trim().slice(0, 100);
}

function uniqueText(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function cleanRules(rules) {
  const seen = new Set();
  return (Array.isArray(rules) ? rules : []).flatMap((rule) => {
    const pattern = String(rule?.pattern || "").trim();
    if (!pattern) return [];
    const normalized = { pattern, type: String(rule?.type || "IR").trim() || "IR" };
    const floors = uniqueText(rule?.floors);
    if (floors.length) normalized.floors = floors;
    const key = JSON.stringify(normalized);
    if (seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function mergeCatalog(existing = {}, imported = {}) {
  const result = { ...existing };
  for (const key of ["base", "floors", "levels", "elements", "grades"]) {
    const values = uniqueText([...(existing[key] || []), ...(imported[key] || [])]);
    if (values.length) result[key] = values;
  }
  return result;
}

function maxCounters(existing = {}, imported = {}) {
  const keys = new Set([...Object.keys(existing || {}), ...Object.keys(imported || {})]);
  return Object.fromEntries([...keys].map((key) => [key, Math.max(Number(existing[key]) || 0, Number(imported[key]) || 0)]));
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log("Usage: npm run migrate:legacy-projects -- (--service-account <path> | --source-json <path>) [--dry-run]");
    return;
  }
  const serviceAccountPath = argument("--service-account");
  const sourceJsonPath = argument("--source-json");
  const dryRun = process.argv.includes("--dry-run");
  if (serviceAccountPath && sourceJsonPath) throw new Error("Use either --service-account or --source-json, not both");
  let source;
  if (sourceJsonPath) {
    if (!fs.existsSync(sourceJsonPath)) throw new Error("The source JSON file was not found");
    const raw = JSON.parse(fs.readFileSync(sourceJsonPath, "utf8"));
    source = Object.fromEntries(collections.map((collection) => [collection, (raw[collection] || []).map((document) => document.data ? document : documentValue(document))]));
  } else {
    if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) throw new Error("A readable --service-account file is required");
    const account = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    if (!account.project_id || !account.client_email || !account.private_key) throw new Error("The service-account file is incomplete");
    const token = await accessToken(account);
    source = Object.fromEntries(await Promise.all(collections.map(async (collection) => [collection, await fetchCollection(account.project_id, token, collection)])));
  }
  const existingProjects = listProjects();
  const nextProjects = { ...existingProjects };
  const summary = { source: Object.fromEntries(collections.map((name) => [name, source[name].length])), projects: { added: 0, merged: 0, unchanged: 0 }, locationRules: { added: 0, merged: 0, unchanged: 0 }, catalogs: { merged: 0, unchanged: 0 } };

  for (const entry of source.projects) {
    const name = cleanName(entry.data.name || entry.id);
    if (!name) continue;
    const current = nextProjects[name];
    const candidate = {
      ...(current || {}),
      ...(!current?.description && entry.data.description ? { description: String(entry.data.description).trim() } : {}),
      name,
      counters: maxCounters(current?.counters, entry.data.counters),
    };
    if (!current) summary.projects.added += 1;
    else if (JSON.stringify(candidate) !== JSON.stringify(current)) summary.projects.merged += 1;
    else summary.projects.unchanged += 1;
    nextProjects[name] = candidate;
  }
  for (const collection of ["location_rules", "requests", "shopdrawings"]) {
    for (const entry of source[collection]) {
      const name = cleanName(collection === "location_rules" ? entry.data.project || entry.id : entry.data.project);
      if (!name || nextProjects[name]) continue;
      nextProjects[name] = { name, description: "", counters: {} };
      summary.projects.added += 1;
    }
  }

  const locationRules = getSetting("location_rules", {});
  const nextLocationRules = { ...locationRules };
  for (const entry of source.location_rules) {
    const name = cleanName(entry.data.project || entry.id);
    if (!name) continue;
    const imported = cleanRules(entry.data.rules);
    const current = cleanRules(nextLocationRules[name]?.rules);
    const merged = cleanRules([...current, ...imported]);
    if (JSON.stringify(merged) === JSON.stringify(current)) summary.locationRules.unchanged += 1;
    else if (current.length) summary.locationRules.merged += 1;
    else summary.locationRules.added += 1;
    nextLocationRules[name] = { rules: merged };
  }

  const nextSettings = new Map();
  for (const settingName of ["general_descriptions", "general_descriptions_cpr"]) {
    const current = getSetting(settingName, {});
    const merged = { ...current };
    for (const entry of source[settingName]) {
      const department = cleanName(entry.data.department || entry.id);
      if (!department) continue;
      const candidate = mergeCatalog(merged[department], entry.data);
      if (JSON.stringify(candidate) === JSON.stringify(merged[department] || {})) summary.catalogs.unchanged += 1;
      else summary.catalogs.merged += 1;
      merged[department] = candidate;
    }
    nextSettings.set(settingName, merged);
  }

  if (!dryRun) {
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const project of Object.values(nextProjects)) saveProject(project);
      setSetting("location_rules", nextLocationRules);
      for (const [key, value] of nextSettings) setSetting(key, value);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  console.log(JSON.stringify({ dryRun, ...summary }, null, 2));
}

main().catch((error) => {
  console.error(`Legacy project migration failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.close());
