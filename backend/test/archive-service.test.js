import assert from "node:assert/strict";
import test from "node:test";

import { archiveProjectRequestsConfirmation, projectRequestArchiveKey } from "../../src/archiveService.js";

test("archive UI helpers bind every action to Project, Request Type and optional discipline", () => {
  assert.equal(projectRequestArchiveKey("D6-A1", "IR"), JSON.stringify(["D6-A1", "IR", ""]));
  assert.equal(projectRequestArchiveKey("D6-A1", "CPR", "Civil"), JSON.stringify(["D6-A1", "CPR", "Civil"]));
  assert.match(
    archiveProjectRequestsConfirmation({ project: "D6-A1", requestType: "TR", count: 2 }),
    /archive all TR records for Project D6-A1/i,
  );
  assert.match(
    archiveProjectRequestsConfirmation({ project: "D6-A1", requestType: "TR", count: 2 }),
    /2 active records will be archived/i,
  );
  assert.match(
    archiveProjectRequestsConfirmation({ project: "D6-A1", requestType: "IR", department: "Civil", count: 1 }),
    /IR — Civil records for Project D6-A1/i,
  );
});

