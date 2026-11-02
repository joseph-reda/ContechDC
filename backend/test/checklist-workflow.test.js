import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  checklistConfiguration,
  checklistLocationCode,
  checklistOptions,
  checklistWorkflowDepartment,
  getChecklistCatalogInfo,
  validateChecklistConfiguration,
  validateChecklistSelection,
} from "../checklists.js";
import { readZipEntries } from "../office-zip.js";
import { createWordDocument } from "../word.js";
import {
  checklistDepartmentDiagnostic,
  normalizeChecklistDepartment,
  normalizeChecklistDepartmentList,
} from "../../src/utils/checklistDepartments.js";

function hashFile(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

test("checklist department normalization uses explicit aliases and exact canonical keys", () => {
  const cases = new Map([
    ["  aRcH  ", "ARCH"],
    ["Architectural   Engineering", "ARCH"],
    [" ST ", "ST"],
    [" civil ", "ST"],
    ["Structural   Engineering", "ST"],
    [" mEp ", "MEP"],
    ["MECH", "MEP"],
    ["Mechanical   Department", "MEP"],
    [" eLeC ", "ELEC"],
    ["ELECT", "ELEC"],
    ["Electrical   Engineering", "ELEC"],
  ]);
  for (const [input, expected] of cases) assert.equal(normalizeChecklistDepartment(input), expected, input);
  for (const input of ["", "AR", "CIV", "ME", "POWER", "MEP-ELEC", "SURV"]) {
    assert.equal(normalizeChecklistDepartment(input), "", input);
  }
  assert.deepEqual(normalizeChecklistDepartmentList([" civil ", "ST", "Structural Engineering"]), ["ST"]);
  assert.throws(() => normalizeChecklistDepartmentList(["POWER"]), /Unrecognized checklist department "POWER"/);
  assert.match(checklistDepartmentDiagnostic("  Power   Systems "), /"POWER SYSTEMS"/);
});

test("checklist eligibility uses the explicit department-to-template-number mapping", () => {
  const catalog = getChecklistCatalogInfo();
  const configuration = checklistConfiguration(null, catalog.templates);
  const options = (department, location, requestType = "IR") => checklistOptions({
    requestType,
    department,
    location,
    configuration,
    approvedTemplates: catalog.templates,
  }).map((entry) => entry.id);

  assert.equal(checklistWorkflowDepartment("Civil"), "ST");
  assert.equal(checklistWorkflowDepartment("MECH"), "MEP");
  assert.equal(checklistWorkflowDepartment("ELECT"), "ELEC");
  assert.equal(checklistLocationCode("Building 1207"), "07");
  assert.equal(checklistLocationCode("Ground Floor"), "");
  assert.deepEqual(options("Civil", "Building 1201"), ["checklist-01", "checklist-02", "checklist-03", "checklist-19"]);
  assert.deepEqual(options("ARCH", "Building 1206"), [
    "checklist-06", "checklist-07", "checklist-08", "checklist-09", "checklist-10",
    "checklist-11", "checklist-12", "checklist-13", "checklist-14", "checklist-15",
    "checklist-16", "checklist-17", "checklist-18", "checklist-19", "checklist-20",
  ]);
  assert.deepEqual(options("MEP", "Zone 27"), [
    "checklist-18", "checklist-26", "checklist-27", "checklist-30", "checklist-31",
    "checklist-36", "checklist-37", "checklist-38", "checklist-39",
  ]);
  assert.deepEqual(options("ELEC", "Zone 27", "CPR"), [
    "checklist-27", "checklist-28", "checklist-29", "checklist-30", "checklist-31",
    "checklist-32", "checklist-33", "checklist-34", "checklist-39",
  ]);
  assert.deepEqual(options("ST", "Building 1206"), options("Civil", "Building 1201"));
  assert.deepEqual(options("ST", "Ground Floor"), options("Civil", "Building 1201"));
  assert.deepEqual(options("ST", ""), options("Civil", "Building 1201"));
  assert.deepEqual(options("ST", "Building 1201", "TR"), []);
  assert.deepEqual(options("  arch  ", "Building 1206"), options("ARCH", "Building 1206"));
  assert.deepEqual(options(" structural   engineering ", "Building 1201"), options("Civil", "Building 1201"));
  assert.deepEqual(options(" mechanical   department ", "Zone 27"), options("MEP", "Zone 27"));
  assert.deepEqual(options(" electrical   engineering ", "Zone 27", "CPR"), options("ELEC", "Zone 27", "CPR"));
  assert.throws(() => options("Power Systems", "Zone 27"), /Unrecognized checklist department "POWER SYSTEMS"/);

  const stChecklistFromDepartmentList = validateChecklistSelection({
    checklistId: "checklist-19",
    requestType: "IR",
    department: "Civil",
    location: "Building 1201",
    configuration,
    approvedTemplates: catalog.templates,
  });
  assert.equal(stChecklistFromDepartmentList.number, "19");
  assert.equal(stChecklistFromDepartmentList.department, "ST");
  assert.equal(stChecklistFromDepartmentList.locationCode, "01");

  assert.throws(() => validateChecklistSelection({
    checklistId: "checklist-06",
    requestType: "IR",
    department: "Civil",
    location: "Building 1201",
    configuration,
    approvedTemplates: catalog.templates,
  }), /not approved|not eligible|no checklist is/i);
  assert.throws(() => validateChecklistSelection({
    checklistId: "checklist-01",
    requestType: "TR",
    department: "Civil",
    location: "Building 1201",
    configuration,
    approvedTemplates: catalog.templates,
  }), /only for IR and CPR/i);
  assert.throws(() => validateChecklistSelection({
    checklistId: "checklist-01",
    requestType: "IR",
    department: "Civil",
    location: "Ground Floor",
    configuration,
    approvedTemplates: catalog.templates,
  }), /must end in two digits/i);
  assert.throws(() => validateChecklistConfiguration({ entries: [{
    id: "../../outside.docx",
    name: "Unsafe",
    departments: ["ST"],
  }] }, catalog.templates), /not approved/i);
  const normalizedConfiguration = validateChecklistConfiguration({ entries: [
    { id: "checklist-18", name: "Shared ARCH/MEP", departments: [" architectural   department ", "MECH"] },
    { id: "checklist-19", name: "Civil alias", departments: [" civil "] },
    { id: "checklist-27", name: "Electrical alias", departments: [" electrical   engineering "] },
  ] }, catalog.templates);
  assert.deepEqual(normalizedConfiguration.entries, [
    { id: "checklist-18", name: "Shared ARCH/MEP", departments: ["ARCH", "MEP"] },
    { id: "checklist-19", name: "Civil alias", departments: ["ST"] },
    { id: "checklist-27", name: "Electrical alias", departments: ["ELEC"] },
  ]);
  assert.throws(() => validateChecklistConfiguration({ entries: [{
    id: "checklist-19", name: "Unknown department", departments: ["Power Systems"],
  }] }, catalog.templates), /Unrecognized checklist department "POWER SYSTEMS"/);
  assert.doesNotMatch(fs.readFileSync(path.resolve("backend", "checklists.js"), "utf8"), /Checklist\.xlsx|\.xlsx/i);
});

test("Word generation uses the same checklist department aliases", async () => {
  const cases = [
    { department: " architectural   engineering ", location: "Building 1206", checklistId: "checklist-06", template: "ARCH.docx" },
    { department: " civil ", location: "Building 1201", checklistId: "checklist-01", template: "ST.docx" },
    { department: " mechanical   department ", location: "Zone 27", checklistId: "checklist-27", template: "MECH.docx" },
    { department: " eLeC ", location: "Zone 27", checklistId: "checklist-27", template: "ELECT.docx" },
  ];
  for (const entry of cases) {
    const output = await createWordDocument({
      requestType: "IR",
      department: entry.department,
      irNo: `QA-${entry.checklistId}`,
      project: "QA",
      location: entry.location,
      desc: "Department alias QA",
      checklistId: entry.checklistId,
      receivedDate: "2026-11-02",
    });
    assert.match(output.templateName, new RegExp(`^${entry.template.replace(".", "\\.")} \\+ `));
  }
  await assert.rejects(() => createWordDocument({
    requestType: "IR",
    department: "Power Systems",
    irNo: "QA-UNKNOWN",
    project: "QA",
    location: "Zone 27",
    desc: "Unknown department QA",
    checklistId: "checklist-27",
  }), /Unrecognized checklist department "POWER SYSTEMS"/);
});

test("IR and CPR Word generation appends the complete selected checklist without changing its source", async () => {
  const catalog = getChecklistCatalogInfo();
  const checklist = validateChecklistSelection({
    checklistId: "checklist-01",
    requestType: "IR",
    department: "Civil",
    location: "Building 1201",
    approvedTemplates: catalog.templates,
    requireConfigured: false,
  });
  const sourceHash = hashFile(checklist.templatePath);

  for (const requestType of ["IR", "CPR"]) {
    const output = await createWordDocument({
      requestType,
      department: "Civil",
      irNo: `BADYA-CON-D6-A1-${requestType}-001`,
      project: "D6-A1",
      location: "Building 1201",
      category: "Concrete Works",
      desc: "Concrete inspection at Building 1201",
      checklistId: "checklist-01",
      receivedDate: "2026-11-02",
    });
    const entries = readZipEntries(output);
    const names = new Set(entries.map((entry) => entry.name));
    const wordXml = entries
      .filter((entry) => entry.name.startsWith("word/") && entry.name.endsWith(".xml"))
      .map((entry) => entry.data.toString("utf8"))
      .join("\n");
    const documentXml = entries.find((entry) => entry.name === "word/document.xml").data.toString("utf8");
    assert.ok(names.has("[Content_Types].xml"));
    assert.ok(names.has("word/document.xml"));
    assert.match(documentXml, /<w:sectPr\b[\s\S]*<w:sectPr\b/, `${requestType} must contain request and checklist sections`);
    assert.match(documentXml, /checklist-01_/, `${requestType} must include remapped checklist styles`);
    assert.ok([...names].some((name) => /^word\/checklist-01-header\d+\.xml$/.test(name)), `${requestType} must include checklist headers`);
    assert.ok([...names].some((name) => /^word\/media\/checklist-01-header\d+-image\d+\.jpeg$/.test(name)), `${requestType} must include checklist images`);
    assert.match(wordXml, /Building 1201/);
    assert.match(wordXml, />\s*01\s*</);
    assert.doesNotMatch(wordXml, /\{\{?\s*(?:receiveddate|location|level)\s*\}\}/i);
    assert.equal(output.templateName.includes(checklist.sourceName), true);
  }
  assert.equal(hashFile(checklist.templatePath), sourceHash, "The checklist source template must remain unchanged");
});
