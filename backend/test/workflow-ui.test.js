import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = (relativePath) => fs.readFileSync(path.resolve(relativePath), "utf8");

test("Engineer workflow groups checklist with attachments and prevents duplicate submissions", () => {
  const engineer = source("src/pages/EngineerPage.jsx");
  const attachmentsHeading = engineer.indexOf("Attachments & References");
  const checklistSelector = engineer.indexOf('value={selectedChecklistId}', attachmentsHeading);
  const finalDescription = engineer.indexOf("Final Description", attachmentsHeading);
  assert.ok(attachmentsHeading >= 0);
  assert.ok(checklistSelector > attachmentsHeading && checklistSelector < finalDescription);
  assert.match(engineer, /if \(saveLock\.current\) return/);
  assert.match(engineer, /if \(revisionSaveLock\.current\) return/);
  assert.match(engineer, /Loading department checklists/);
  assert.match(engineer, /Calculating the authoritative next number/);
  assert.match(engineer, /REV_PARENT_SELECTION_ENABLED = false/);
  assert.match(engineer, /disabled=\{!REV_PARENT_SELECTION_ENABLED/);
  assert.match(engineer, /IR Revision Number \*/);
  assert.match(engineer, /value=\{revChecklistId\}/);
});

test("shared feedback is centered, accessible, dismissible and deduplicated", () => {
  const feedback = source("src/components/Feedback.jsx");
  const styles = source("src/main.css");
  assert.match(feedback, /role=\{type === "error" \? "alert" : "status"\}/);
  assert.match(feedback, /aria-label="Dismiss notification"/);
  assert.match(feedback, /item\.message !== message \|\| item\.type !== type/);
  assert.match(styles, /\.app-notification-stack \{[^}]*top: 50%;[^}]*left: 50%;/);
  assert.match(styles, /transform: translate\(-50%, -50%\)/);
  assert.match(styles, /\.app-loading--inverse/);
});

test("DC revision rows expose revision details and the selected checklist download", () => {
  const dc = source("src/components/dc/DcWorkspacePage.jsx");
  assert.match(dc, /IR Revision Number/);
  assert.match(dc, />Notes</);
  assert.match(dc, /downloadRevisionChecklist/);
  assert.match(dc, /Download checklist/);
  assert.doesNotMatch(dc, /parentDocumentNumber|Parent IR/);
  assert.match(dc, /busyOperations\.current\.has\(id\)/);
});
