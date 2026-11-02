import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { serialPriorityScopeKey, sortSerialRecords } from "../src/utils/serialOrdering.js";

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(backendDirectory, "..");

function loadEnvironmentFile() {
  const filename = path.join(projectDirectory, ".env");
  if (!fs.existsSync(filename)) return;
  for (const rawLine of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvironmentFile();

const configuredPath = process.env.DATABASE_FILE || "backend/data/contech.sqlite";
export const databasePath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(projectDirectory, configuredPath);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new DatabaseSync(databasePath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    fullname TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'dc', 'engineer', 'head')),
    allowed_request_types TEXT NOT NULL DEFAULT '["ir"]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE REFERENCES users(username) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY COLLATE NOCASE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    collection TEXT NOT NULL CHECK (collection IN ('irs', 'revs', 'shopdrawings')),
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_collection_created ON items(collection, created_at DESC);
`);

// Keep existing local databases compatible as the account schema evolves.
const userColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map((column) => column.name));
if (!userColumns.has("phone")) {
  db.exec("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
}

const now = () => new Date().toISOString();

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function canonicalDepartment(value) {
  return /^(st|civil|structural|structure)$/i.test(String(value || "").trim())
    ? "Civil"
    : String(value || "").trim().toUpperCase();
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, 64);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [algorithm, saltHex, hashHex] = String(stored || "").split(":");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function publicUser(row) {
  if (!row) return null;
  const storedTypes = parseJson(row.allowed_request_types, ["ir"]);
  return {
    username: row.username,
    fullname: row.fullname,
    phone: row.phone || "",
    department: canonicalDepartment(row.department),
    role: row.role,
    allowedRequestTypes: Array.isArray(storedTypes) ? storedTypes.filter((type) => !["ppir", "tr"].includes(type)) : ["ir"],
  };
}

export function ensureInitialAdmin() {
  if (Number(db.prepare("SELECT COUNT(*) AS count FROM users").get().count) > 0) return;
  const username = (process.env.INITIAL_ADMIN_USERNAME || "admin").trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || "Admin@12345";
  if (process.env.NODE_ENV === "production" && !process.env.INITIAL_ADMIN_PASSWORD) {
    throw new Error("INITIAL_ADMIN_PASSWORD is required on the first production start");
  }
  const created = now();
  db.prepare(`INSERT INTO users
    (username, password_hash, fullname, department, role, allowed_request_types, created_at, updated_at)
    VALUES (?, ?, ?, 'ADMIN', 'admin', ?, ?, ?)`)
    .run(
      username,
      hashPassword(password),
      process.env.INITIAL_ADMIN_FULLNAME || "System Administrator",
      JSON.stringify(["ir", "cpr", "sd"]),
      created,
      created,
    );
  if (!process.env.INITIAL_ADMIN_PASSWORD) {
    console.warn("Created local administrator admin / Admin@12345. Change this password immediately.");
  }
}

export function getSetting(key, fallback = {}) {
  const row = db.prepare("SELECT data FROM settings WHERE key = ?").get(key);
  return row ? parseJson(row.data, fallback) : fallback;
}

export function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(key, JSON.stringify(value), now());
}

export function listProjects() {
  const projects = {};
  for (const row of db.prepare("SELECT name, data FROM projects ORDER BY name COLLATE NOCASE").all()) {
    projects[row.name] = parseJson(row.data, {});
  }
  return projects;
}

export function saveProject(project) {
  const updated = now();
  const name = project.name.trim();
  const existing = db.prepare("SELECT created_at FROM projects WHERE name = ?").get(name);
  const data = { ...project, name, updatedAt: updated };
  db.prepare(`INSERT INTO projects (name, data, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(name, JSON.stringify(data), existing?.created_at || updated, updated);
  return data;
}

export function listItems(collection, { includeArchived = true } = {}) {
  const items = db.prepare("SELECT id, data, created_at FROM items WHERE collection = ? ORDER BY created_at DESC, id ASC").all(collection)
    .map((row) => {
      const data = parseJson(row.data, {});
      return { ...data, id: row.id, uniqueId: row.id, createdAt: data.createdAt || row.created_at };
    })
    .filter((item) => includeArchived || !item.isArchived);
  if (collection !== "irs") return items;
  const priorities = getSetting("serial_order_priorities", {});
  return sortSerialRecords(items.map((item) => ({
    ...item,
    serialOrderPriority: priorities[serialPriorityScopeKey(item)] === item.id,
  })));
}

export function findItem(collection, id) {
  const row = db.prepare("SELECT id, data, created_at FROM items WHERE collection = ? AND id = ?").get(collection, id);
  if (!row) return null;
  const data = parseJson(row.data, {});
  return { ...data, id: row.id, uniqueId: row.id, createdAt: data.createdAt || row.created_at };
}

export function saveItem(collection, item) {
  const updated = now();
  const id = item.id || item.uniqueId;
  const data = { ...item, id, uniqueId: id };
  db.prepare(`INSERT INTO items (id, collection, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(id, collection, JSON.stringify(data), item.createdAt || updated, updated);
  return data;
}

export function deleteItem(collection, id) {
  return Number(db.prepare("DELETE FROM items WHERE collection = ? AND id = ?").run(collection, id).changes) > 0;
}

ensureInitialAdmin();
