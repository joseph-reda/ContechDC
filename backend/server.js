import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  databasePath,
  db,
  deleteItem,
  findItem,
  getSetting,
  hashPassword,
  listItems,
  listProjects,
  publicUser,
  saveItem,
  saveProject,
  setSetting,
  verifyPassword,
} from "./db.js";
import { cookieParser, corsMiddleware, createApp, jsonMiddleware, Router, staticMiddleware } from "./http-app.js";
import { getExcelDirectory, listExcelFiles, previewExcelFile, resolveWorkbook } from "./excel-files.js";
import { createReportWorkbook } from "./report-excel.js";
import { createWordDocument, getWordTemplateInfo } from "./word.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(__dirname, "..");
const allowedCollections = new Set(["irs", "revs", "shopdrawings"]);
const allowedRoles = new Set(["admin", "dc", "engineer", "head"]);
const creatableRoles = new Set(["admin", "dc", "engineer", "head"]);
const allowedDepartments = new Set(["ARCH", "Civil", "ELECT", "MECH", "SURV"]);
const allowedRequestTypes = new Set(["ir", "cpr", "sd"]);
const inspectionRequestTypes = new Set(["IR", "CPR", "PPIR", "TR"]);
const creatableInspectionRequestTypes = new Set(["IR", "CPR", "TR"]);

function canonicalDepartment(value) {
  const raw = String(value || "").trim();
  if (/^(st|civil|structural|structure)$/i.test(raw)) return "Civil";
  return raw.toUpperCase();
}

function documentDepartmentCode(value) {
  const department = canonicalDepartment(value);
  return department === "Civil" ? "ST" : department;
}
const sessionCookie = "contech_session";

const DEFAULT_FLOORS = [
  "SOG", "Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor",
  "Penthouse Floor", "Upper Roof", "Roof", "Common Area", "Stairs", "Elevation",
];

function descriptionCatalog(baseByDepartment, floors = DEFAULT_FLOORS) {
  return Object.fromEntries(Object.entries(baseByDepartment).map(([department, base]) => [
    department,
    { base, floors: [...floors], levels: department === "Survey" ? ["FFL", "SSL", "TOS", "TOC"] : [] },
  ]));
}

const DEFAULT_DESCRIPTION_CATALOGS = {
  general_descriptions: descriptionCatalog({
    Architectural: ["Blockwork", "Plastering", "Waterproofing", "Tiling", "Painting", "Ceiling Works", "Facade Works"],
    Civil: ["Excavation", "Backfilling", "Formwork", "Steel Reinforcement", "Concrete Works", "Masonry Works"],
    Electrical: ["Conduits", "Cable Trays", "Cabling", "Lighting", "Power", "Earthing", "Testing and Commissioning"],
    Mechanical: ["HVAC", "Fire Fighting", "Plumbing", "Drainage", "Ductwork", "Piping", "Testing and Commissioning"],
    Survey: ["Setting Out", "Level Verification", "Coordinates Check", "As-Built Survey"],
  }),
  general_descriptions_cpr: descriptionCatalog({
    Civil: ["Slab", "Column", "Beam", "Wall", "Foundation", "Raft", "Stair", "Equipment Base"],
  }),
  general_descriptions_ppir: descriptionCatalog({
    Architectural: ["Post-Pour Opening Check", "Embedded Items Check", "Concrete Surface and Finish"],
    Civil: ["Post-Pour Concrete Inspection", "Dimensions and Levels Verification", "Surface Finish", "Honeycombing and Defects", "Curing Inspection"],
    Electrical: ["Post-Pour Conduits Inspection", "Embedded Boxes Inspection", "Sleeves and Openings Check"],
    Mechanical: ["Post-Pour Sleeves Inspection", "Embedded Services Check", "Openings Verification"],
    Survey: ["Post-Pour Level Survey", "Coordinates Verification", "As-Built Dimensions"],
  }),
  general_descriptions_tr: descriptionCatalog({
    Architectural: ["Material Sample Test", "Adhesion Test", "Waterproofing Test", "Paint Test"],
    Civil: ["Concrete Cube Test", "Soil Compaction Test", "Rebar Tensile Test", "Pile Test", "Waterproofing Flood Test"],
    Electrical: ["Insulation Resistance Test", "Continuity Test", "Earth Resistance Test", "Functional Test"],
    Mechanical: ["Pressure Test", "Flushing Test", "Duct Leakage Test", "Balancing Test", "Functional Test"],
    Survey: ["Survey Verification Report", "Level Survey Report", "Coordinates Verification Report"],
  }),
};

function descriptionCatalogKey(type) {
  const normalized = String(type || "IR").trim().toUpperCase();
  if (normalized === "CPR") return "general_descriptions_cpr";
  if (normalized === "PPIR") return "general_descriptions_ppir";
  if (normalized === "TR") return "general_descriptions_tr";
  return "general_descriptions";
}

function ensureDefaultDescriptionCatalogs() {
  const exists = db.prepare("SELECT 1 FROM settings WHERE key = ?");
  for (const [key, catalog] of Object.entries(DEFAULT_DESCRIPTION_CATALOGS)) {
    if (!exists.get(key)) setSetting(key, catalog);
  }
}

ensureDefaultDescriptionCatalogs();

export const app = createApp();
app.disable("x-powered-by");
const configuredOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((value) => value.trim());
app.use(corsMiddleware(configuredOrigins));
app.use(jsonMiddleware());
app.use(cookieParser);

function timestamp() {
  return new Date().toISOString();
}

function cairoDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (name) => parts.find((entry) => entry.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function configuredLocations(project) {
  const rules = getSetting("location_rules", {})[String(project || "")]?.rules || [];
  const typesMap = {};
  for (const rule of rules) {
    const pattern = String(rule.pattern || "").trim();
    if (!pattern) continue;
    const floors = Array.isArray(rule.floors) && rule.floors.length ? rule.floors : [""];
    for (const floor of floors) {
      const location = floor ? `${pattern} - ${floor}` : pattern;
      typesMap[location] = String(rule.type || "").trim();
    }
  }
  return typesMap;
}

function locationTypeFor(item, cache) {
  const project = String(item.project || "");
  if (cache && !cache.has(project)) cache.set(project, configuredLocations(project));
  const typesMap = cache ? cache.get(project) : configuredLocations(project);
  return typesMap[String(item.location || "").trim()] || "";
}

function documentType(item) {
  if (item.isRevision) return "REVISION";
  if (item.sdNo) return "SD";
  const type = String(item.requestType || (item.isCPR ? "CPR" : "IR")).toUpperCase();
  return inspectionRequestTypes.has(type) ? type : "IR";
}

function isPpirRecord(item) {
  return documentType(item) === "PPIR" || String(item.parentRequestType || "").toUpperCase() === "PPIR";
}

function documentDate(item) {
  return item.sentAt || item.receivedDate || item.createdAt || item.archivedAt || "";
}

function reportDate(item) {
  return item.receivedDate || documentDate(item);
}

function allDocuments({ archived } = {}) {
  const locationTypes = new Map();
  return [...allowedCollections].flatMap((collection) =>
    listItems(collection)
      .filter((item) => !isPpirRecord(item))
      .filter((item) => archived === undefined || Boolean(item.isArchived) === archived)
      .map((item) => ({ ...item, collection, sourceCollection: collection, requestType: documentType(item), locationType: locationTypeFor(item, locationTypes) })),
  );
}

function filterDocuments(items, query) {
  const search = String(query.q || query.search || "").trim().toLowerCase();
  const description = String(query.description || "").trim().toLowerCase();
  const location = String(query.location || "").trim().toLowerCase();
  const requestedType = String(query.type || "all").toUpperCase();
  const requestedStatus = String(query.status || "all").toLowerCase();
  const dateFrom = String(query.dateFrom || "");
  const dateTo = String(query.dateTo || "");
  return items.filter((item) => {
    if (requestedType !== "ALL" && !(requestedType === "IR_CPR" ? ["IR", "CPR"].includes(documentType(item)) : documentType(item) === requestedType)) return false;
    if (query.project && query.project !== "all" && item.project !== query.project) return false;
    if (query.department && query.department !== "all" && String(item.department || "") !== String(query.department)) return false;
    if (query.archivedBy && query.archivedBy !== "all" && item.archivedBy !== query.archivedBy) return false;
    if (query.action === "none" && item.action) return false;
    if (query.action && !["all", "none"].includes(query.action) && String(item.action || "") !== String(query.action)) return false;
    if (description && !String(item.desc || item.revNote || item.subject || "").toLowerCase().includes(description)) return false;
    if (location && !String(item.location || item.floor || "").toLowerCase().includes(location)) return false;
    if (requestedStatus === "pending" && item.isDone) return false;
    if (requestedStatus === "completed" && !item.isDone) return false;
    // Received dates are business dates, not instants in the server's timezone.
    const itemDate = String(reportDate(item)).slice(0, 10);
    if ((dateFrom || dateTo) && !/^\d{4}-\d{2}-\d{2}$/.test(itemDate)) return false;
    if (dateFrom && itemDate < dateFrom) return false;
    if (dateTo && itemDate > dateTo) return false;
    if (query.dateRange && query.dateRange !== "all") {
      const date = new Date(documentDate(item));
      if (Number.isNaN(date.getTime())) return false;
      const now = new Date();
      const boundary = new Date(now);
      if (query.dateRange === "today" && date.toDateString() !== now.toDateString()) return false;
      if (query.dateRange === "week") {
        boundary.setDate(now.getDate() - 7);
        if (date < boundary) return false;
      }
      if (query.dateRange === "month") {
        boundary.setMonth(now.getMonth() - 1);
        if (date < boundary) return false;
      }
    }
    if (!search) return true;
    return [item.irNo, item.revNo, item.sdNo, item.project, item.department, item.desc, item.revNote, item.subject, item.location, item.user]
      .some((value) => String(value || "").toLowerCase().includes(search));
  });
}

function summarizeDocuments(items) {
  const byType = {};
  const byProject = {};
  const byDepartment = {};
  const byAction = {};
  const byLocation = {};
  const byDate = {};
  for (const item of items) {
    const type = documentType(item);
    byType[type] = (byType[type] || 0) + 1;
    const project = item.project || "Unknown";
    byProject[project] = (byProject[project] || 0) + 1;
    const department = item.department || "Unknown";
    byDepartment[department] = (byDepartment[department] || 0) + 1;
    const action = item.action || "No action";
    byAction[action] = (byAction[action] || 0) + 1;
    const location = item.location || item.floor || "No location";
    byLocation[location] = (byLocation[location] || 0) + 1;
    const date = String(reportDate(item) || "").slice(0, 10) || "Unknown";
    byDate[date] = (byDate[date] || 0) + 1;
  }
  return {
    total: items.length,
    pending: items.filter((item) => !item.isDone).length,
    completed: items.filter((item) => item.isDone).length,
    downloaded: items.filter((item) => item.downloadedAt).length,
    byType,
    byProject,
    byDepartment,
    byAction,
    byLocation,
    byDate,
    byStatus: {
      Pending: items.filter((item) => !item.isDone).length,
      Completed: items.filter((item) => item.isDone).length,
    },
  };
}

function filterOptions(items) {
  return {
    projects: [...new Set(items.map((item) => item.project).filter(Boolean))].sort(),
    departments: [...new Set(items.map((item) => item.department).filter(Boolean))].sort(),
    archivedBy: [...new Set(items.map((item) => item.archivedBy).filter(Boolean))].sort(),
    locations: [...new Set(items.map((item) => item.location || item.floor).filter(Boolean))].sort(),
    actions: [...new Set(items.map((item) => item.action).filter(Boolean))].sort(),
  };
}

function cleanUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanCatalogText(value, label, { maxLength = 200 } = {}) {
  const cleaned = String(value || "").trim();
  if (!cleaned) throw new Error(`${label} cannot be blank`);
  if (cleaned.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  if(/[\u0000-\u001f\u007f]/.test(cleaned)) throw new Error(`${label} contains invalid control characters`);
  return cleaned;
}

function projectExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM projects WHERE name = ?").get(String(name || "").trim()));
}

function normalizeProjectPayload(body) {
  const name = cleanCatalogText(body.name, "Project name", { maxLength: 100 });
  if (name.length < 3) throw new Error("Project name must be 3-100 characters");
  const description = String(body.description || "").trim();
  if (description.length > 2000) throw new Error("Project description must be 2000 characters or fewer");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(description)) throw new Error("Project description contains invalid control characters");
  const counters = body.counters && typeof body.counters === "object" && !Array.isArray(body.counters)
    ? body.counters
    : {};
  const normalizedCounters = {};
  for (const [key, value] of Object.entries(counters)) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(key)) throw new Error("Invalid counter name");
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 1000000) {
      throw new Error(`Counter ${key} must be a whole number from 0 to 1000000`);
    }
    normalizedCounters[key] = number;
  }
  return { name, description, counters: normalizedCounters };
}

function normalizeCatalogObject(value, label, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const result = {};
  for (const field of fields) {
    const values = value[field] ?? [];
    if (!Array.isArray(values) || values.length > 200) throw new Error(`${label} ${field} must contain at most 200 values`);
    result[field] = [...new Set(values.map((entry) => cleanCatalogText(entry, `${label} ${field}`)))];
  }
  return result;
}

function normalizeStringCatalog(value, label, { objectEntries = false } = {}) {
  if (!Array.isArray(value) || value.length > 200) throw new Error(`${label} must contain at most 200 values`);
  if (objectEntries) {
    return value.map((entry) => ({
      title: cleanCatalogText(entry?.title, `${label} title`),
      abbr: cleanCatalogText(entry?.abbr || getInitials(entry?.title), `${label} abbreviation`, { maxLength: 20 }),
    }));
  }
  return [...new Set(value.map((entry) => cleanCatalogText(entry, label)))];
}

function getInitials(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).map((word) => word[0]).join("").slice(0, 20).toUpperCase() || "X";
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createSession(username, req, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(timestamp());
  db.prepare("INSERT INTO sessions (token_hash, username, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(tokenHash(token), username, expires.toISOString(), timestamp());
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(req.socket.encrypted || req.headers["x-forwarded-proto"] === "https"),
    expires,
    path: "/",
  });
  return token;
}

function currentUser(req) {
  const bearer = req.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer || req.cookies[sessionCookie];
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM sessions s
    JOIN users u ON u.username = s.username
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(tokenHash(token), timestamp());
  return row || null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  next();
}

function requireDocumentControl(req, res, next) {
  if (!new Set(["admin", "dc"]).has(req.user?.role)) {
    return res.status(403).json({ error: "Document Controller access required" });
  }
  next();
}

function normalizePhone(value) {
  return String(value || "").trim();
}

function validateAccount(body, { passwordRequired = true, roleRequired = false } = {}) {
  const username = cleanUsername(body.username);
  const password = String(body.password || "");
  const phone = normalizePhone(body.phone);
  const role = String(body.role || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return "Username must be 3-40 letters, numbers, dots, dashes or underscores";
  if (passwordRequired && password.length < 6) return "Password must be at least 6 characters";
  if (password && password.length < 6) return "Password must be at least 6 characters";
  if (phone.length > 30 || (phone && !/^[0-9+()\-\s]+$/.test(phone))) {
    return "Phone number may contain only digits, spaces, +, -, and parentheses";
  }
  if (roleRequired && !role) return "Role is required";
  if (role && !allowedRoles.has(role)) return "Invalid role";
  if (role === "engineer") {
  const department = canonicalDepartment(body.department);
    if (!allowedDepartments.has(department)) return "A valid department is required for engineers";
    const requestTypes = Array.isArray(body.allowedRequestTypes)
      ? body.allowedRequestTypes.filter((value) => allowedRequestTypes.has(value))
      : [];
    if (requestTypes.length === 0) return "At least one request type is required for engineers";
  }
  return null;
}

function insertUser(body, forcedRole) {
  const now = timestamp();
  const username = cleanUsername(body.username);
  const role = forcedRole || String(body.role || "engineer").toLowerCase();
  const isEngineer = role === "engineer";
  const requestTypes = isEngineer
    ? body.allowedRequestTypes.filter((value) => allowedRequestTypes.has(value))
    : [];
  db.prepare(`
    INSERT INTO users (
      username, password_hash, fullname, phone, department, role,
      allowed_request_types, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    username,
    hashPassword(String(body.password)),
    username,
    normalizePhone(body.phone),
    isEngineer ? String(body.department).trim().toUpperCase() : "N/A",
    role,
    JSON.stringify(requestTypes),
    now,
    now,
  );
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

const api = Router();

api.get("/health", (_req, res) => {
  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  res.json({ status: "ok", database: "sqlite", users: userCount, time: timestamp() });
});

api.post("/login", (req, res) => {
  const username = cleanUsername(req.body.username);
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!row || !verifyPassword(String(req.body.password || ""), row.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  createSession(row.username, req, res);
  res.json({ user: publicUser(row) });
});

api.post("/logout", (req, res) => {
  const token = req.cookies[sessionCookie] || req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  res.clearCookie(sessionCookie, { path: "/" });
  res.json({ success: true });
});

api.get("/session", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

api.use(requireAuth);

api.get("/users", requireAdmin, (_req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY username COLLATE NOCASE").all().map(publicUser);
  res.json({ users });
});

api.post("/users", requireAdmin, (req, res) => {
  const username = cleanUsername(req.body.username);
  const existing = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (existing) {
    const requestedRole = String(req.body.role ?? existing.role).toLowerCase();
    const isEngineer = requestedRole === "engineer";
    const merged = {
      ...publicUser(existing),
      ...req.body,
      role: requestedRole,
      department: isEngineer ? (req.body.department ?? existing.department) : "N/A",
      allowedRequestTypes: isEngineer
        ? (req.body.allowedRequestTypes ?? publicUser(existing).allowedRequestTypes)
        : [],
    };
    const error = validateAccount(merged, { passwordRequired: false });
    if (error) return res.status(400).json({ error });
    const allowed = isEngineer
      ? merged.allowedRequestTypes.filter((value) => allowedRequestTypes.has(value))
      : [];
    db.prepare(`
      UPDATE users SET fullname = ?, phone = ?, department = ?, role = ?, allowed_request_types = ?,
        password_hash = ?, updated_at = ? WHERE username = ?
    `).run(
      username,
      normalizePhone(merged.phone),
      isEngineer ? String(merged.department).trim().toUpperCase() : "N/A",
      requestedRole,
      JSON.stringify(allowed),
      req.body.password ? hashPassword(String(req.body.password)) : existing.password_hash,
      timestamp(),
      username,
    );
    return res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE username = ?").get(username)) });
  }

  const error = validateAccount(req.body, { roleRequired: true });
  if (error) return res.status(400).json({ error });
  if (!creatableRoles.has(String(req.body.role).toLowerCase())) return res.status(400).json({ error: "Role must be admin, dc, engineer, or head" });
  return res.status(201).json({ user: publicUser(insertUser(req.body)) });
});

api.delete("/users/:username", requireAdmin, (req, res) => {
  const username = cleanUsername(req.params.username);
  if (username === req.user.username.toLowerCase()) return res.status(400).json({ error: "You cannot delete your own account" });
  const changes = db.prepare("DELETE FROM users WHERE username = ?").run(username).changes;
  if (!changes) return res.status(404).json({ error: "User not found" });
  res.json({ success: true });
});

api.get("/projects", (_req, res) => res.json({ projects: listProjects() }));

api.post("/projects", requireAdmin, (req, res) => {
  try {
    const project = normalizeProjectPayload(req.body);
    if (projectExists(project.name) && req.body.allowUpdate !== true) {
      return res.status(409).json({ error: "A project with this name already exists" });
    }
    res.json({ project: saveProject(project) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

api.delete("/projects/:name", requireAdmin, (req, res) => {
  const name = String(req.params.name || "").trim();
  const linkedDocuments = [...allowedCollections].flatMap((collection) => listItems(collection))
    .filter((item) => String(item.project || "") === name).length;
  if (linkedDocuments) {
    return res.status(409).json({ error: "This project has linked document records and cannot be deleted" });
  }
  const changes = db.prepare("DELETE FROM projects WHERE name = ?").run(name).changes;
  if (!changes) return res.status(404).json({ error: "Project not found" });
  const rules = getSetting("location_rules", {});
  delete rules[name];
  setSetting("location_rules", rules);
  res.json({ success: true });
});

api.get("/location-rules", (_req, res) => res.json({ location_rules: getSetting("location_rules", {}) }));

api.post("/location-rules", requireAdmin, (req, res) => {
  try {
    const project = cleanCatalogText(req.body.project, "Project name", { maxLength: 100 });
    if (!projectExists(project)) return res.status(404).json({ error: "Project not found" });
    if (!Array.isArray(req.body.rules) || req.body.rules.length > 200) {
      return res.status(400).json({ error: "Location rules must contain at most 200 entries" });
    }
    const rules = req.body.rules.map((rule) => ({
      pattern: cleanCatalogText(rule?.pattern, "Location pattern", { maxLength: 200 }),
      type: cleanCatalogText(rule?.type, "Location type", { maxLength: 50 }),
      floors: [...new Set((Array.isArray(rule?.floors) ? rule.floors : []).map((floor) => cleanCatalogText(floor, "Location floor", { maxLength: 100 })))],
    }));
    if (new Set(rules.map((rule) => rule.pattern.toLocaleLowerCase())).size !== rules.length) {
      return res.status(400).json({ error: "Location patterns must be unique within a project" });
    }
    const allRules = getSetting("location_rules", {});
    allRules[project] = { rules };
    setSetting("location_rules", allRules);
    res.json({ success: true, location_rules: allRules });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

api.get("/locations", (req, res) => {
  const project = String(req.query.project || "").trim();
  const typesMap = configuredLocations(project);
  const locations = Object.keys(typesMap);
  // Legacy projects may have records but no imported location rules yet.
  if (String(req.query.requestType || "").toUpperCase() !== "TR") {
    for (const item of listItems("irs")) {
      const location = String(item.location || "").trim();
      if (item.project === project && location) locations.push(location);
    }
  }
  res.json({ locations: [...new Set(locations)], types_map: typesMap });
});

api.get("/sd-types", (req, res) => {
  const rules = getSetting("location_rules", {})[String(req.query.project || "")]?.rules || [];
  res.json({ types: [...new Set(rules.map((rule) => rule.type).filter(Boolean))] });
});

api.get("/admin/general-descriptions", requireAdmin, (_req, res) => res.json({
  general_descriptions: getSetting("general_descriptions", {}),
  general_descriptions_cpr: getSetting("general_descriptions_cpr", {}),
  general_descriptions_ppir: getSetting("general_descriptions_ppir", {}),
  general_descriptions_tr: getSetting("general_descriptions_tr", {}),
  general_descriptions_sd: getSetting("general_descriptions_sd", {}),
}));

api.post("/admin/general-descriptions", requireAdmin, (req, res) => {
  try {
    const department = cleanCatalogText(req.body.department, "Department", { maxLength: 50 });
    const key = descriptionCatalogKey(req.body.type);
    const values = getSetting(key, {});
    values[department] = normalizeCatalogObject(req.body.descriptions, "Descriptions", ["base", "floors", "levels"]);
    setSetting(key, values);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

api.delete("/admin/general-descriptions/:department", requireAdmin, (req, res) => {
  const key = descriptionCatalogKey(req.query.type);
  const values = getSetting(key, {});
  delete values[req.params.department];
  setSetting(key, values);
  res.json({ success: true });
});

api.post("/admin/general-descriptions-sd", requireAdmin, (req, res) => {
  try {
    const department = cleanCatalogText(req.body.department, "Department", { maxLength: 50 });
    const values = getSetting("general_descriptions_sd", {});
    values[department] = normalizeCatalogObject(req.body.descriptions, "Shop drawing descriptions", ["base", "elements"]);
    setSetting("general_descriptions_sd", values);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

api.delete("/admin/general-descriptions-sd/:department", requireAdmin, (req, res) => {
  const values = getSetting("general_descriptions_sd", {});
  delete values[req.params.department];
  setSetting("general_descriptions_sd", values);
  res.json({ success: true });
});

api.get("/general-descriptions", (req, res) => {
  const requestType = String(req.query.requestType || "IR").toUpperCase();
  const values = getSetting(descriptionCatalogKey(requestType), {});
  const departmentMap = { ARCH: "Architectural", CIVIL: "Civil", ELECT: "Electrical", MECH: "Mechanical", SURV: "Survey" };
  const rawDepartment = canonicalDepartment(req.query.dept);
  const department = departmentMap[rawDepartment.toUpperCase()] || rawDepartment;
  const selected = values[department] || (requestType === "CPR" ? values.Civil : null) || { base: [], floors: [], levels: [] };
  const base = Array.isArray(selected.base) ? selected.base : [];
  const projectRules = getSetting("location_rules", {})[String(req.query.project || "")]?.rules || [];
  const projectFloors = projectRules.flatMap((rule) => Array.isArray(rule.floors) ? rule.floors : []);
  res.json({
    base: [...new Set((requestType === "TR" && department === "Civil" ? ["SOG", ...base] : base).filter(Boolean))],
    floors: [...new Set([...(Array.isArray(selected.floors) ? selected.floors : []), ...projectFloors].filter(Boolean))],
    levels: [...new Set((Array.isArray(selected.levels) ? selected.levels : []).filter(Boolean))],
    department,
    requestType,
  });
});

for (const [route, key, singular] of [
  ["sheet-titles", "sheet_titles", "sheets"],
  ["subject-titles", "subject_titles", "subjects"],
]) {
  api.get(`/admin/${route}`, requireAdmin, (_req, res) => res.json({ [key]: getSetting(key, {}) }));
  api.get(`/admin/${route}/:department`, requireAdmin, (req, res) => {
    res.json({ [singular]: getSetting(key, {})[req.params.department] || [] });
  });
  api.post(`/admin/${route}`, requireAdmin, (req, res) => {
    try {
      const department = cleanCatalogText(req.body.department, "Department", { maxLength: 50 });
      const values = getSetting(key, {});
      values[department] = normalizeStringCatalog(req.body[singular], singular, { objectEntries: singular === "sheets" });
      setSetting(key, values);
      return res.json({ success: true });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });
  api.delete(`/admin/${route}/:department`, requireAdmin, (req, res) => {
    const values = getSetting(key, {});
    delete values[req.params.department];
    setSetting(key, values);
    res.json({ success: true });
  });
}

// Engineers may read controlled SD catalogs; only administrators can modify them.
for (const [route, key, singular] of [
  ["sheet-titles", "sheet_titles", "sheets"],
  ["subject-titles", "subject_titles", "subjects"],
]) {
  api.get(`/${route}/:department`, (req, res) => {
    res.json({ [singular]: getSetting(key, {})[req.params.department] || [] });
  });
}

function nextCounter(projectName, counterKey) {
  const projects = listProjects();
  const project = projects[projectName] || { name: projectName, description: "", counters: {} };
  project.counters = { ...(project.counters || {}) };
  project.counters[counterKey] = Number(project.counters[counterKey] || 0) + 1;
  saveProject({ ...project, name: projectName });
  return project.counters[counterKey];
}

function projectCode(value) {
  return String(value || "PROJECT").trim().replace(/\s+/g, "-").toUpperCase();
}

function optionalReference(value, field) {
  const normalized = String(value || "").trim();
  if (normalized.length > 500) throw new Error(`${field} must be 500 characters or fewer`);
  return normalized;
}

function normalizeRefDrawings(body) {
  // Legacy aliases are read only during normalization. New records persist one
  // canonical `refDrawings` array and never retain a duplicate SD field.
  const candidates = [body.refDrawings, body.refSD, body.SDAttatch, body.sdAttachment, body.SDattach, body.sdAttach, body.tags?.sd];
  const values = candidates.flatMap((candidate) => Array.isArray(candidate) ? candidate : [candidate])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const seen = new Set();
  const unique = values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length > 20) throw new Error("refDrawings can contain at most 20 references");
  if (unique.some((value) => value.length > 250)) throw new Error("Each refDrawings value must be 250 characters or fewer");
  return unique;
}

function normalizedTags(tags) {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return {};
  const { sd, ...remaining } = tags;
  return remaining;
}

function normalizedInspectionPayload(body) {
  const {
    SDAttatch, SDattach, sdAttachment, sdAttach, refSD, RefMethod,
    source, tags, refDrawings, refDrawing, refMethod,
    ...record
  } = body;
  const isCpr = String(body.requestType || "IR").toUpperCase() === "CPR";
  const canonicalRefDrawings = isCpr ? [] : normalizeRefDrawings({
    ...body,
    tags,
    refDrawings,
  });
  const canonicalRefMethod = isCpr ? "" : optionalReference(refMethod || RefMethod, "refMethod");
  const canonicalTags = normalizedTags(tags);
  return {
    ...record,
    ...(Object.keys(canonicalTags).length ? { tags: canonicalTags } : {}),
    ...(!isCpr ? { refDrawings: canonicalRefDrawings } : {}),
    ...(canonicalRefMethod ? { refMethod: canonicalRefMethod } : {}),
  };
}

function duplicateSerialRequests(item) {
  return listItems("irs")
    .filter((other) => other.id !== item.id
      && other.project === item.project
      && Number(other.serialNumber) === Number(item.serialNumber))
    .map((other) => ({ id: other.id, irNo: other.irNo, requestType: other.requestType || (other.isCPR ? "CPR" : "IR") }));
}

function revisionNumberFor(parentDocumentId) {
  return listItems("revs")
    .filter((revision) => revision.parentDocumentId === parentDocumentId)
    .reduce((highest, revision) => Math.max(highest, Number(revision.revisionNumber) || 0), 0) + 1;
}

function createRevisionForParent(body, { actionSourceId = "" } = {}) {
  const parentDocumentId = String(body.parentDocumentId || "").trim();
  const parent = findItem("irs", parentDocumentId);
  if (!parent) throw new Error("A valid parent IR or CPR is required");
  if (String(body.project || "").trim() !== String(parent.project || "").trim()) throw new Error("Revision project must match its parent document");
  const parentRequestType = String(parent.requestType || (parent.isCPR ? "CPR" : "IR")).toUpperCase();
  if (body.parentRequestType && String(body.parentRequestType).toUpperCase() !== parentRequestType) {
    throw new Error("Revision type must match its parent document");
  }
  if (actionSourceId) {
    const existing = listItems("revs").find((revision) => revision.actionSourceId === actionSourceId);
    if (existing) return { item: existing, created: false };
  }
  const revisionNumber = revisionNumberFor(parentDocumentId);
  const id = crypto.randomUUID();
  const now = timestamp();
  const revisionLabel = String(body.revText || `R${revisionNumber}`).trim().slice(0, 80) || `R${revisionNumber}`;
  const item = saveItem("revs", {
    ...body,
    id,
    uniqueId: id,
    project: parent.project,
    department: parent.department || body.department || "",
    parentDocumentId,
    parentDocumentNumber: parent.irNo || "",
    parentRequestType,
    actionSourceId: actionSourceId || undefined,
    revisionNumber,
    revNo: `${parent.irNo || projectCode(parent.project)}-REV-${String(revisionNumber).padStart(3, "0")}`,
    displayNumber: `REV-${parentRequestType}-${String(revisionNumber).padStart(3, "0")}`,
    userRevNumber: revisionLabel,
    isRevision: true,
    isDone: false,
    isArchived: false,
    sentAt: now,
    createdAt: now,
  });
  return { item, created: true };
}

function createWorkItem(collection, body) {
  const id = crypto.randomUUID();
  const now = timestamp();
  if (collection === "irs") {
    const requestType = String(body.requestType || "IR").toUpperCase();
    if (!creatableInspectionRequestTypes.has(requestType)) throw new Error("Invalid request type");
    if (requestType === "PPIR") {
      if (!String(body.location || "").trim()) throw new Error("Location is required");
      if (!String(body.category || "").trim()) throw new Error("Category is required");
      if (!String(body.desc || "").trim()) throw new Error("Description is required");
      if (!String(body.receivedDate || "").trim()) throw new Error("Received date is required");
    }
    if (requestType === "TR") {
      const location = String(body.location || "").trim();
      const category = String(body.category || "").trim();
      const testAge = String(body.testAge || "").trim();
      if (!location) throw new Error("Location is required");
      if (!Object.hasOwn(configuredLocations(body.project), location)) throw new Error("Select a configured location for this project");
      if (!category) throw new Error("Description is required");
      if (category.length > 250) throw new Error("Description must be 250 characters or fewer");
      const trDescriptions = getSetting("general_descriptions_tr", {}).Civil?.base || [];
      if (!["SOG", ...trDescriptions].includes(category)) throw new Error("Select a configured TR description");
      if (!["7 Days", "28 Days"].includes(testAge)) throw new Error("Test Age must be 7 Days or 28 Days");
      body = {
        project: body.project,
        user: body.user,
        requestType,
        department: "Civil",
        location,
        category,
        testAge,
        desc: `Compressive Strength Test Results for ${category} at ${location} ${testAge}.`,
        receivedDate: cairoDate(),
      };
    }
    const department = canonicalDepartment(body.department || "Civil");
    const departmentCode = documentDepartmentCode(department);
    const counterKey = requestType === "IR"
      ? department
      : requestType === "CPR" ? "CPR" : `${requestType}_${department}`;
    const serial = nextCounter(body.project, counterKey);
    const suffix = String(serial).padStart(3, "0");
    const irNo = requestType === "CPR"
      ? `BADYA-CON-${projectCode(body.project)}-CPR-${suffix}`
      : `BADYA-CON-${projectCode(body.project)}-${requestType}-${departmentCode}-${suffix}`;
    const inspection = normalizedInspectionPayload(body);
    return saveItem(collection, {
      ...inspection, id, uniqueId: id, irNo, serialNumber: serial, requestType,
      isCPR: requestType === "CPR",
      revision: Number(body.revision || 0),
      latestRevision: Number(body.latestRevision || body.revision || 0),
      isDone: false, isArchived: false, sentAt: now, createdAt: now,
    });
  }
  if (collection === "revs") {
    return createRevisionForParent(body).item;
  }
  const department = canonicalDepartment(body.department || "Civil");
  const departmentCode = documentDepartmentCode(department);
  const serial = nextCounter(body.project, `SD_${department}`);
  return saveItem(collection, {
    ...body, id, uniqueId: id,
    sdNo: `${projectCode(body.project)}-SD-${departmentCode}-${String(serial).padStart(3, "0")}`,
    serialNumber: serial, isDone: false, isArchived: false, sentAt: now, createdAt: now,
  });
}

api.get("/dc/queue", requireDocumentControl, (req, res) => {
  const allItems = allDocuments({ archived: false }).filter((item) => documentType(item) !== "SD");
  const filtered = filterDocuments(allItems, req.query);
  const sortDirection = String(req.query.sort || "oldest").toLowerCase() === "newest" ? -1 : 1;
  const group = String(req.query.group || "").toLowerCase();
  const projectTypeOrder = ["IR", "CPR", "TR", "REVISION", "SD"];
  filtered.sort((a, b) => {
    const projectOrder = String(a.project || "").localeCompare(String(b.project || ""));
    const departmentOrder = String(a.department || "").localeCompare(String(b.department || ""));
    const typeOrder = documentType(a).localeCompare(documentType(b));
    const rankedTypeOrder = projectTypeOrder.indexOf(documentType(a)) - projectTypeOrder.indexOf(documentType(b));
    const groupOrder = group === "project-department" ? projectOrder || departmentOrder
      : group === "type-project-department" ? typeOrder || projectOrder || departmentOrder
        : group === "project-type" ? projectOrder || rankedTypeOrder || typeOrder
        : group === "project" ? projectOrder
          : group === "type-project" ? typeOrder || projectOrder
            : group === "type" ? typeOrder : 0;
    return groupOrder || sortDirection * (new Date(documentDate(a) || 0) - new Date(documentDate(b) || 0));
  });
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * pageSize;
  res.json({
    items: filtered.slice(offset, offset + pageSize),
    page,
    pageSize,
    total: filtered.length,
    totalPages: Math.max(Math.ceil(filtered.length / pageSize), 1),
    summary: summarizeDocuments(filtered),
    allSummary: summarizeDocuments(allItems),
    filters: filterOptions(allItems),
  });
});

for (const collection of allowedCollections) {
  api.get(`/${collection}`, (req, res) => {
    const locationTypes = new Map();
    const records = listItems(collection, { includeArchived: false });
    const visibleRecords = records.filter((item) => !isPpirRecord(item));
    const visible = ["admin", "dc"].includes(req.user.role)
      ? visibleRecords
      : visibleRecords.filter((item) => String(item.user || "").toLowerCase() === String(req.user.username).toLowerCase());
    res.json({ [collection]: visible.map((item) => ({ ...item, locationType: locationTypeFor(item, locationTypes) })) });
  });
  api.get(`/${collection}/all`, requireDocumentControl, (_req, res) => {
    const locationTypes = new Map();
    res.json({ [collection]: listItems(collection).filter((item) => !isPpirRecord(item))
      .map((item) => ({ ...item, locationType: locationTypeFor(item, locationTypes) })) });
  });
  api.post(`/${collection}`, (req, res) => {
    if (!req.body.project) return res.status(400).json({ error: "Project is required" });
    if (!projectExists(req.body.project)) return res.status(400).json({ error: "Select an existing project" });
    if (collection === "irs") {
      const requestType = String(req.body.requestType || "IR").toUpperCase();
      if (!creatableInspectionRequestTypes.has(requestType)) return res.status(400).json({ error: "Invalid request type" });
      if (requestType === "TR" && !["admin", "dc"].includes(req.user.role)) {
        return res.status(403).json({ error: "TR requests can only be created in DC Mode" });
      }
      if (req.user.role === "engineer" && !publicUser(req.user).allowedRequestTypes.includes(requestType.toLowerCase())) {
        return res.status(403).json({ error: `You are not allowed to create ${requestType} requests` });
      }
    }
    if (collection === "shopdrawings" && req.user.role === "engineer" && !publicUser(req.user).allowedRequestTypes.includes("sd")) {
      return res.status(403).json({ error: "You are not allowed to create Shop Drawings" });
    }
    if (collection === "revs" && req.user.role === "engineer" && !publicUser(req.user).allowedRequestTypes.some((type) => ["ir", "cpr"].includes(type))) {
      return res.status(403).json({ error: "You are not allowed to create revisions" });
    }
    try {
      const item = createWorkItem(collection, {
        ...req.body,
        user: req.user.username,
        ...(req.user.role === "engineer" ? { department: req.user.department } : {}),
      });
      res.status(201).json({ success: true, item,
        ...(collection === "irs" ? { duplicateSerialRequests: duplicateSerialRequests(item) } : {}),
      });
    } catch (error) {
      if (["Invalid request type", "Location is required", "Select a configured location for this project", "Category is required", "Description is required", "Description must be 250 characters or fewer", "Select a configured TR description", "Test Age must be 7 Days or 28 Days", "Received date is required", "A valid parent IR or CPR is required", "Revision project must match its parent document", "Revision type must match its parent document", "refDrawings can contain at most 20 references", "Each refDrawings value must be 250 characters or fewer"].includes(error.message) || /^refMethod must be 500 characters or fewer$/.test(error.message)) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }
  });
  api.post(`/${collection}/mark-done`, requireDocumentControl, (req, res) => {
    const id = req.body.uniqueId || req.body.id;
    const item = findItem(collection, id);
    if (!item) return res.status(404).json({ error: "Item not found" });
    const updated = saveItem(collection, {
      ...item,
      ...(req.body.irNo ? { irNo: req.body.irNo } : {}),
      isDone: true,
      downloadedBy: req.body.downloadedBy || req.user.username,
      downloadedAt: timestamp(),
    });
    return res.json({ success: true, item: updated });
  });
  api.post(`/${collection}/delete`, requireDocumentControl, (req, res) => {
    const id = req.body.uniqueId || req.body.id;
    if (!deleteItem(collection, id)) return res.status(404).json({ error: "Item not found" });
    return res.json({ success: true });
  });
}

api.post("/archive", requireDocumentControl, (req, res) => {
  const collection = String(req.body.collection || (req.body.isRevision ? "revs" : "irs"));
  if (!allowedCollections.has(collection)) return res.status(400).json({ error: "Invalid collection" });
  const item = findItem(collection, req.body.uniqueId || req.body.id);
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json({ success: true, item: saveItem(collection, {
    ...item, isArchived: true, archivedBy: req.body.role || req.user.role, archivedAt: timestamp(),
  }) });
});

api.post("/unarchive", requireDocumentControl, (req, res) => {
  const collection = String(req.body.collection || (req.body.isRevision ? "revs" : "irs"));
  if (!allowedCollections.has(collection)) return res.status(400).json({ error: "Invalid collection" });
  const item = findItem(collection, req.body.uniqueId || req.body.id);
  if (!item) return res.status(404).json({ error: "Item not found" });
  const restored = { ...item, isArchived: false };
  delete restored.archivedAt;
  delete restored.archivedBy;
  res.json({ success: true, item: saveItem(collection, restored) });
});

api.get("/archive/dc", (req, res) => {
  const allItems = allDocuments({ archived: true });
  const archive = filterDocuments(allItems, req.query);
  archive.sort((a, b) => new Date(b.archivedAt || documentDate(b) || 0) - new Date(a.archivedAt || documentDate(a) || 0));
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 100);
  const requestedPage = Math.max(Number(req.query.page) || 0, 0);
  let cursorOffset = 0;
  try { cursorOffset = Number(JSON.parse(String(req.query.cursors || "{}")).offset || 0); } catch { cursorOffset = 0; }
  const offset = requestedPage > 0
    ? (requestedPage - 1) * pageSize
    : Math.max(Number(req.query.offset) || cursorOffset, 0);
  const pageItems = archive.slice(offset, offset + pageSize);
  res.json({
    archive: pageItems,
    cursors: { offset: offset + pageItems.length },
    hasMore: offset + pageItems.length < archive.length,
    page: requestedPage || Math.floor(offset / pageSize) + 1,
    pageSize,
    total: archive.length,
    totalPages: Math.max(Math.ceil(archive.length / pageSize), 1),
    summary: summarizeDocuments(archive),
    allSummary: summarizeDocuments(allItems),
    filters: filterOptions(allItems),
  });
});

api.post("/update-action", requireDocumentControl, (req, res) => {
  const collection = String(req.body.collection || "irs");
  const action = String(req.body.action || "").toUpperCase();
  if (!allowedCollections.has(collection)) return res.status(400).json({ error: "Invalid collection" });
  if (action && !["A", "B", "C", "D"].includes(action)) return res.status(400).json({ error: "Action must be A, B, C or D" });
  const item = findItem(collection, req.body.uniqueId || req.body.id);
  if (!item) return res.status(404).json({ error: "Item not found" });
  const updated = saveItem(collection, {
    ...item, action, actionUpdatedBy: req.body.updatedBy || req.user.username, actionUpdatedAt: timestamp(),
  });
  const correction = action === "C" && collection === "irs"
    ? createRevisionForParent({
      project: updated.project,
      department: updated.department,
      parentDocumentId: updated.id,
      parentRequestType: updated.requestType || (updated.isCPR ? "CPR" : "IR"),
      revText: `C-${updated.irNo || "REV"}`,
      revNote: "Created from consultant correction action C",
      user: req.user.username,
      revisionType: String(updated.requestType || "IR").toUpperCase() === "CPR" ? "CPR_REVISION" : "IR_REVISION",
    }, { actionSourceId: updated.id })
    : null;
  res.json({ success: true, item: updated, revision: correction?.item || null, revisionCreated: correction?.created || false });
});

api.post("/irs/update-ir-number", requireDocumentControl, (req, res) => {
  const item = findItem("irs", req.body.uniqueId || req.body.id);
  if (!item) return res.status(404).json({ error: "Item not found" });
  const serial = Number(req.body.newSerial);
  if (!Number.isInteger(serial) || serial < 1) return res.status(400).json({ error: "Invalid serial number" });
  const code = projectCode(req.body.project || item.project);
  const department = canonicalDepartment(req.body.department || item.department || "Civil");
  const departmentCode = documentDepartmentCode(department);
  const requestType = String(req.body.requestType || item.requestType || "IR").toUpperCase();
  if (!inspectionRequestTypes.has(requestType)) return res.status(400).json({ error: "Invalid request type" });
  const irNo = requestType === "CPR"
    ? `BADYA-CON-${code}-CPR-${String(serial).padStart(3, "0")}`
    : `BADYA-CON-${code}-${requestType}-${departmentCode}-${String(serial).padStart(3, "0")}`;
  const updated = saveItem("irs", { ...item, irNo, serialNumber: serial });
  res.json({ success: true, irNo, item: updated, duplicateSerialRequests: duplicateSerialRequests(updated) });
});

async function sendWord(res, item, title) {
  const buffer = await createWordDocument(item, title);
  const filename = String(item.irNo || item.sdNo || "contech-document").replace(/[^a-z0-9._-]/gi, "-");
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename="${filename}.docx"`,
    "Content-Length": String(buffer.length),
    "X-Contech-Template": buffer.templateName || "",
  });
  res.send(buffer);
}

api.post("/generate-word", async (req, res, next) => {
  if (String(req.body.requestType || "").toUpperCase() === "PPIR") {
    return res.status(410).json({ error: "PPIR is currently disabled" });
  }
  try { await sendWord(res, req.body, "Inspection Request"); } catch (error) { next(error); }
});

api.post("/dc/documents/:id/word", requireDocumentControl, async (req, res, next) => {
  try {
    const collection = [...allowedCollections].find(name => findItem(name, req.params.id));
    const item = collection && findItem(collection, req.params.id);
    if (!item) return res.status(404).json({ error: "Document not found" });
    if (isPpirRecord(item)) return res.status(410).json({ error: "PPIR is currently disabled" });
    const isCpr = documentType(item) === "CPR";
    const part = String(req.body.part || (isCpr ? "cover" : "main"));
    if (!(isCpr ? ["cover", "checklist"] : ["main"]).includes(part)) {
      return res.status(400).json({ error: "Invalid document download part" });
    }
    const buffer = await createWordDocument(item, "Contech Document", part);
    const wordDownloads = { ...(item.wordDownloads || {}), [part]: { at: timestamp(), by: req.user.username } };
    const complete = isCpr ? Boolean(wordDownloads.cover && wordDownloads.checklist) : true;
    saveItem(collection, { ...item, wordDownloads, isDone: item.isDone || complete,
      downloadedAt: timestamp(), downloadedBy: req.user.username });
    const suffix = isCpr ? `-${part}` : "";
    const filename = `${item.irNo || item.revNo || item.sdNo}${suffix}.docx`.replace(/[^a-z0-9._-]/gi, "-");
    res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`, "X-Contech-Template": buffer.templateName });
    res.send(buffer);
  } catch (error) { next(error); }
});

api.post("/dc/documents/:id/references", requireDocumentControl, (req, res) => {
  const item = findItem("irs", req.params.id);
  if (!item) return res.status(404).json({ error: "Request not found" });
  if (documentType(item) === "CPR") return res.status(400).json({ error: "CPR requests do not use drawing references" });
  try {
    const refDrawings = normalizeRefDrawings({ refDrawings: req.body.refDrawings });
    res.json({ success: true, item: saveItem("irs", { ...item, refDrawings }) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

api.post("/shopdrawings/generate-word", async (req, res, next) => {
  try {
    const item = findItem("shopdrawings", req.body.uniqueId || req.body.id);
    if (!item) return res.status(404).json({ error: "Shop drawing not found" });
    await sendWord(res, item, "Shop Drawing");
  } catch (error) { next(error); }
});

function reportDocuments(query) {
  const scope = String(query.scope || "all").toLowerCase();
  const source = scope === "active"
    ? allDocuments({ archived: false })
    : scope === "archived" ? allDocuments({ archived: true }) : allDocuments();
  return filterDocuments(source, query);
}

function reportRows(items) {
  return items.map((item) => [
    item.irNo || item.revNo || item.sdNo || "",
    documentType(item),
    item.project || "",
    item.department || "",
    item.desc || item.revNote || item.subject || "",
    item.location || item.floor || "",
    item.user || "",
    item.isDone ? "Completed" : "Pending",
    item.action || "",
    reportDate(item),
    item.isArchived ? "Yes" : "No",
  ]);
}

function filterLabel(query) {
  const labels = { scope: "Records", type: "Type", project: "Project", department: "Discipline", location: "Location contains", description: "Description contains", action: "Action", status: "Status", dateFrom: "From", dateTo: "To" };
  return Object.keys(labels)
    .filter((key) => query[key] && query[key] !== "all")
    .map((key) => `${labels[key]}: ${query[key] === "none" ? "No action" : query[key]}`)
    .join("; ");
}

function validateReportFilters(req, res, next) {
  for (const key of ["dateFrom", "dateTo"]) {
    const value = req.query[key];
    if (!value) continue;
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      return res.status(400).json({ error: `${key} must be a valid date (YYYY-MM-DD)` });
    }
  }
  if (req.query.dateFrom && req.query.dateTo && req.query.dateFrom > req.query.dateTo) return res.status(400).json({ error: "From date must be on or before To date" });
  next();
}

api.get("/reports/records", requireDocumentControl, validateReportFilters, (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 25);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) return res.status(400).json({ error: "Invalid pagination: page >= 1, pageSize 1–100" });
  const items = reportDocuments(req.query).sort((a, b) => String(reportDate(b)).localeCompare(String(reportDate(a))) || String(a.id).localeCompare(String(b.id)));
  res.json({ items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) });
});

api.get("/reports/summary", requireDocumentControl, validateReportFilters, (req, res) => {
  const allSource = allDocuments();
  const filtered = reportDocuments(req.query);
  const active = filtered.filter((item) => !item.isArchived);
  const archived = filtered.filter((item) => item.isArchived);
  const recent = [...filtered]
    .sort((a, b) => new Date(documentDate(b) || 0) - new Date(documentDate(a) || 0))
    .slice(0, 10);
  res.json({
    generatedAt: timestamp(),
    active: summarizeDocuments(active),
    archived: summarizeDocuments(archived),
    all: summarizeDocuments(filtered),
    filtered: summarizeDocuments(filtered),
    filters: filterOptions(allSource),
    appliedFilters: filterLabel(req.query),
    recent,
    wordTemplates: getWordTemplateInfo(),
  });
});

api.get("/reports/export.csv", requireDocumentControl, validateReportFilters, (req, res) => {
  const escape = (value) => {
    const text = String(value ?? "");
    const literal = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${literal.replaceAll('"', '""')}"`;
  };
  const header = ["Number", "Type", "Project", "Department", "Description", "Location", "Engineer", "Status", "Action", "Date", "Archived"];
  const rows = reportRows(reportDocuments(req.query));
  const csv = `\ufeff${[header, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")}`;
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="contech-document-report-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
  res.send(csv);
});

api.get("/reports/export.xlsx", requireDocumentControl, validateReportFilters, (req, res) => {
  const items = reportDocuments(req.query);
  const workbook = createReportWorkbook(items, {
    generatedAt: timestamp(),
    filters: filterLabel(req.query),
    project: req.query.project && req.query.project !== "all" ? req.query.project : "All projects",
  });
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="contech-filtered-report-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    "Content-Length": String(workbook.length),
    "X-Contech-Record-Count": String(items.length),
  });
  res.send(workbook);
});

api.get("/excel-files", requireDocumentControl, (_req, res) => {
  res.json({ directory: getExcelDirectory(), files: listExcelFiles() });
});

api.get("/excel-files/:id/preview", requireDocumentControl, (req, res) => {
  try {
    res.json(previewExcelFile(req.params.id, req.query.sheet, req.query.startRow, req.query.pageSize));
  } catch (error) {
    res.status(String(error.message).includes("not found") ? 404 : 400).json({ error: error.message });
  }
});

api.get("/excel-files/:id/download", requireDocumentControl, (req, res) => {
  try {
    const filename = resolveWorkbook(req.params.id);
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(filename))}`,
    });
    res.sendFile(filename);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

function visibleEngineerRecords(req) {
  const ownProjects = new Set(listItems("irs")
    .filter((item) => ["IR", "CPR"].includes(documentType(item))
      && String(item.user || "").toLowerCase() === String(req.user.username || "").toLowerCase())
    .map((item) => item.project));
  return [...listItems("irs"), ...listItems("revs"), ...listItems("shopdrawings")]
    .filter((item) => !isPpirRecord(item))
    .filter((item) => documentType(item) === "TR"
      ? ownProjects.has(item.project)
      : String(item.user || "").toLowerCase() === String(req.user.username || "").toLowerCase());
}

function requireEngineerRecords(req, res, next) {
  if (!new Set(["engineer", "head"]).has(req.user?.role)) {
    return res.status(403).json({ error: "Engineer records are only available to engineers and department heads" });
  }
  next();
}

api.get("/engineer/filter-options", requireAuth, requireEngineerRecords, (req, res) => {
  const records = visibleEngineerRecords(req);
  const projects = [...new Set(records.map((item) => item.project).filter(Boolean))].sort();
  res.json({ projects });
});

api.get("/engineer/records/page", requireAuth, requireEngineerRecords, (req, res) => {
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 50, 1), 200);
  let offset = 0;
  try { offset = Number(JSON.parse(String(req.query.cursors || "{}")).offset || 0); } catch { offset = 0; }
  let records = visibleEngineerRecords(req);
  if (req.query.todayOnly === "true") {
    const today = new Date().toISOString().slice(0, 10);
    records = records.filter((item) => String(item.sentAt || item.createdAt || "").startsWith(today));
  }
  records.sort((a, b) => new Date(b.sentAt || b.createdAt || 0) - new Date(a.sentAt || a.createdAt || 0));
  const page = records.slice(offset, offset + pageSize);
  res.json({ records: page, cursors: { offset: offset + page.length }, hasMore: offset + page.length < records.length });
});

api.get("/admin/system-info", requireAdmin, (_req, res) => {
  const counts = Object.fromEntries([...allowedCollections].map((collection) => [collection, listItems(collection).length]));
  res.json({
    version: "2.0.0",
    database: "SQLite",
    databasePath,
    environment: process.env.NODE_ENV || "development",
    uptime: Math.floor(process.uptime()),
    counts,
  });
});

app.use("/api", api);

const frontendDirectory = path.join(projectDirectory, "dist");
if (fs.existsSync(frontendDirectory)) {
  app.use(staticMiddleware(frontendDirectory));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDirectory, "index.html"));
  });
}

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
});

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const port = Number(process.env.PORT || 5055);
  const host = process.env.HOST || "127.0.0.1";
  app.listen(port, host, () => {
    console.log(`Contech API ready at http://${host}:${port}/api`);
    console.log(`SQLite database: ${databasePath}`);
  });
}
