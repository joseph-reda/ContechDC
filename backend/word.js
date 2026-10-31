import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeXml, encodeXml, readZipEntries, writeZipEntries } from "./office-zip.js";

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(backendDirectory, "..");

const requestTitles = {
  IR: "INSPECTION REQUEST (IR)",
  CPR: "CONCRETE POURING REQUEST (CPR)",
  PPIR: "POST POUR INSPECTION REPORT (PPIR)",
  TR: "TEST REPORT (TR)",
};

const departmentTemplates = {
  ARCH: "ARCH.docx",
  ST: "ST.docx",
  ELECT: "ELECT.docx",
  MECH: "MECH.docx",
  SURV: "SURV.docx",
};

const shopDrawingTemplates = {
  ARCH: "SDARCH.docx",
  ST: "SDST.docx",
  ELECT: "SDELEC.docx",
  MECH: "SDMEP.docx",
  SURV: "SDSUR.docx",
};

function normalizeDepartment(value) {
  const department = String(value || "ST").trim().toUpperCase();
  if (department.includes("ARCH")) return "ARCH";
  if (department.includes("ELECT")) return "ELECT";
  if (department.includes("MECH") || department.includes("MEP")) return "MECH";
  if (department.includes("SURV")) return "SURV";
  return "ST";
}

function configuredTemplateDirectories() {
  const configured = String(process.env.WORD_TEMPLATE_DIR || "").trim();
  return [
    configured && (path.isAbsolute(configured) ? configured : path.resolve(projectDirectory, configured)),
    path.join(projectDirectory, "Files"),
    path.resolve(projectDirectory, "..", "Files"),
    path.join(backendDirectory, "templates"),
  ].filter(Boolean);
}

function resolveTemplate(item, part = "main") {
  if (part === "checklist") {
    const configured = process.env.CPR_CHECKLIST_TEMPLATE;
    const candidates = [
      configured && path.resolve(projectDirectory, configured),
      ...configuredTemplateDirectories().map((directory) => path.join(directory, "CPR-CHECKLIST.docx")),
    ].filter(Boolean);
    const filename = candidates.find((candidate) => fs.existsSync(candidate));
    if (!filename) throw new Error("CPR checklist template is not configured");
    return { path: filename, name: "CPR-CHECKLIST.docx", directory: path.dirname(filename) };
  }
  const department = normalizeDepartment(item.department || item.deptAbbr);
  const isShopDrawing = Boolean(item.sdNo || Array.isArray(item.sheets));
  const requestType = String(item.requestType || (item.isCPR ? "CPR" : "IR")).toUpperCase();
  const templateName = isShopDrawing
    ? (shopDrawingTemplates[department] || "SDARCH.docx")
    : requestType === "CPR"
      ? "CPR.docx"
      : requestType === "TR"
        ? "TR.docx"
      : requestType === "PPIR"
        ? "PPIR.docx"
      : (departmentTemplates[department] || "DEFAULT.docx");

  for (const directory of configuredTemplateDirectories()) {
    const candidate = path.join(directory, templateName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { path: candidate, name: templateName, directory };
    }
  }
  throw new Error(`Word template not found: ${templateName}. Configure WORD_TEMPLATE_DIR.`);
}

function normalizedKey(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function referenceText(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || "").trim()).filter(Boolean).join(", ");
  return String(value || "").trim();
}

export function formatWordDate(value = new Date().toISOString()) {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? "").trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const businessDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (businessDate) return `${businessDate[3]}/${businessDate[2]}/${businessDate[1]}`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = String(parsed.getFullYear()).padStart(4, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${day}/${month}/${year}`;
}

function refSdText(item) {
  const sources = [item.refDrawings, item.refSD, item.SDAttatch, item.sdAttachment, item.SDattach, item.sdAttach, item.tags?.sd];
  const seen = new Set();
  const project = String(item.project || "PROJECT").trim().replace(/\s+/g, "-").toUpperCase();
  const department = normalizeDepartment(item.department || item.deptAbbr);
  const prefix = `BADYA-SD-CON-${project}-${department}-`;
  return sources.flatMap((source) => Array.isArray(source) ? source : [source])
    .flatMap((value) => String(value || "").split(/[\r\n,;]+/))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const existing = /^BADYA-SD-CON-.+?-(?:ARCH|ST|ELECT|MECH|SURV)-(.+)$/i.exec(value);
      return `${prefix}${existing ? existing[1] : value}`;
    })
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

function contextFor(item, title) {
  const requestType = String(item.requestType || (item.isCPR ? "CPR" : "IR")).toUpperCase();
  const date = formatWordDate(item.receivedDate || item.sentAt || item.createdAt || new Date().toISOString());
  const sheets = Array.isArray(item.sheets) ? item.sheets : [];
  const protoTypes = Array.isArray(item.protoTypes)
    ? item.protoTypes.map((entry) => entry?.type || entry).filter(Boolean).join(", ")
    : String(item.protoTypesText || "");
  const baseDescription = String(item.desc || item.revNote || item.subject || "");
  const floorInput = String(item.floorInput || "").trim();
  const description = requestType === "CPR" && floorInput && !baseDescription.toLowerCase().includes(floorInput.toLowerCase())
    ? `${baseDescription} - ${floorInput}`
    : baseDescription;
  // New records use refDrawings. Legacy aliases remain read-compatible so
  // existing IRs still render their references without a database rewrite.
  const omitReferences = requestType === "CPR" || requestType === "TR";
  const refSD = omitReferences ? "" : refSdText(item);
  const referenceMethod = omitReferences ? "" : referenceText(item.refMethod || item.RefMethod);
  return {
    irno: item.irNo || item.revNo || "",
    irnoshort: item.serialNumber ? String(item.serialNumber).padStart(3, "0") : "",
    sdno: item.sdNo || "",
    projectname: item.project || "",
    project: item.project || "",
    description,
    desc: description,
    subject: item.subject || description,
    subjecttitles: item.subject || description,
    receiveddate: date,
    date,
    location: item.location || "",
    currentdate: date,
    todaydate: date,
    requesttype: requestTitles[requestType] || title || requestType,
    department: item.department || "",
    downloadedby: item.downloadedBy || "",
    concretegrade: item.concreteGrade || "",
    pouringelement: item.pouringElement || item.category || "",
    floor: item.floorInput || item.floor || "",
    floorinput: item.floorInput || item.floor || "",
    type: protoTypes || requestType,
    sheettitlesno: String(sheets.length || 0),
    sdattatch: refSD,
    sdattachment: refSD,
    refsd: refSD,
    rsd: refSD,
    refmethod: referenceMethod,
    rm: referenceMethod,
  };
}

function replaceParagraphPlaceholders(paragraphXml, context) {
  const textPattern = /<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g;
  const nodes = [];
  let match;
  while ((match = textPattern.exec(paragraphXml))) {
    nodes.push({ attributes: match[1], text: decodeXml(match[2]) });
  }
  if (nodes.length === 0) return paragraphXml;

  const boundaries = [];
  let cursor = 0;
  for (const node of nodes) {
    boundaries.push({ start: cursor, end: cursor + node.text.length });
    cursor += node.text.length;
  }
  const combined = nodes.map((node) => node.text).join("");
  const placeholders = [...combined.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
  if (placeholders.length === 0) return paragraphXml;

  const nodeTexts = nodes.map((node) => node.text);
  for (const placeholder of placeholders.reverse()) {
    const start = placeholder.index;
    const end = start + placeholder[0].length;
    const startNode = boundaries.findIndex((range) => start >= range.start && start < range.end);
    const endNode = boundaries.findIndex((range) => end > range.start && end <= range.end);
    if (startNode < 0 || endNode < 0) continue;
    const replacement = String(context[normalizedKey(placeholder[1])] ?? "");
    const startOffset = start - boundaries[startNode].start;
    const endOffset = end - boundaries[endNode].start;
    if (startNode === endNode) {
      nodeTexts[startNode] = `${nodeTexts[startNode].slice(0, startOffset)}${replacement}${nodeTexts[startNode].slice(endOffset)}`;
    } else {
      nodeTexts[startNode] = `${nodeTexts[startNode].slice(0, startOffset)}${replacement}`;
      for (let index = startNode + 1; index < endNode; index += 1) nodeTexts[index] = "";
      nodeTexts[endNode] = nodeTexts[endNode].slice(endOffset);
    }
  }

  let nodeIndex = 0;
  return paragraphXml.replace(textPattern, (_whole, attributes) => {
    const value = encodeXml(nodeTexts[nodeIndex]);
    nodeIndex += 1;
    const spaceAttribute = /\bxml:space=/.test(attributes) ? "" : ' xml:space="preserve"';
    return `<w:t${attributes}${spaceAttribute}>${value}</w:t>`;
  });
}

function renderXml(xml, context) {
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => replaceParagraphPlaceholders(paragraph, context));
}

function removeReferenceParagraphs(xml) {
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((match) => decodeXml(match[1])).join("").trim();
    return /^REF\.?\s*(?:Drawings?|Method)\s*:/i.test(text) ? "" : paragraph;
  });
}

const calibriFonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>';

function applyCalibri(xml, name) {
  if (name === "word/styles.xml") {
    if (/<w:docDefaults\b/.test(xml)) {
      if (/<w:rPrDefault\b/.test(xml)) {
        xml = xml.replace(/<w:rPrDefault\b[\s\S]*?<\/w:rPrDefault>/, `<w:rPrDefault><w:rPr>${calibriFonts}</w:rPr></w:rPrDefault>`);
      } else {
        xml = xml.replace(/<w:docDefaults\b[^>]*>/, (opening) => `${opening}<w:rPrDefault><w:rPr>${calibriFonts}</w:rPr></w:rPrDefault>`);
      }
    } else {
      xml = xml.replace(/<w:styles\b[^>]*>/, (opening) => `${opening}<w:docDefaults><w:rPrDefault><w:rPr>${calibriFonts}</w:rPr></w:rPrDefault></w:docDefaults>`);
    }
  }
  return xml.replace(/<w:rFonts\b[^>]*\/?\s*>/g, calibriFonts);
}

export function getWordTemplateInfo() {
  const directories = configuredTemplateDirectories();
  const activeDirectory = directories.find((directory) => fs.existsSync(directory)) || directories[0];
  const templates = activeDirectory && fs.existsSync(activeDirectory)
    ? fs.readdirSync(activeDirectory).filter((name) => name.toLowerCase().endsWith(".docx")).sort()
    : [];
  return { directory: activeDirectory, templates };
}

export async function createWordDocument(item, title = "Contech Document", part = "main") {
  const template = resolveTemplate(item, part);
  const context = contextFor(item, title);
  const omitReferences = ["CPR", "TR"].includes(String(item.requestType || (item.isCPR ? "CPR" : "IR")).toUpperCase());
  const entries = readZipEntries(fs.readFileSync(template.path)).map((entry) => {
    if (!entry.name.startsWith("word/") || !entry.name.endsWith(".xml")) return entry;
    const rendered = renderXml(entry.data.toString("utf8"), context);
    return { ...entry, data: Buffer.from(applyCalibri(omitReferences ? removeReferenceParagraphs(rendered) : rendered, entry.name), "utf8") };
  });
  const output = writeZipEntries(entries);
  output.templateName = template.name;
  output.templateDirectory = template.directory;
  return output;
}
