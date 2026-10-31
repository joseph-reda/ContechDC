import assert from "node:assert/strict";
import test from "node:test";

import { readZipEntries } from "../office-zip.js";
import { createWordDocument, formatWordDate } from "../word.js";

test("Word dates use numeric DD/MM/YYYY without changing the source date portion", () => {
  assert.equal(formatWordDate("2026-09-05"), "05/09/2026");
  assert.equal(formatWordDate("2026-09-05T23:30:00.000Z"), "05/09/2026");
  assert.equal(formatWordDate("2026-09-05T23:30:00+02:00"), "05/09/2026");
  assert.equal(formatWordDate(new Date("2026-09-05T23:30:00.000Z")), "05/09/2026");
  assert.equal(formatWordDate("September 5, 2026"), "05/09/2026");
  assert.equal(formatWordDate("05/09/2026"), "05/09/2026");
  assert.equal(formatWordDate("not a date"), "");
  assert.match(formatWordDate("2026-09-05"), /^\d{2}\/\d{2}\/\d{4}$/);
  assert.doesNotMatch(formatWordDate("September 5, 2026"), /[A-Za-z]/);
});

test("every bundled Word generation path renders date placeholders as DD/MM/YYYY", async () => {
  const sourceDate = "2026-09-05";
  const cases = [
    ...["ARCH", "Civil", "ELECT", "MECH", "SURV"].map((department) => ({ label: `IR ${department}`, item: { requestType: "IR", department, irNo: `IR-${department}` }, part: "main" })),
    { label: "CPR cover", item: { requestType: "CPR", department: "Civil", irNo: "CPR-1" }, part: "main" },
    { label: "CPR checklist", item: { requestType: "CPR", department: "Civil", irNo: "CPR-1" }, part: "checklist" },
    { label: "TR", item: { requestType: "TR", department: "Civil", irNo: "TR-1" }, part: "main" },
    { label: "legacy PPIR template", item: { requestType: "PPIR", department: "Civil", irNo: "PPIR-1" }, part: "main" },
    ...["ARCH", "Civil", "ELECT", "MECH", "SURV"].map((department) => ({ label: `SD ${department}`, item: { department, sdNo: `SD-${department}`, sheets: [] }, part: "main" })),
  ];

  for (const entry of cases) {
    const output = await createWordDocument({
      ...entry.item,
      project: "D6-A1",
      receivedDate: sourceDate,
      location: "A1 - Ground Floor",
      floor: "Ground Floor",
      desc: "Date format test",
    }, entry.label, entry.part);
    const xml = readZipEntries(output)
      .filter((part) => part.name.startsWith("word/") && part.name.endsWith(".xml"))
      .map((part) => part.data.toString("utf8"))
      .join("\n");
    assert.match(xml, /05\/09\/2026/, `${entry.label} must contain the formatted date`);
    assert.doesNotMatch(xml, /2026-09-05|\{\{\s*(?:receiveddate|date|currentdate|todaydate)\s*\}\}/i, `${entry.label} must not retain an old date or date placeholder`);
  }
});

