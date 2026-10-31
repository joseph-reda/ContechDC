import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeZipEntries } from "../office-zip.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const columns = Array.from({ length: 21 }, (_, index) => String.fromCharCode(65 + index));
const headers = ["Document number", "Rev.", "Hyperlink", "Latest rev.", "Category", "Description", "Location", "Prototype", "Floor", "Received date", "Return date", "Action", "Status", "Remarks", "Soft copy (PDF)", "FileNet", "Project", "Discipline", "Type", "Submitted by", "Archived"];
const cell = (ref, value = "", style = 0) => `<x:c r="${ref}" s="${style}" t="inlineStr"><x:is><x:t>${value}</x:t></x:is></x:c>`;
const row = (number, values, style = 0) => `<x:row r="${number}">${columns.map((column, index) => cell(`${column}${number}`, values[index], style)).join("")}</x:row>`;
const empty = Array(21).fill("");
const rows = [
  row(1, ["{{PROJECT}}", ...Array(11).fill(""), "{{GENERATED}}"]),
  row(2, empty),
  row(3, ["{{TOTAL}}", ...Array(11).fill(""), "Document control register"]),
  row(4, empty),
  row(5, ["{{FILTERS}}"]),
  row(6, empty),
  row(7, empty),
  row(8, headers, 1),
  row(9, empty),
  row(10, empty, 1),
].join("");
const entries = [
  { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
  { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
  { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8"?><x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets><x:sheet name="Contech Report" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>` },
  { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
  { name: "xl/styles.xml", data: `<?xml version="1.0" encoding="UTF-8"?><x:styleSheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:fonts count="1"><x:font><x:name val="Calibri"/><x:sz val="11"/></x:font></x:fonts><x:fills count="2"><x:fill><x:patternFill patternType="none"/></x:fill><x:fill><x:patternFill patternType="solid"><x:fgColor rgb="FFDAE9F7"/><x:bgColor indexed="64"/></x:patternFill></x:fill></x:fills><x:borders count="1"><x:border><x:left/><x:right/><x:top/><x:bottom/><x:diagonal/></x:border></x:borders><x:cellStyleXfs count="1"><x:xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></x:cellStyleXfs><x:cellXfs count="2"><x:xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><x:xf numFmtId="0" fontId="0" fillId="1" borderId="0" xfId="0"/></x:cellXfs></x:styleSheet>` },
  { name: "xl/worksheets/sheet1.xml", data: `<?xml version="1.0" encoding="UTF-8"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetViews><x:sheetView workbookViewId="0"><x:pane xSplit="1" ySplit="8" topLeftCell="B9" activePane="bottomRight" state="frozen"/></x:sheetView></x:sheetViews><x:sheetFormatPr defaultRowHeight="18"/><x:sheetData>${rows}</x:sheetData></x:worksheet>` },
];
fs.writeFileSync(path.join(directory, "report-register.xlsx"), writeZipEntries(entries));
