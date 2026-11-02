import assert from "node:assert/strict";
import test from "node:test";

import { convertIRToExcelRow, convertToExcelText, copyAllRows, copyFields, copyRow, writeClipboardText } from "../../src/excelClipboardService.js";
import { groupDcSections, rowsInProjectTypeSection } from "../../src/utils/dcSections.js";

test("copy output uses only displayed Description, Location, Type and Received Date", () => {
  const record = { irNo: "BADYA-CON-D6-A3-CPR-001", project: "D6-A3", status: "Pending", user: "engineer", requestType: "CPR", desc: "Concrete pouring request", finalDesc: "Hidden alternative", location: "A3-01-05", receivedDate: "2026-09-08", locationType: "Building" };
  assert.deepEqual(convertIRToExcelRow(record).split("\t"), ["Concrete pouring request", "A3-01-05", "Building", "2026-09-08"]);
  assert.equal(convertToExcelText([record]), "Concrete pouring request\tA3-01-05\tBuilding\t2026-09-08");
  assert.deepEqual(copyFields({ desc: "Visible", finalDesc: "Different", requestType: "IR" }), { description: "Visible", location: "", type: "", receivedDate: "" });
  assert.deepEqual(convertIRToExcelRow({ sdNo: "SD-001", subject: "Shown subject", desc: "Hidden description", finalDesc: "Hidden final description", locationType: "General" }).split("\t"), ["Shown subject", "", "General", ""]);
  assert.equal(convertIRToExcelRow({}), "No description\t\t\t");
  assert.deepEqual(convertIRToExcelRow({ desc: "TR", location: "A1", requestType: "TR", sentAt: "2026-09-07T23:30:00.000Z" }).split("\t"), ["TR", "A1", "", "2026-09-08"]);
});

test("each project and IR/CPR subsection copies only its displayed records", () => {
  const displayed = [
    { id: "a-ir-1", project: "D6-A1", department: "Civil", requestType: "IR", desc: "A1 IR slab", location: "L1", locationType: "Building", receivedDate: "2026-10-08" },
    { id: "b-cpr-1", project: "D6-A2", requestType: "CPR", desc: "A2 CPR pour", location: "L2", locationType: "Zone", receivedDate: "2026-10-08" },
    { id: "a-cpr-1", project: "D6-A1", requestType: "CPR", desc: "A1 CPR pour", location: "L3", locationType: "Zone", receivedDate: "2026-10-08" },
    { id: "a-ir-2", project: "D6-A1", department: "ARCH", requestType: "IR", desc: "A1 IR finish", location: "L4", locationType: "Building", receivedDate: "2026-10-08" },
    { id: "b-ir-1", project: "D6-A2", requestType: "IR", desc: "A2 IR slab", location: "L5", locationType: "Building", receivedDate: "2026-10-08" },
  ];
  const groups = groupDcSections(displayed);
  assert.deepEqual(groups.map((group) => [group.project, group.sections.map((section) => [section.type, section.items.length])]), [["D6-A1", [["IR", 2], ["CPR", 1]]], ["D6-A2", [["IR", 1], ["CPR", 1]]]]);
  assert.deepEqual(groups[0].sections[0].disciplines.map((group) => [group.discipline, group.items.map((item) => item.id)]), [["ARCH", ["a-ir-2"]], ["Civil", ["a-ir-1"]]]);
  const a1Ir = rowsInProjectTypeSection(groups[0].sections[0].items, "D6-A1", "IR");
  assert.deepEqual(a1Ir.map((item) => item.id), ["a-ir-1", "a-ir-2"]);
  assert.equal(convertToExcelText(a1Ir), "A1 IR slab\tL1\tBuilding\t2026-10-08\nA1 IR finish\tL4\tBuilding\t2026-10-08");
  assert.deepEqual(rowsInProjectTypeSection(displayed, "D6-A2", "CPR").map((item) => item.id), ["b-cpr-1"]);
});

test("Copy All writes headerless rows for each independent project and IR/CPR section", async () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const writes = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (value) => { writes.push(value); } } } });
  try {
    const displayed = [
      { project: "D6-A1", requestType: "IR", desc: "A1 IR", location: "L1", locationType: "Building", receivedDate: "2026-10-08" },
      { project: "D6-A2", requestType: "IR", desc: "A2 IR", location: "L2", locationType: "Zone", receivedDate: "2026-10-08" },
      { project: "D6-A1", requestType: "CPR", desc: "A1 CPR", location: "L3", locationType: "Building", receivedDate: "2026-10-08" },
      { project: "D6-A2", requestType: "CPR", desc: "A2 CPR", location: "L4", locationType: "Zone", receivedDate: "2026-10-08" },
    ];
    for (const project of groupDcSections(displayed)) {
      for (const section of project.sections) await copyAllRows(rowsInProjectTypeSection(section.items, project.project, section.type));
    }
    assert.deepEqual(writes, [
      "A1 IR\tL1\tBuilding\t2026-10-08",
      "A1 CPR\tL3\tBuilding\t2026-10-08",
      "A2 IR\tL2\tZone\t2026-10-08",
      "A2 CPR\tL4\tZone\t2026-10-08",
    ]);
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator); else delete globalThis.navigator;
  }
});

test("Copy All uses the single-record format with one record per line", async () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const writes = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (value) => { writes.push(value); } } } });
  try {
    const records = [
      { desc: "First", location: "L1", locationType: "Building", receivedDate: "2026-10-08" },
      { desc: "Second", location: "L2", locationType: "Zone", receivedDate: "2026-10-09" },
    ];
    await copyRow(records[0]);
    await copyAllRows(records);
    assert.equal(writes[1], `${writes[0]}\nSecond\tL2\tZone\t2026-10-09`);
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator); else delete globalThis.navigator;
  }
});

test("clipboard falls back when the browser Clipboard API is denied", async () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let selectedText = "";
  const field = { value: "", style: {}, setAttribute() {}, focus() {}, select() { selectedText = this.value; }, remove() {} };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async () => { throw new Error("Denied"); } } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { body: { appendChild() {} }, activeElement: { focus() {} }, createElement() { return field; }, execCommand(command) { assert.equal(command, "copy"); return true; } } });
  try {
    assert.equal(await writeClipboardText("Visible description\tL1\tBuilding\t2026-10-08"), "Visible description\tL1\tBuilding\t2026-10-08");
    assert.equal(selectedText, "Visible description\tL1\tBuilding\t2026-10-08");
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator); else delete globalThis.navigator;
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument); else delete globalThis.document;
  }
});
