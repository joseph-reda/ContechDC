import fs from "node:fs";
import { encodeXml, readZipEntries, writeZipEntries } from "./office-zip.js";

const templatePath = new URL("./templates/report-register.xlsx", import.meta.url);
const columns = Array.from({ length: 21 }, (_, index) => String.fromCharCode(65 + index));
const widths = [37, 13, 18, 13, 20, 68, 23, 17, 16, 18, 18, 14, 18, 35, 19, 18, 20, 18, 15, 24, 15];

function excelDate(value) {
  if (!value) return "";
  const key = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return String(value);
  const date = new Date(key + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key) return String(value);
  return (date.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
}

function numeric(value) {
  return value === undefined || value === null || value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : String(value);
}

export function reportValues(item) {
  return [
    item.irNo || item.revNo || item.sdNo || "",
    numeric(item.revision),
    item.hyperlink || "",
    numeric(item.latestRevision),
    item.category || item.generalType || "",
    item.desc || item.revNote || item.subject || "",
    item.location || "",
    item.prototype || item.protoType || "",
    item.floor || "",
    excelDate(item.receivedDate || item.sentAt || item.createdAt || item.archivedAt),
    excelDate(item.returnDate || item.returnedAt),
    item.action || "",
    item.isDone ? "Completed" : "Pending",
    item.remarks || "",
    item.pdfUrl || item.softCopy || "",
    item.fileNet || item.filenet || "",
    item.project || "",
    item.department || "",
    item.requestType || (item.sdNo ? "SD" : item.isRevision ? "REVISION" : item.isCPR ? "CPR" : "IR"),
    item.user || "",
    item.isArchived ? "Yes" : "No",
  ];
}

function cell(reference, value, style) {
  const attributes = 'r="' + reference + '" s="' + style + '"';
  if (typeof value === "number" && Number.isFinite(value)) return '<x:c ' + attributes + '><x:v>' + value + '</x:v></x:c>';
  // Inline text is never an Excel formula, even for descriptions beginning with =.
  return '<x:c ' + attributes + ' t="inlineStr"><x:is><x:t xml:space="preserve">' + encodeXml(value) + '</x:t></x:is></x:c>';
}

export function createReportWorkbook(items, { generatedAt = new Date().toISOString(), filters = "", project = "All projects" } = {}) {
  const entries = readZipEntries(fs.readFileSync(templatePath));
  const entry = entries.find(part => part.name === "xl/worksheets/sheet1.xml");
  let xml = entry.data.toString("utf8");
  const styles = [9, 10].map(row => columns.map(column => {
    const match = xml.match(new RegExp('<x:c r="' + column + row + '" s="(\\d+)"'));
    if (!match) throw new Error("The report template is missing body styles");
    return match[1];
  }));
  const headerRows = [...xml.matchAll(/<x:row\b[^>]*r="([1-8])"[^>]*>[\s\S]*?<\/x:row>/g)].map(match => match[0]).join("");
  const lastRow = Math.max(9, items.length + 8);
  const rows = items.map((item, index) => {
    const values = reportValues(item);
    const lines = Math.max(...values.map((value, col) => String(value).split("\n").reduce((total, part) => total + Math.max(1, Math.ceil(part.length / Math.max(8, widths[col] - 4))), 0)));
    const height = Math.min(409, Math.max(41, lines * 15 + 8));
    return '<x:row r="' + (index + 9) + '" ht="' + height + '" customHeight="1">' + values.map((value, col) => cell(columns[col] + (index + 9), value, styles[index % 2][col])).join("") + "</x:row>";
  }).join("");
  const empty = items.length ? "" : '<x:row r="9" ht="41" customHeight="1">' + cell("A9", "No matching records", styles[0][0]) + "</x:row>";
  xml = xml.replace(/<x:sheetData>[\s\S]*?<\/x:sheetData>/, "<x:sheetData>" + headerRows + rows + empty + "</x:sheetData>");
  const context = {
    PROJECT: "Project: " + project,
    TOTAL: "Matching records: " + items.length,
    GENERATED: "Generated: " + generatedAt.replace("T", " ").slice(0, 19) + " UTC",
    FILTERS: "Filters: " + (filters || "All records") + ". Date basis: received date, or submitted date when unavailable.",
  };
  xml = xml.replace(/\{\{(PROJECT|TOTAL|GENERATED|FILTERS)\}\}/g, (_, key) => encodeXml(context[key]));
  xml = xml.replace(/<x:pane[^>]*\/>/, '<x:pane xSplit="1" ySplit="8" topLeftCell="B9" activePane="bottomRight" state="frozen" />');
  xml = xml.replace("<x:sheetViews>", '<x:dimension ref="A1:U' + lastRow + '" /><x:sheetViews>');
  xml = xml.replace("</x:sheetData>", '</x:sheetData><x:autoFilter ref="A8:U' + lastRow + '" />');
  // Keep the wide register readable in Excel. Print on landscape A3 without shrinking to one page.
  xml = xml.replace("</x:worksheet>", '<x:pageSetup paperSize="8" orientation="landscape" scale="100" /></x:worksheet>');
  entry.data = Buffer.from(xml);
  const book = entries.find(part => part.name === "xl/workbook.xml");
  book.data = Buffer.from(book.data.toString().replace("</x:workbook>", '<x:definedNames><x:definedName name="_xlnm.Print_Area" localSheetId="0">\'Contech Report\'!$A$1:$U$' + lastRow + '</x:definedName><x:definedName name="_xlnm.Print_Titles" localSheetId="0">\'Contech Report\'!$1:$8</x:definedName></x:definedNames></x:workbook>'));
  return writeZipEntries(entries);
}
