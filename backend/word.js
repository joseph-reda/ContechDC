import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checklistLocationCode, validateChecklistSelection } from "./checklists.js";
import { decodeXml, encodeXml, readZipEntries, writeZipEntries } from "./office-zip.js";
import { normalizeChecklistDepartment } from "../src/utils/checklistDepartments.js";

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
  const checklistDepartment = normalizeChecklistDepartment(value);
  if (checklistDepartment === "ARCH") return "ARCH";
  if (checklistDepartment === "ST") return "ST";
  if (checklistDepartment === "MEP") return "MECH";
  if (checklistDepartment === "ELEC") return "ELECT";
  const department = String(value || "ST").trim().replace(/\s+/g, " ").toUpperCase();
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

function resolveTemplate(item) {
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
    level: checklistLocationCode(item.location),
    generalsubject: item.category || item.subject || description,
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
  // Some of the approved checklist files contain a legacy single opening
  // brace (for example, "{ ReceivedDate}}"). Accept that narrow variant so
  // the source template can remain unchanged while still filling the field.
  const placeholders = [...combined.matchAll(/\{\{?\s*([^{}]+?)\s*\}\}/g)];
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function xmlAttribute(fragment, name) {
  return new RegExp(`\\b${escapeRegExp(name)}="([^"]*)"`).exec(fragment)?.[1] || "";
}

function replaceXmlAttribute(fragment, name, value) {
  const pattern = new RegExp(`(\\b${escapeRegExp(name)}=")[^"]*(")`);
  return pattern.test(fragment)
    ? fragment.replace(pattern, `$1${encodeXml(value)}$2`)
    : fragment.replace(/\s*\/>$/, ` ${name}="${encodeXml(value)}"/>`);
}

function mergeRootNamespaces(baseXml, sourceXml, rootName) {
  const rootPattern = new RegExp(`<${escapeRegExp(rootName)}\\b[^>]*>`);
  const baseRoot = rootPattern.exec(baseXml)?.[0];
  const sourceRoot = rootPattern.exec(sourceXml)?.[0];
  if (!baseRoot || !sourceRoot) return baseXml;
  let mergedRoot = baseRoot;
  const existing = new Set([...baseRoot.matchAll(/\s(xmlns(?::[\w.-]+)?)="[^"]*"/g)].map((match) => match[1]));
  for (const match of sourceRoot.matchAll(/\s(xmlns(?::[\w.-]+)?)="([^"]*)"/g)) {
    if (!existing.has(match[1])) {
      mergedRoot = mergedRoot.replace(/>$/, ` ${match[1]}="${match[2]}">`);
      existing.add(match[1]);
    }
  }
  const sourceIgnorable = xmlAttribute(sourceRoot, "mc:Ignorable").split(/\s+/).filter(Boolean);
  if (sourceIgnorable.length) {
    const combined = [...new Set([...xmlAttribute(mergedRoot, "mc:Ignorable").split(/\s+/).filter(Boolean), ...sourceIgnorable])];
    mergedRoot = replaceXmlAttribute(mergedRoot.replace(/>$/, "/>"), "mc:Ignorable", combined.join(" ")).replace(/\/>$/, ">");
  }
  return baseXml.replace(baseRoot, mergedRoot);
}

function replaceMappedElementValues(xml, elementNames, mapping) {
  let output = xml;
  for (const [from, to] of mapping) {
    const pattern = new RegExp(`(<w:(?:${elementNames.join("|")})\\b[^>]*\\bw:val=")${escapeRegExp(from)}(")`, "g");
    output = output.replace(pattern, `$1${to}$2`);
  }
  return output;
}

function mergeStyles(baseXml, checklistXml, namespace) {
  const styles = [...checklistXml.matchAll(/<w:style\b[\s\S]*?<\/w:style>/g)].map((match) => match[0]);
  const styleMap = new Map();
  for (const style of styles) {
    const styleId = xmlAttribute(style, "w:styleId");
    if (styleId) styleMap.set(styleId, `${namespace}_${styleId}`.slice(0, 250));
  }
  const remapped = styles.map((style) => {
    const styleId = xmlAttribute(style, "w:styleId");
    let output = replaceXmlAttribute(style, "w:styleId", styleMap.get(styleId));
    output = output.replace(/\s+w:default="[^"]*"/g, "");
    return replaceMappedElementValues(output, ["basedOn", "next", "link", "pStyle", "rStyle", "tblStyle"], styleMap);
  }).join("");
  let merged = mergeRootNamespaces(baseXml, checklistXml, "w:styles");
  merged = merged.replace("</w:styles>", `${remapped}</w:styles>`);
  return { xml: merged, styleMap };
}

function replaceStyleReferences(xml, styleMap) {
  return replaceMappedElementValues(xml, ["pStyle", "rStyle", "tblStyle", "basedOn", "next", "link", "numStyleLink", "styleLink"], styleMap);
}

function numericIds(xml, attribute) {
  return [...xml.matchAll(new RegExp(`${escapeRegExp(attribute)}="(\\d+)"`, "g"))].map((match) => Number(match[1]));
}

function mergeNumbering(baseXml, checklistXml, checklistBody, styleMap) {
  if (!checklistXml || !/<w:numPr\b/.test(checklistBody)) return { xml: baseXml, body: checklistBody };
  const targetXml = baseXml || checklistXml.replace(
    /(<w:numbering\b[^>]*>)[\s\S]*?(<\/w:numbering>)/,
    "$1$2",
  );
  const abstractBlocks = [...checklistXml.matchAll(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g)].map((match) => match[0]);
  const numBlocks = [...checklistXml.matchAll(/<w:num\b[\s\S]*?<\/w:num>/g)].map((match) => match[0]);
  let nextAbstract = Math.max(-1, ...numericIds(targetXml, "w:abstractNumId")) + 1;
  let nextNum = Math.max(0, ...numericIds(targetXml, "w:numId")) + 1;
  const abstractMap = new Map();
  const numMap = new Map();
  for (const block of abstractBlocks) abstractMap.set(xmlAttribute(block, "w:abstractNumId"), String(nextAbstract++));
  for (const block of numBlocks) numMap.set(xmlAttribute(block, "w:numId"), String(nextNum++));
  const remappedAbstract = abstractBlocks.map((block) => {
    let output = replaceXmlAttribute(block, "w:abstractNumId", abstractMap.get(xmlAttribute(block, "w:abstractNumId")));
    return replaceStyleReferences(output, styleMap);
  }).join("");
  const remappedNums = numBlocks.map((block) => {
    let output = replaceXmlAttribute(block, "w:numId", numMap.get(xmlAttribute(block, "w:numId")));
    for (const [from, to] of abstractMap) {
      output = output.replace(new RegExp(`(<w:abstractNumId\\b[^>]*\\bw:val=")${escapeRegExp(from)}(")`, "g"), `$1${to}$2`);
    }
    return output;
  }).join("");
  let merged = mergeRootNamespaces(targetXml, checklistXml, "w:numbering");
  merged = merged.replace("</w:numbering>", `${remappedAbstract}${remappedNums}</w:numbering>`);
  return { xml: merged, body: replaceMappedElementValues(checklistBody, ["numId"], numMap) };
}

function parseRelationships(xml) {
  return [...String(xml || "").matchAll(/<Relationship\b[^>]*\/>/g)].map((match) => ({
    xml: match[0],
    id: xmlAttribute(match[0], "Id"),
    type: xmlAttribute(match[0], "Type"),
    target: xmlAttribute(match[0], "Target"),
    targetMode: xmlAttribute(match[0], "TargetMode"),
  }));
}

function replaceRelationshipId(xml, from, to) {
  return xml.replace(new RegExp(`(r:(?:id|embed|link)=")${escapeRegExp(from)}(")`, "g"), `$1${to}$2`);
}

function relationshipPartName(partName) {
  return path.posix.join(path.posix.dirname(partName), "_rels", `${path.posix.basename(partName)}.rels`);
}

function setEntry(entries, name, data) {
  const existing = entries.find((entry) => entry.name === name);
  if (existing) existing.data = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  else entries.push({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8") });
}

function entryXml(entries, name) {
  return entries.find((entry) => entry.name === name)?.data.toString("utf8") || "";
}

function addContentTypeOverride(xml, partName, contentType) {
  if (new RegExp(`PartName="${escapeRegExp(partName)}"`).test(xml)) return xml;
  return xml.replace("</Types>", `<Override PartName="${encodeXml(partName)}" ContentType="${contentType}"/></Types>`);
}

function copyChecklistHeaderFooterParts({ baseEntries, checklistEntries, namespace, styleMap, documentRels, contentTypes, checklistBody }) {
  const checklistRels = parseRelationships(entryXml(checklistEntries, "word/_rels/document.xml.rels"));
  const baseRelationshipIds = [...documentRels.matchAll(/\bId="rId(\d+)"/g)].map((match) => Number(match[1]));
  let nextRelationship = Math.max(0, ...baseRelationshipIds) + 1;
  let updatedRels = documentRels;
  let updatedContentTypes = contentTypes;
  let updatedBody = checklistBody;
  for (const relationship of checklistRels.filter((entry) => /\/(?:header|footer)$/.test(entry.type))) {
    const sourcePart = path.posix.normalize(path.posix.join("word", relationship.target));
    const sourceEntry = checklistEntries.find((entry) => entry.name === sourcePart);
    if (!sourceEntry) throw new Error(`Checklist merge failed because ${relationship.target} is missing`);
    const partKind = relationship.type.endsWith("/header") ? "header" : "footer";
    const newBaseName = `${namespace}-${path.posix.basename(sourcePart)}`;
    const newPart = path.posix.join("word", newBaseName);
    const newRelationshipId = `rId${nextRelationship++}`;
    updatedBody = replaceRelationshipId(updatedBody, relationship.id, newRelationshipId);
    let partXml = replaceStyleReferences(sourceEntry.data.toString("utf8"), styleMap);
    const sourcePartRelsName = relationshipPartName(sourcePart);
    const sourcePartRels = entryXml(checklistEntries, sourcePartRelsName);
    if (sourcePartRels) {
      let newPartRels = sourcePartRels;
      for (const partRelationship of parseRelationships(sourcePartRels)) {
        if (!partRelationship.type.endsWith("/image") || partRelationship.targetMode === "External") {
          throw new Error(`Checklist merge does not support ${partRelationship.type.split("/").pop()} relationships in ${path.posix.basename(sourcePart)}`);
        }
        const sourceMediaPart = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePart), partRelationship.target));
        const mediaEntry = checklistEntries.find((entry) => entry.name === sourceMediaPart);
        if (!mediaEntry) throw new Error(`Checklist merge failed because ${partRelationship.target} is missing`);
        const newMediaBase = `${namespace}-${path.posix.basename(sourcePart, ".xml")}-${path.posix.basename(sourceMediaPart)}`;
        const newMediaPart = path.posix.join("word", "media", newMediaBase);
        setEntry(baseEntries, newMediaPart, mediaEntry.data);
        const relativeTarget = path.posix.relative(path.posix.dirname(newPart), newMediaPart);
        newPartRels = newPartRels.replace(partRelationship.xml, replaceXmlAttribute(partRelationship.xml, "Target", relativeTarget));
      }
      setEntry(baseEntries, relationshipPartName(newPart), newPartRels);
    }
    setEntry(baseEntries, newPart, partXml);
    const relationshipXml = replaceXmlAttribute(replaceXmlAttribute(relationship.xml, "Id", newRelationshipId), "Target", newBaseName);
    updatedRels = updatedRels.replace("</Relationships>", `${relationshipXml}</Relationships>`);
    updatedContentTypes = addContentTypeOverride(
      updatedContentTypes,
      `/${newPart}`,
      `application/vnd.openxmlformats-officedocument.wordprocessingml.${partKind}+xml`,
    );
  }
  return { documentRels: updatedRels, contentTypes: updatedContentTypes, checklistBody: updatedBody };
}

function extractBody(xml) {
  const match = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(xml);
  if (!match) throw new Error("Word document is missing its body");
  return match[1];
}

function removeFinalSectionProperties(body) {
  const matches = [...body.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)];
  const finalSection = matches.at(-1);
  if (!finalSection) throw new Error("Word document is missing final section properties");
  return {
    content: `${body.slice(0, finalSection.index)}${body.slice(finalSection.index + finalSection[0].length)}`,
    section: finalSection[0],
  };
}

function validateChecklistBodyRelationships(checklistEntries, checklistBody) {
  const referencedIds = new Set(
    [...checklistBody.matchAll(/r:(?:id|embed|link)="([^"]+)"/g)].map((match) => match[1]),
  );
  const relationships = parseRelationships(entryXml(checklistEntries, "word/_rels/document.xml.rels"));
  for (const relationship of relationships.filter((entry) => referencedIds.has(entry.id))) {
    if (/\/(?:header|footer)$/.test(relationship.type)) continue;
    const kind = relationship.type.split("/").pop() || "unknown";
    throw new Error(`Checklist merge does not support ${kind} relationships in the document body`);
  }
}

function nextPageSection(sectionXml) {
  if (/<w:type\b/.test(sectionXml)) return sectionXml.replace(/<w:type\b[^>]*\/?\s*>/, '<w:type w:val="nextPage"/>');
  return sectionXml.replace(/<w:sectPr\b[^>]*>/, (opening) => `${opening}<w:type w:val="nextPage"/>`);
}

function mergeChecklistDocument(baseEntries, checklistEntries, namespace) {
  const outputEntries = baseEntries.map((entry) => ({ ...entry, data: Buffer.from(entry.data) }));
  let baseDocument = entryXml(outputEntries, "word/document.xml");
  const checklistDocument = entryXml(checklistEntries, "word/document.xml");
  let baseBody = removeFinalSectionProperties(extractBody(baseDocument));
  let checklistBody = removeFinalSectionProperties(extractBody(checklistDocument));
  validateChecklistBodyRelationships(checklistEntries, `${checklistBody.content}${checklistBody.section}`);

  const baseStyles = entryXml(outputEntries, "word/styles.xml");
  const checklistStyles = entryXml(checklistEntries, "word/styles.xml");
  if (!baseStyles || !checklistStyles) throw new Error("Word merge requires styles.xml in both documents");
  const styles = mergeStyles(baseStyles, checklistStyles, namespace);
  setEntry(outputEntries, "word/styles.xml", styles.xml);
  checklistBody.content = replaceStyleReferences(checklistBody.content, styles.styleMap);
  checklistBody.section = replaceStyleReferences(checklistBody.section, styles.styleMap);

  const baseNumbering = entryXml(outputEntries, "word/numbering.xml");
  const numbering = mergeNumbering(
    baseNumbering,
    entryXml(checklistEntries, "word/numbering.xml"),
    checklistBody.content,
    styles.styleMap,
  );
  if (numbering.xml) setEntry(outputEntries, "word/numbering.xml", numbering.xml);
  checklistBody.content = numbering.body;

  let documentRels = entryXml(outputEntries, "word/_rels/document.xml.rels");
  let contentTypes = entryXml(outputEntries, "[Content_Types].xml");
  if (!documentRels || !contentTypes) throw new Error("Word merge requires document relationships and content types");
  if (!baseNumbering && numbering.xml) {
    const numberingRelationship = parseRelationships(entryXml(checklistEntries, "word/_rels/document.xml.rels"))
      .find((entry) => entry.type.endsWith("/numbering"));
    if (!numberingRelationship) throw new Error("Checklist merge failed because its numbering relationship is missing");
    const existingIds = [...documentRels.matchAll(/\bId="rId(\d+)"/g)].map((match) => Number(match[1]));
    const relationshipXml = replaceXmlAttribute(
      replaceXmlAttribute(numberingRelationship.xml, "Id", `rId${Math.max(0, ...existingIds) + 1}`),
      "Target",
      "numbering.xml",
    );
    documentRels = documentRels.replace("</Relationships>", `${relationshipXml}</Relationships>`);
    contentTypes = addContentTypeOverride(
      contentTypes,
      "/word/numbering.xml",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
    );
  }
  const copiedParts = copyChecklistHeaderFooterParts({
    baseEntries: outputEntries,
    checklistEntries,
    namespace,
    styleMap: styles.styleMap,
    documentRels,
    contentTypes,
    checklistBody: `${checklistBody.content}${checklistBody.section}`,
  });
  documentRels = copiedParts.documentRels;
  contentTypes = copiedParts.contentTypes;
  const copiedChecklist = removeFinalSectionProperties(copiedParts.checklistBody);

  baseDocument = mergeRootNamespaces(baseDocument, checklistDocument, "w:document");
  const combinedBody = `${baseBody.content}<w:p><w:pPr>${nextPageSection(baseBody.section)}</w:pPr></w:p>${copiedChecklist.content}${copiedChecklist.section}`;
  baseDocument = baseDocument.replace(/(<w:body\b[^>]*>)[\s\S]*?(<\/w:body>)/, `$1${combinedBody}$2`);
  setEntry(outputEntries, "word/document.xml", baseDocument);
  setEntry(outputEntries, "word/_rels/document.xml.rels", documentRels);
  setEntry(outputEntries, "[Content_Types].xml", contentTypes);

  const checklistSettings = entryXml(checklistEntries, "word/settings.xml");
  let baseSettings = entryXml(outputEntries, "word/settings.xml");
  if (/<w:evenAndOddHeaders\b/.test(checklistSettings) && !/<w:evenAndOddHeaders\b/.test(baseSettings)) {
    baseSettings = baseSettings.replace("</w:settings>", "<w:evenAndOddHeaders/></w:settings>");
    setEntry(outputEntries, "word/settings.xml", baseSettings);
  }
  return outputEntries;
}

export function getWordTemplateInfo() {
  const directories = configuredTemplateDirectories();
  const activeDirectory = directories.find((directory) => fs.existsSync(directory)) || directories[0];
  const templates = activeDirectory && fs.existsSync(activeDirectory)
    ? fs.readdirSync(activeDirectory).filter((name) => name.toLowerCase().endsWith(".docx")).sort()
    : [];
  return { directory: activeDirectory, templates };
}

function renderTemplateEntries(filename, context, omitReferences) {
  return readZipEntries(fs.readFileSync(filename)).map((entry) => {
    if (!entry.name.startsWith("word/") || !entry.name.endsWith(".xml")) return entry;
    const rendered = renderXml(entry.data.toString("utf8"), context);
    return {
      ...entry,
      data: Buffer.from(applyCalibri(omitReferences ? removeReferenceParagraphs(rendered) : rendered, entry.name), "utf8"),
    };
  });
}

export async function createWordDocument(item, title = "Contech Document", part = "main") {
  if (part !== "main") throw new Error("Separate CPR checklist downloads are no longer supported");
  const template = resolveTemplate(item);
  const context = contextFor(item, title);
  const omitReferences = ["CPR", "TR"].includes(String(item.requestType || (item.isCPR ? "CPR" : "IR")).toUpperCase());
  let entries = renderTemplateEntries(template.path, context, omitReferences);
  let checklist;
  if (item.checklistId) {
    checklist = validateChecklistSelection({
      checklistId: item.checklistId,
      requestType: item.requestType || (item.isCPR ? "CPR" : "IR"),
      department: item.department,
      location: item.location,
      requireConfigured: false,
    });
    const checklistEntries = renderTemplateEntries(checklist.templatePath, context, false);
    entries = mergeChecklistDocument(entries, checklistEntries, checklist.id.replace(/[^a-z0-9_-]/gi, "_"));
  }
  const output = writeZipEntries(entries);
  output.templateName = checklist ? `${template.name} + ${checklist.sourceName}` : template.name;
  output.templateDirectory = template.directory;
  return output;
}

export async function createChecklistDocument(item) {
  const requestType = String(item.parentRequestType || item.requestType || (item.isCPR ? "CPR" : "IR")).toUpperCase();
  const checklist = validateChecklistSelection({
    checklistId: item.checklistId,
    requestType,
    department: item.department,
    location: item.location,
    requireConfigured: false,
    requireLocation: false,
  });
  if (!checklist) throw new Error("This revision does not have a selected checklist");
  const entries = renderTemplateEntries(checklist.templatePath, contextFor(item, "Revision Checklist"), false);
  const output = writeZipEntries(entries);
  output.templateName = checklist.sourceName;
  output.templateDirectory = path.dirname(checklist.templatePath);
  return output;
}
