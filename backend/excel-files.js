import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeXml, readZipEntries } from "./office-zip.js";

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(backendDirectory, "..");

function candidateDirectories() {
  const configured = String(process.env.EXCEL_FILES_DIR || "").trim();
  return [
    configured && (path.isAbsolute(configured) ? configured : path.resolve(projectDirectory, configured)),
    path.resolve(projectDirectory, "..", "Files", "ExcelFiles"),
    path.join(projectDirectory, "Files", "ExcelFiles"),
  ].filter(Boolean);
}

export function getExcelDirectory() {
  const candidates = candidateDirectories();
  return candidates.find((directory) => fs.existsSync(directory)) || candidates[0];
}

function workbookFiles() {
  const root = getExcelDirectory();
  if (!root || !fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("~$") && entry.name.toLowerCase().endsWith(".xlsx"))
    .map((entry) => path.join(root, entry.name));
}

function encodeId(filename) {
  return Buffer.from(filename, "utf8").toString("base64url");
}

function decodeId(id) {
  try { return Buffer.from(String(id), "base64url").toString("utf8"); } catch { return ""; }
}

export function resolveWorkbook(id) {
  const root = path.resolve(getExcelDirectory());
  const filename = decodeId(id);
  if (!filename || filename !== path.basename(filename) || !filename.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Invalid Excel file identifier");
  }
  const resolved = path.resolve(root, filename);
  if (!resolved.startsWith(`${root}${path.sep}`) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error("Excel file not found");
  }
  return resolved;
}

function attributes(text) {
  const output = {};
  for (const match of String(text || "").matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    output[match[1]] = decodeXml(match[2]);
  }
  return output;
}

function workbookPackage(filename) {
  const entries = readZipEntries(fs.readFileSync(filename));
  const byName = new Map(entries.map((entry) => [entry.name, entry.data]));
  const workbookXml = byName.get("xl/workbook.xml")?.toString("utf8");
  const relationshipsXml = byName.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbookXml || !relationshipsXml) throw new Error("Invalid Excel workbook structure");

  const relationships = {};
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*?)\/?\s*>/g)) {
    const attrs = attributes(match[1]);
    if (attrs.Id && attrs.Target) relationships[attrs.Id] = attrs.Target;
  }
  const sheets = [];
  for (const match of workbookXml.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?\s*>/g)) {
    const attrs = attributes(match[1]);
    const target = relationships[attrs["r:id"]];
    if (!attrs.name || !target) continue;
    const normalizedTarget = target.startsWith("/")
      ? target.slice(1)
      : path.posix.normalize(path.posix.join("xl", target));
    const sheetXml = byName.get(normalizedTarget)?.toString("utf8") || "";
    const dimension = attributes(sheetXml.match(/<(?:\w+:)?dimension\b([^>]*?)\/?\s*>/)?.[1]).ref || "A1";
    sheets.push({
      name: attrs.name,
      state: attrs.state || "visible",
      path: normalizedTarget,
      dimension,
      rows: rowFromReference(dimension.split(":").pop()),
      columns: columnFromReference(dimension.split(":").pop()) + 1,
    });
  }
  return { byName, sheets };
}

function columnFromReference(reference) {
  const letters = String(reference || "A").match(/[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return Math.max(result - 1, 0);
}

function rowFromReference(reference) {
  return Math.max(Number(String(reference || "1").match(/\d+/)?.[0] || 1), 1);
}

function sharedStrings(byName) {
  const xml = byName.get("xl/sharedStrings.xml")?.toString("utf8");
  if (!xml) return [];
  return [...xml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((match) =>
    [...match[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((text) => decodeXml(text[1])).join(""),
  );
}

function cellValue(cellXml, attrs, strings) {
  const formula = cellXml.match(/<(?:\w+:)?f\b[^>]*>([\s\S]*?)<\/(?:\w+:)?f>/)?.[1];
  if (formula !== undefined) return `=${decodeXml(formula)}`;
  if (attrs.t === "inlineStr") {
    return [...cellXml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((match) => decodeXml(match[1])).join("");
  }
  const raw = cellXml.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
  if (raw === undefined) return "";
  if (attrs.t === "s") return strings[Number(raw)] ?? "";
  if (attrs.t === "b") return raw === "1";
  if (["str", "e"].includes(attrs.t)) return decodeXml(raw);
  const number = Number(raw);
  return Number.isFinite(number) ? number : decodeXml(raw);
}

export function listExcelFiles() {
  return workbookFiles().map((filename) => {
    const stat = fs.statSync(filename);
    let sheets = [];
    let error = "";
    try {
      sheets = workbookPackage(filename).sheets.map(({ path: _path, ...sheet }) => sheet);
    } catch (caught) {
      error = caught.message;
    }
    return {
      id: encodeId(path.basename(filename)),
      name: path.basename(filename),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sheets,
      error,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function previewExcelFile(id, sheetName, startRow = 1, pageSize = 40) {
  const filename = resolveWorkbook(id);
  const workbook = workbookPackage(filename);
  const sheet = workbook.sheets.find((candidate) => candidate.name === sheetName) || workbook.sheets[0];
  if (!sheet) throw new Error("Workbook has no worksheets");
  const xml = workbook.byName.get(sheet.path)?.toString("utf8") || "";
  const strings = sharedStrings(workbook.byName);
  const safeStart = Math.max(Number(startRow) || 1, 1);
  const safeSize = Math.min(Math.max(Number(pageSize) || 40, 1), 100);
  const safeEnd = safeStart + safeSize - 1;
  const maxColumns = Math.min(Math.max(sheet.columns, 1), 30);
  const rows = [];

  for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const rowAttrs = attributes(rowMatch[1]);
    const rowNumber = Number(rowAttrs.r || 0);
    if (rowNumber < safeStart || rowNumber > safeEnd) continue;
    const values = Array(maxColumns).fill("");
    for (const cellMatch of rowMatch[2].matchAll(/<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g)) {
      const cellAttrs = attributes(cellMatch[1]);
      const column = columnFromReference(cellAttrs.r);
      if (column >= maxColumns) continue;
      values[column] = cellValue(cellMatch[2], cellAttrs, strings);
    }
    rows.push({ rowNumber, values });
  }

  return {
    file: path.basename(filename),
    sheet: { name: sheet.name, dimension: sheet.dimension, rows: sheet.rows, columns: sheet.columns },
    startRow: safeStart,
    endRow: safeEnd,
    pageSize: safeSize,
    maxPreviewColumns: maxColumns,
    rows,
    hasMore: safeEnd < sheet.rows,
  };
}
