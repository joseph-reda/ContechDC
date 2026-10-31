import assert from "node:assert/strict";
import test from "node:test";

import { displayTimestamp, documentReferences } from "../../src/utils/documentDisplay.js";

test("document references keep IR attachments, drawing references and method separate", () => {
  const details = documentReferences({
    tags: { engineer: ["IR-01", "IR-02"], sd: ["SD-01"] },
    irAttach: ["IR-01"],
    refDrawings: ["SD-01", "SD-02"],
    refSD: "SD-02",
    refMethod: "MS-03",
  });
  assert.deepEqual(details, {
    irAttach: ["IR-01", "IR-02"],
    refSD: ["SD-01", "SD-02"],
    refMethod: "MS-03",
  });
});

test("submission timestamp shows Cairo hour and minute without inventing a time for date-only records", () => {
  assert.deepEqual(displayTimestamp("2026-01-05T08:34:00.000Z"), { date: "05 Jan 2026", time: "10:34" });
  assert.deepEqual(displayTimestamp("2026-01-05"), { date: "05 Jan 2026", time: "" });
});
