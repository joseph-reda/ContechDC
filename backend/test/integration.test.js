import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const testDatabase = path.resolve("backend", "data", `test-${process.pid}.sqlite`);
const testTemplates = path.resolve("backend", "data", `test-templates-${process.pid}`);
fs.mkdirSync(testTemplates, { recursive: true });
process.env.DATABASE_FILE = testDatabase;
process.env.INITIAL_ADMIN_USERNAME = "testadmin";
process.env.INITIAL_ADMIN_PASSWORD = "AdminTest@123";
process.env.WORD_TEMPLATE_DIR = testTemplates;
process.env.EXCEL_FILES_DIR = testTemplates;

const { app } = await import("../server.js");
const { db, findItem, saveItem, saveProject } = await import("../db.js");
const { formatWordDate } = await import("../word.js");
const { readZipEntries, writeZipEntries } = await import("../office-zip.js");
const { getChecklistCatalogInfo } = await import("../checklists.js");
const ppirTemplate = readZipEntries(fs.readFileSync(path.resolve("backend", "templates", "PPIR.docx")));
fs.copyFileSync(path.resolve("backend", "templates", "report-register.xlsx"), path.join(testTemplates, "report-register.xlsx"));
for (const name of ["ST.docx", "ARCH.docx", "ELECT.docx"]) {
  const entries = ppirTemplate.map((entry) => entry.name === "word/document.xml"
    ? { ...entry, data: Buffer.from(entry.data.toString("utf8").replace("<w:sectPr>", '<w:p><w:r><w:t>REF.Drawings: {{refSD}}</w:t></w:r></w:p><w:p><w:r><w:t>REF.Method: {{RefMethod}}</w:t></w:r></w:p><w:sectPr>')) }
    : entry);
  fs.writeFileSync(path.join(testTemplates, name), writeZipEntries(entries));
}

function request(baseUrl, pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
}

test("account, project and request workflow works without external services", async (context) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDatabase}${suffix}`, { force: true });
    fs.rmSync(testTemplates, { recursive: true, force: true });
  });

  const health = await request(baseUrl, "/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).database, "sqlite");

  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const adminLogin = await request(baseUrl, "/login", {
    method: "POST",
    body: JSON.stringify({ username: "testadmin", password: "AdminTest@123" }),
  });
  assert.equal(adminLogin.status, 200);
  assert.doesNotMatch(adminLogin.headers.get("set-cookie"), /; Secure(?:;|$)/);
  if (previousEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment;
  const adminCookie = adminLogin.headers.get("set-cookie").split(";", 1)[0];

  const project = await request(baseUrl, "/projects", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ name: "D6-A1", description: "Test project", counters: {} }),
  });
  assert.equal(project.status, 200);
  const projectLocations = await request(baseUrl, "/location-rules", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ project: "D6-A1", rules: [
      { pattern: "A1", type: "Building", floors: ["Ground Floor"] },
      { pattern: "Building A1-04-01", type: "SOG Area", floors: [] },
    ] }),
  });
  assert.equal(projectLocations.status, 200);

  const invalidProject = await request(baseUrl, "/projects", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ name: "   ", description: "Invalid", counters: {} }),
  });
  assert.equal(invalidProject.status, 400);

  const duplicateProject = await request(baseUrl, "/projects", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ name: "d6-a1", description: "Duplicate", counters: {} }),
  });
  assert.equal(duplicateProject.status, 409);

  const unknownProjectRules = await request(baseUrl, "/location-rules", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ project: "NOT-A-PROJECT", rules: [] }),
  });
  assert.equal(unknownProjectRules.status, 404);

  const removableProject = await request(baseUrl, "/projects", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ name: "QA-REMOVE", description: "Temporary isolated test project", counters: { Civil: 0 } }),
  });
  assert.equal(removableProject.status, 200);
  const savedLocationRules = await request(baseUrl, "/location-rules", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ project: "QA-REMOVE", rules: [{ pattern: "QA Zone", type: "IR", floors: ["Ground Floor"] }] }),
  });
  assert.equal(savedLocationRules.status, 200);
  const locations = await request(baseUrl, "/locations?project=QA-REMOVE", { headers: { Cookie: adminCookie } });
  assert.deepEqual((await locations.json()).locations, ["QA Zone - Ground Floor"]);
  const deletedProject = await request(baseUrl, "/projects/QA-REMOVE", {
    method: "DELETE",
    headers: { Cookie: adminCookie },
  });
  assert.equal(deletedProject.status, 200);

  const savedSheets = await request(baseUrl, "/admin/sheet-titles", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ department: "Civil", sheets: [{ title: "QA Test Sheet", abbr: "QTS" }] }),
  });
  assert.equal(savedSheets.status, 200);
  const loadedSheets = await request(baseUrl, "/admin/sheet-titles", { headers: { Cookie: adminCookie } });
  assert.equal(loadedSheets.status, 200);
  assert.deepEqual((await loadedSheets.json()).sheet_titles.Civil, [{ title: "QA Test Sheet", abbr: "QTS" }]);

  const publicRegistration = await request(baseUrl, "/register", {
    method: "POST",
    body: JSON.stringify({ username: "not.allowed", password: "123456" }),
  });
  assert.equal(publicRegistration.status, 401);

  const registration = await request(baseUrl, "/users", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({
      username: "engineer.one",
      password: "123456",
      phone: "+20 10 1234 5678",
      role: "engineer",
      department: "ST",
      allowedRequestTypes: ["ir"],
    }),
  });
  assert.equal(registration.status, 201);
  const registeredUser = (await registration.json()).user;
  assert.equal(registeredUser.role, "engineer");
  assert.equal(registeredUser.phone, "+20 10 1234 5678");

  const engineerLogin = await request(baseUrl, "/login", {
    method: "POST",
    body: JSON.stringify({ username: "engineer.one", password: "123456" }),
  });
  assert.equal(engineerLogin.status, 200);
  const engineerCookie = engineerLogin.headers.get("set-cookie").split(";", 1)[0];

  const irDescriptionsResponse = await request(
    baseUrl,
    "/general-descriptions?project=D6-A1&dept=ST&requestType=IR",
    { headers: { Cookie: engineerCookie } },
  );
  assert.equal(irDescriptionsResponse.status, 200);
  const irDescriptions = await irDescriptionsResponse.json();
  assert.ok(irDescriptions.base.length > 0);
  assert.ok(irDescriptions.floors.length > 0);
  assert.equal(irDescriptions.department, "Civil");

  const ppirDescriptionsResponse = await request(
    baseUrl,
    "/general-descriptions?project=D6-A1&dept=ST&requestType=PPIR",
    { headers: { Cookie: engineerCookie } },
  );
  assert.equal(ppirDescriptionsResponse.status, 200);
  const ppirDescriptions = await ppirDescriptionsResponse.json();
  assert.ok(ppirDescriptions.base.some((value) => value.includes("Post-Pour")));

  const trDescriptionsResponse = await request(
    baseUrl,
    "/general-descriptions?project=D6-A1&dept=ST&requestType=TR",
    { headers: { Cookie: engineerCookie } },
  );
  assert.equal(trDescriptionsResponse.status, 200);
  const trDescriptions = await trDescriptionsResponse.json();
  assert.ok(trDescriptions.base.some((value) => value.includes("Test")));

  const adminCatalogResponse = await request(baseUrl, "/admin/general-descriptions", {
    headers: { Cookie: adminCookie },
  });
  assert.equal(adminCatalogResponse.status, 200);
  const adminCatalogs = await adminCatalogResponse.json();
  assert.ok(adminCatalogs.general_descriptions_ppir.Civil.base.length > 0);
  assert.ok(adminCatalogs.general_descriptions_tr.Civil.base.length > 0);

  const engineerChecklistAdmin = await request(baseUrl, "/admin/checklists", { headers: { Cookie: engineerCookie } });
  assert.equal(engineerChecklistAdmin.status, 403);
  const adminChecklistsResponse = await request(baseUrl, "/admin/checklists", { headers: { Cookie: adminCookie } });
  assert.equal(adminChecklistsResponse.status, 200);
  const adminChecklists = await adminChecklistsResponse.json();
  assert.ok(adminChecklists.templates.some((template) => template.id === "checklist-01"));
  assert.deepEqual(adminChecklists.mapping.ST, [1, 2, 3, 19]);
  const adminDepartmentAliases = { ARCH: " architectural   engineering ", ST: " civil ", MEP: " mech ", ELEC: " electrical   department " };
  const savedChecklistConfig = await request(baseUrl, "/admin/checklists", {
    method: "PUT",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ entries: adminChecklists.entries.map((entry) => ({
      ...entry,
      departments: entry.departments.map((department) => adminDepartmentAliases[department]),
    })) }),
  });
  assert.equal(savedChecklistConfig.status, 200);
  const savedChecklistEntries = (await savedChecklistConfig.json()).entries;
  assert.ok(savedChecklistEntries.every((entry) => entry.departments.every((department) => ["ARCH", "ST", "MEP", "ELEC"].includes(department))));
  const unauthorizedChecklistConfig = await request(baseUrl, "/admin/checklists", {
    method: "PUT",
    headers: { Cookie: engineerCookie },
    body: JSON.stringify({ entries: adminChecklists.entries }),
  });
  assert.equal(unauthorizedChecklistConfig.status, 403);
  const unsafeChecklistConfig = await request(baseUrl, "/admin/checklists", {
    method: "PUT",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ entries: [{ id: "../../outside.docx", name: "Unsafe", departments: ["ST"] }] }),
  });
  assert.equal(unsafeChecklistConfig.status, 400);
  const unknownChecklistDepartmentConfig = await request(baseUrl, "/admin/checklists", {
    method: "PUT",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ entries: [{ id: "checklist-19", name: "Unknown", departments: ["Power Systems"] }] }),
  });
  assert.equal(unknownChecklistDepartmentConfig.status, 400);
  const unknownChecklistDepartmentConfigBody = await unknownChecklistDepartmentConfig.json();
  assert.equal(unknownChecklistDepartmentConfigBody.code, "CHECKLIST_DEPARTMENT_UNRECOGNIZED");
  assert.match(unknownChecklistDepartmentConfigBody.error, /Unrecognized checklist department "POWER SYSTEMS"/);

  const customFloor = await request(baseUrl, "/admin/general-descriptions", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ department: "Civil", type: "IR", descriptions: {
      ...adminCatalogs.general_descriptions.Civil,
      floors: [...adminCatalogs.general_descriptions.Civil.floors, "Mezzanine East"],
    } }),
  });
  assert.equal(customFloor.status, 200);
  const floorsAfterSave = await request(baseUrl, "/general-descriptions?project=D6-A1&dept=ST&requestType=IR", {
    headers: { Cookie: engineerCookie },
  });
  assert.ok((await floorsAfterSave.json()).floors.includes("Mezzanine East"));

  const engineerSubjectCatalog = await request(baseUrl, "/subject-titles/Civil", {
    headers: { Cookie: engineerCookie },
  });
  assert.equal(engineerSubjectCatalog.status, 200);
  assert.deepEqual((await engineerSubjectCatalog.json()).subjects, []);

  const engineerSheetCatalog = await request(baseUrl, "/sheet-titles/Civil", {
    headers: { Cookie: engineerCookie },
  });
  assert.equal(engineerSheetCatalog.status, 200);
  assert.deepEqual((await engineerSheetCatalog.json()).sheets, [{ title: "QA Test Sheet", abbr: "QTS" }]);

  const dcAccount = await request(baseUrl, "/users", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({
      username: "dc.one",
      password: "123456",
      phone: "01000000000",
      role: "dc",
      department: "ST",
      allowedRequestTypes: ["ir", "cpr"],
    }),
  });
  assert.equal(dcAccount.status, 201);
  const dcUser = (await dcAccount.json()).user;
  assert.equal(dcUser.department, "N/A");
  assert.deepEqual(dcUser.allowedRequestTypes, []);
  assert.equal(dcUser.phone, "01000000000");
  const dcLogin = await request(baseUrl, "/login", {
    method: "POST",
    body: JSON.stringify({ username: "dc.one", password: "123456" }),
  });
  assert.equal(dcLogin.status, 200);
  const dcCookie = dcLogin.headers.get("set-cookie").split(";", 1)[0];

  const missingRole = await request(baseUrl, "/users", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ username: "missing.role", password: "123456" }),
  });
  assert.equal(missingRole.status, 400);

  const incompleteEngineer = await request(baseUrl, "/users", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ username: "engineer.two", password: "123456", role: "engineer" }),
  });
  assert.equal(incompleteEngineer.status, 400);

  const reportEngineer = await request(baseUrl, "/users", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({
      username: "engineer.reports",
      password: "123456",
      role: "engineer",
      department: "ST",
      allowedRequestTypes: ["ir"],
    }),
  });
  assert.equal(reportEngineer.status, 201);

  const reportLogin = await request(baseUrl, "/login", {
    method: "POST",
    body: JSON.stringify({ username: "engineer.reports", password: "123456" }),
  });
  assert.equal(reportLogin.status, 200);
  const reportEngineerCookie = reportLogin.headers.get("set-cookie").split(";", 1)[0];

  const checklistOptionsResponse = await request(
    baseUrl,
    "/checklists/options?requestType=IR&department=ARCH",
    { headers: { Cookie: engineerCookie } },
  );
  assert.equal(checklistOptionsResponse.status, 200);
  const engineerChecklistOptions = (await checklistOptionsResponse.json()).options;
  assert.deepEqual(engineerChecklistOptions.map((option) => option.id), ["checklist-01", "checklist-02", "checklist-03", "checklist-19"]);
  assert.deepEqual(engineerChecklistOptions.map((option) => option.number), ["01", "02", "03", "19"]);
  const normalizedDepartmentLookups = [
    { department: "  aRcH  ", canonical: "ARCH", ids: ["checklist-06", "checklist-07", "checklist-08", "checklist-09", "checklist-10", "checklist-11", "checklist-12", "checklist-13", "checklist-14", "checklist-15", "checklist-16", "checklist-17", "checklist-18", "checklist-19", "checklist-20"] },
    { department: " structural   engineering ", canonical: "ST", ids: ["checklist-01", "checklist-02", "checklist-03", "checklist-19"] },
    { department: " mechanical   department ", canonical: "MEP", ids: ["checklist-18", "checklist-26", "checklist-27", "checklist-30", "checklist-31", "checklist-36", "checklist-37", "checklist-38", "checklist-39"] },
    { department: " eLeCt ", canonical: "ELEC", ids: ["checklist-27", "checklist-28", "checklist-29", "checklist-30", "checklist-31", "checklist-32", "checklist-33", "checklist-34", "checklist-39"] },
  ];
  for (const lookup of normalizedDepartmentLookups) {
    const response = await request(
      baseUrl,
      `/checklists/options?requestType=IR&department=${encodeURIComponent(lookup.department)}`,
      { headers: { Cookie: adminCookie } },
    );
    assert.equal(response.status, 200, lookup.department);
    const body = await response.json();
    assert.equal(body.department, lookup.canonical);
    assert.deepEqual(body.options.map((option) => option.id), lookup.ids);
  }
  const unknownDepartmentLookup = await request(
    baseUrl,
    "/checklists/options?requestType=IR&department=Power%20Systems",
    { headers: { Cookie: adminCookie } },
  );
  assert.equal(unknownDepartmentLookup.status, 400);
  const unknownDepartmentLookupBody = await unknownDepartmentLookup.json();
  assert.equal(unknownDepartmentLookupBody.code, "CHECKLIST_DEPARTMENT_UNRECOGNIZED");
  assert.match(unknownDepartmentLookupBody.error, /Unrecognized checklist department "POWER SYSTEMS"/);
  const unrelatedChecklistOptions = await request(
    baseUrl,
    "/checklists/options?requestType=TR&department=ST",
    { headers: { Cookie: engineerCookie } },
  );
  assert.deepEqual((await unrelatedChecklistOptions.json()).options, []);
  const invalidChecklistRequest = await request(baseUrl, "/irs", {
    method: "POST",
    headers: { Cookie: engineerCookie },
    body: JSON.stringify({
      project: "D6-A1",
      department: "ST",
      requestType: "IR",
      location: "Building A1-04-01",
      desc: "Invalid checklist selection",
      checklistId: "checklist-06",
    }),
  });
  assert.equal(invalidChecklistRequest.status, 400);

  const firstNumberPreviewResponse = await request(
    baseUrl,
    "/irs/next-number?project=D6-A1&requestType=IR&department=ARCH",
    { headers: { Cookie: engineerCookie } },
  );
  assert.equal(firstNumberPreviewResponse.status, 200);
  const firstNumberPreview = await firstNumberPreviewResponse.json();
  assert.equal(firstNumberPreview.department, "Civil", "Engineer department must be authoritative");
  assert.equal(firstNumberPreview.counterKey, "Civil");
  assert.equal(firstNumberPreview.irNo, "BADYA-CON-D6-A1-IR-ST-001");
  const architecturePreviewResponse = await request(
    baseUrl,
    "/irs/next-number?project=D6-A1&requestType=IR&department=ARCH",
    { headers: { Cookie: adminCookie } },
  );
  assert.equal((await architecturePreviewResponse.json()).irNo, "BADYA-CON-D6-A1-IR-ARCH-001");
  const cprPreviewResponse = await request(
    baseUrl,
    "/irs/next-number?project=D6-A1&requestType=CPR&department=Civil",
    { headers: { Cookie: adminCookie } },
  );
  assert.equal((await cprPreviewResponse.json()).irNo, "BADYA-CON-D6-A1-CPR-001");

  const createdRequest = await request(baseUrl, "/irs", {
    method: "POST",
    headers: { Cookie: engineerCookie },
    body: JSON.stringify({
      project: "D6-A1",
      department: "ST",
      requestType: "IR",
      location: "Building A1-04-01",
      desc: "Concrete inspection",
      user: "engineer.one",
      checklistId: "checklist-01",
    }),
  });
  assert.equal(createdRequest.status, 201);
  const item = (await createdRequest.json()).item;
  assert.equal(item.irNo, firstNumberPreview.irNo, "The server preview must match the assigned IR number");
  assert.match(item.irNo, /^BADYA-CON-D6-A1-IR-ST-001$/);
  assert.equal(item.checklistId, "checklist-01");
  assert.equal(item.checklistName, "Checklist for Concrete Pouring Request");
  const refreshedChecklistRequest = await request(baseUrl, "/irs", { headers: { Cookie: engineerCookie } });
  const refreshedItem = (await refreshedChecklistRequest.json()).irs.find((record) => record.id === item.id);
  assert.equal(refreshedItem.checklistId, "checklist-01");
  const nextNumberPreviewResponse = await request(
    baseUrl,
    "/irs/next-number?project=D6-A1&requestType=IR",
    { headers: { Cookie: engineerCookie } },
  );
  assert.equal(nextNumberPreviewResponse.status, 200);
  const nextNumberPreview = await nextNumberPreviewResponse.json();
  assert.equal(nextNumberPreview.serialNumber, 2);
  assert.equal(nextNumberPreview.irNo, "BADYA-CON-D6-A1-IR-ST-002");
  const stalePreviewSubmission = await request(baseUrl, "/irs", {
    method: "POST",
    headers: { Cookie: engineerCookie },
    body: JSON.stringify({
      project: "D6-A1",
      requestType: "IR",
      location: "Building A1-04-01",
      desc: "Must not consume a number from a stale preview",
      expectedIrNo: firstNumberPreview.irNo,
    }),
  });
  assert.equal(stalePreviewSubmission.status, 409);
  assert.equal((await stalePreviewSubmission.json()).preview.irNo, nextNumberPreview.irNo);
  const previewAfterRejectedStaleSubmission = await request(baseUrl, "/irs/next-number?project=D6-A1&requestType=IR", { headers: { Cookie: engineerCookie } });
  assert.equal((await previewAfterRejectedStaleSubmission.json()).irNo, nextNumberPreview.irNo, "A stale preview must not consume a serial");

  const engineerMarkDone = await request(baseUrl, "/irs/mark-done", {
    method: "POST",
    headers: { Cookie: engineerCookie },
    body: JSON.stringify({ uniqueId: item.id }),
  });
  assert.equal(engineerMarkDone.status, 403);

  const engineerArchive = await request(baseUrl, "/archive", {
    method: "POST",
    headers: { Cookie: engineerCookie },
    body: JSON.stringify({ collection: "irs", uniqueId: item.id }),
  });
  assert.equal(engineerArchive.status, 403);

  const engineerAllRecords = await request(baseUrl, "/irs/all", { headers: { Cookie: engineerCookie } });
  assert.equal(engineerAllRecords.status, 403);

  const linkedProjectDelete = await request(baseUrl, "/projects/D6-A1", {
    method: "DELETE",
    headers: { Cookie: adminCookie },
  });
  assert.equal(linkedProjectDelete.status, 409);

  const architectureRequest = await request(baseUrl, "/irs", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({
      project: "D6-A1",
      department: "ARCH",
      requestType: "IR",
      location: "A1 - Ground Floor",
      desc: "Architectural inspection with references",
      refDrawings: ["SD-ARCH-017", "SD-ARCH-018", "SD-ARCH-017"],
      refMethod: "MS-ARCH-004",
      // Old clients can still post these names. The API must retain their
      // value through refDrawings, then discard the duplicate properties.
      SDAttatch: "SD-ARCH-017",
      RefMethod: "MS-ARCH-004",
      tags: { engineer: ["ARCH checklist"], sd: ["SD-ARCH-018"] },
    }),
  });
  assert.equal(architectureRequest.status, 201);
  const architectureItem = (await architectureRequest.json()).item;
  assert.deepEqual(architectureItem.refDrawings, ["SD-ARCH-017", "SD-ARCH-018"]);
  assert.equal(architectureItem.refMethod, "MS-ARCH-004");
  assert.equal(Object.hasOwn(architectureItem, "SDAttatch"), false);
  assert.equal(Object.hasOwn(architectureItem, "RefMethod"), false);
  assert.deepEqual(architectureItem.tags, { engineer: ["ARCH checklist"] });

  const legacyReferenceRequest = await request(baseUrl, "/irs", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({
      project: "D6-A1",
      department: "ARCH",
      requestType: "IR",
      location: "A1 - Ground Floor",
      desc: "Legacy drawing-reference normalization",
      SDAttatch: "SD-ARCH-LEGACY-001",
      RefMethod: "MS-ARCH-LEGACY-001",
      tags: { sd: ["SD-ARCH-LEGACY-001"] },
    }),
  });
  assert.equal(legacyReferenceRequest.status, 201);
  const legacyReferenceItem = (await legacyReferenceRequest.json()).item;
  assert.deepEqual(legacyReferenceItem.refDrawings, ["SD-ARCH-LEGACY-001"]);
  assert.equal(legacyReferenceItem.refMethod, "MS-ARCH-LEGACY-001");
  assert.equal(Object.hasOwn(legacyReferenceItem, "SDAttatch"), false);
  assert.equal(Object.hasOwn(legacyReferenceItem, "RefMethod"), false);

  for (const discipline of ["ELECT", "MECH", "SURV", "TS"]) {
    const disciplineRequest = await request(baseUrl, "/irs", {
      method: "POST",
      headers: { Cookie: adminCookie },
      body: JSON.stringify({
        project: "D6-A1",
        department: discipline,
        requestType: "IR",
        location: "A1 - Ground Floor",
        desc: `${discipline} reference workflow`,
        refDrawings: [`${discipline}-REF-001`],
      }),
    });
    assert.equal(disciplineRequest.status, 201);
    const disciplineItem = (await disciplineRequest.json()).item;
    assert.deepEqual(disciplineItem.refDrawings, [`${discipline}-REF-001`]);
    assert.equal(Object.hasOwn(disciplineItem, "SDAttatch"), false);
  }

  const linkedRevisionResponse = await request(baseUrl, "/revs", {
    method: "POST",
    headers: { Cookie: engineerCookie },
    body: JSON.stringify({
      project: "D6-A1",
      parentDocumentId: item.id,
      parentRequestType: "IR",
      revText: "R-Manual",
      revNote: "Engineer resubmission",
    }),
  });
  assert.equal(linkedRevisionResponse.status, 201);
  const linkedRevision = (await linkedRevisionResponse.json()).item;
  assert.equal(linkedRevision.parentDocumentId, item.id);
  assert.equal(linkedRevision.parentDocumentNumber, item.irNo);
  assert.equal(linkedRevision.revisionNumber, 1);

  const invalidStandaloneRevisionChecklist = await request(baseUrl, "/revs", {
    method: "POST",
    headers: { Cookie: engineerCookie },
    body: JSON.stringify({
      project: "D6-A1",
      parentRequestType: "IR",
      revText: "IR-REV-INVALID-CHECKLIST",
      checklistId: "checklist-06",
    }),
  });
  assert.equal(invalidStandaloneRevisionChecklist.status, 400);

  const standaloneRevisionResponse = await request(baseUrl, "/revs", {
    method: "POST",
    headers: { Cookie: engineerCookie },
    body: JSON.stringify({
      project: "D6-A1",
      parentRequestType: "IR",
      revText: "IR-REV-ENG-001",
      revNote: "Standalone engineer revision",
      checklistId: "checklist-01",
    }),
  });
  assert.equal(standaloneRevisionResponse.status, 201);
  const standaloneRevision = (await standaloneRevisionResponse.json()).item;
  assert.equal(Object.hasOwn(standaloneRevision, "parentDocumentId"), false);
  assert.equal(standaloneRevision.userRevNumber, "IR-REV-ENG-001");
  assert.equal(standaloneRevision.revNote, "Standalone engineer revision");
  assert.equal(standaloneRevision.checklistId, "checklist-01");
  assert.equal(standaloneRevision.checklistNumber, "01");

  const refreshedRevisions = await request(baseUrl, "/revs", { headers: { Cookie: engineerCookie } });
  assert.equal(refreshedRevisions.status, 200);
  assert.equal((await refreshedRevisions.json()).revs.find((revision) => revision.id === standaloneRevision.id).checklistId, "checklist-01");
  const revisionQueueResponse = await request(baseUrl, "/dc/queue?type=REVISION&pageSize=100", { headers: { Cookie: adminCookie } });
  assert.equal(revisionQueueResponse.status, 200);
  const queuedStandaloneRevision = (await revisionQueueResponse.json()).items.find((revision) => revision.id === standaloneRevision.id);
  assert.equal(queuedStandaloneRevision.userRevNumber, "IR-REV-ENG-001");
  assert.equal(queuedStandaloneRevision.revNote, "Standalone engineer revision");
  assert.equal(queuedStandaloneRevision.checklistId, "checklist-01");

  const unauthorizedRevisionChecklist = await request(baseUrl, `/dc/documents/${standaloneRevision.id}/checklist`, {
    method: "POST",
    headers: { Cookie: engineerCookie },
  });
  assert.equal(unauthorizedRevisionChecklist.status, 403);
  const revisionChecklistResponse = await request(baseUrl, `/dc/documents/${standaloneRevision.id}/checklist`, {
    method: "POST",
    headers: { Cookie: adminCookie },
  });
  assert.equal(revisionChecklistResponse.status, 200);
  assert.equal(revisionChecklistResponse.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const revisionChecklistEntries = readZipEntries(Buffer.from(await revisionChecklistResponse.arrayBuffer()));
  const sourceChecklist = getChecklistCatalogInfo().templates.find((template) => template.id === "checklist-01");
  const sourceChecklistEntries = readZipEntries(fs.readFileSync(sourceChecklist.path));
  assert.deepEqual(
    revisionChecklistEntries.map((entry) => entry.name).sort(),
    sourceChecklistEntries.map((entry) => entry.name).sort(),
    "The downloaded REV checklist must retain every source document part/page",
  );
  assert.equal(findItem("revs", standaloneRevision.id).wordDownloads.checklist.by, "testadmin");
  const archivedStandaloneRevision = await request(baseUrl, "/archive", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ collection: "revs", uniqueId: standaloneRevision.id }),
  });
  assert.equal(archivedStandaloneRevision.status, 200);
  const archivedRevisionItem = (await archivedStandaloneRevision.json()).item;
  assert.equal(archivedRevisionItem.checklistId, "checklist-01");
  assert.equal(archivedRevisionItem.userRevNumber, "IR-REV-ENG-001");
  const revisionArchiveResponse = await request(baseUrl, "/archive/dc?pageSize=100", { headers: { Cookie: adminCookie } });
  assert.equal(revisionArchiveResponse.status, 200);
  const revisionArchiveItem = (await revisionArchiveResponse.json()).archive.find((revision) => revision.id === standaloneRevision.id);
  assert.equal(revisionArchiveItem.checklistId, "checklist-01");
  assert.equal(revisionArchiveItem.revNote, "Standalone engineer revision");

  const correctionAction = await request(baseUrl, "/update-action", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ collection: "irs", uniqueId: item.id, action: "C" }),
  });
  assert.equal(correctionAction.status, 200);
  const correction = await correctionAction.json();
  assert.equal(correction.revisionCreated, true);
  assert.equal(correction.revision.parentDocumentId, item.id);
  assert.equal(correction.revision.revisionNumber, 2);

  const duplicateCorrectionAction = await request(baseUrl, "/update-action", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ collection: "irs", uniqueId: item.id, action: "C" }),
  });
  assert.equal(duplicateCorrectionAction.status, 200);
  const duplicateCorrection = await duplicateCorrectionAction.json();
  assert.equal(duplicateCorrection.revisionCreated, false);
  assert.equal(duplicateCorrection.revision.id, correction.revision.id);

  const forbiddenPpir = await request(baseUrl, "/irs", {
    method: "POST",
    headers: { Cookie: engineerCookie },
    body: JSON.stringify({
      project: "D6-A1",
      requestType: "PPIR",
      location: "A1 - Ground Floor",
      category: "Concrete",
      desc: "Post pour inspection",
      receivedDate: "2026-09-07",
    }),
  });
  assert.equal(forbiddenPpir.status, 400);

  const ppirResponse = await request(baseUrl, "/irs", {
    method: "POST",
    headers: { Cookie: reportEngineerCookie },
    body: JSON.stringify({
      project: "D6-A1",
      requestType: "PPIR",
      location: "A1 - Ground Floor",
      category: "Concrete",
      desc: "Post pour inspection for slab",
      receivedDate: "2026-09-07",
      remarks: "Ready for consultant review",
    }),
  });
  assert.equal(ppirResponse.status, 400);
  const legacyPpir = saveItem("irs", {
    id: "legacy-ppir", uniqueId: "legacy-ppir", irNo: "BADYA-CON-D6-A1-PPIR-ST-001",
    requestType: "PPIR", project: "D6-A1", department: "Civil",
    location: "A1 - Ground Floor", desc: "Historical post pour inspection",
    user: "engineer.reports", sentAt: "2026-09-07T09:00:00.000Z",
    isArchived: true,
  });
  assert.equal(legacyPpir.requestType, "PPIR");
  const disabledLegacyWord = await request(baseUrl, `/dc/documents/${legacyPpir.id}/word`, { method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ part: "main" }) });
  assert.equal(disabledLegacyWord.status, 410);
  const visibleRequests = await request(baseUrl, "/irs", { headers: { Cookie: adminCookie } });
  assert.ok((await visibleRequests.json()).irs.every((record) => record.requestType !== "PPIR"));
  const engineerRecords = await request(baseUrl, "/engineer/records/page", { headers: { Cookie: reportEngineerCookie } });
  assert.ok((await engineerRecords.json()).records.every((record) => record.requestType !== "PPIR"));
  const hiddenArchive = await request(baseUrl, "/archive/dc", { headers: { Cookie: adminCookie } });
  assert.ok((await hiddenArchive.json()).archive.every((record) => record.requestType !== "PPIR"));

  const engineerTr = await request(baseUrl, "/irs", {
    method: "POST",
    headers: { Cookie: reportEngineerCookie },
    body: JSON.stringify({ project: "D6-A1", requestType: "TR", location: "Building A1-04-01", category: "SOG", testAge: "28 Days" }),
  });
  assert.equal(engineerTr.status, 403);

  const invalidTrAge = await request(baseUrl, "/irs", {
    method: "POST",
    headers: { Cookie: dcCookie },
    body: JSON.stringify({ project: "D6-A1", requestType: "TR", location: "Building A1-04-01", category: "SOG", testAge: "14 Days" }),
  });
  assert.equal(invalidTrAge.status, 400);

  const invalidTrLocation = await request(baseUrl, "/irs", {
    method: "POST",
    headers: { Cookie: dcCookie },
    body: JSON.stringify({ project: "D6-A1", requestType: "TR", location: "Different project", category: "SOG", testAge: "7 Days" }),
  });
  assert.equal(invalidTrLocation.status, 400);
  const invalidTrDescription = await request(baseUrl, "/irs", {
    method: "POST",
    headers: { Cookie: dcCookie },
    body: JSON.stringify({ project: "D6-A1", requestType: "TR", location: "Building A1-04-01", category: "Unconfigured work", testAge: "7 Days" }),
  });
  assert.equal(invalidTrDescription.status, 400);

  const trResponse = await request(baseUrl, "/irs", {
    method: "POST",
    headers: { Cookie: dcCookie },
    body: JSON.stringify({
      project: "D6-A1",
      requestType: "TR",
      location: "Building A1-04-01",
      category: "SOG",
      testAge: "28 Days",
      desc: "Attempt to override fixed description",
      isEdited: true,
      receivedDate: "2026-09-07",
      // Old clients may submit it, but new records must not persist it.
      source: "Site laboratory",
      remarks: "Awaiting consultant action",
    }),
  });
  assert.equal(trResponse.status, 201);
  const trResult = await trResponse.json();
  const tr = trResult.item;
  assert.equal(tr.irNo, "BADYA-CON-D6-A1-TR-ST-001");
  assert.equal(tr.desc, "Compressive Strength Test Results for SOG at Building A1-04-01 28 Days.");
  assert.equal(tr.testAge, "28 Days");
  assert.equal(Object.hasOwn(tr, "isEdited"), false);
  assert.deepEqual(trResult.duplicateSerialRequests, []);
  assert.equal(Object.hasOwn(tr, "source"), false);
  assert.equal(tr.receivedDate, new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const engineerTrRecords = await request(baseUrl, "/engineer/records/page", { headers: { Cookie: engineerCookie } });
  assert.ok((await engineerTrRecords.json()).records.some((record) => record.id === tr.id));
  const unrelatedEngineerRecords = await request(baseUrl, "/engineer/records/page", { headers: { Cookie: reportEngineerCookie } });
  assert.ok((await unrelatedEngineerRecords.json()).records.every((record) => record.id !== tr.id));

  const uniqueSerial = await request(baseUrl, "/irs/update-ir-number", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ uniqueId: tr.id, newSerial: 99 }),
  });
  assert.equal(uniqueSerial.status, 200);
  assert.deepEqual((await uniqueSerial.json()).duplicateSerialRequests, []);
  const repeatedSerial = await request(baseUrl, "/irs/update-ir-number", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ uniqueId: tr.id, newSerial: 1 }),
  });
  assert.equal(repeatedSerial.status, 200);
  const repeatedSerialResult = await repeatedSerial.json();
  assert.equal(repeatedSerialResult.item.serialNumber, 1);
  assert.deepEqual(repeatedSerialResult.duplicateSerialRequests, []);

  const pending = await request(baseUrl, "/irs", { headers: { Cookie: engineerCookie } });
  assert.equal(pending.status, 200);
  assert.equal((await pending.json()).irs.length, 1);

  const anonymousRecords = await request(baseUrl, "/engineer/records/page");
  assert.equal(anonymousRecords.status, 401);

  const ownRecords = await request(baseUrl, "/engineer/records/page?department=ARCH&pageSize=50", {
    headers: { Cookie: engineerCookie },
  });
  assert.equal(ownRecords.status, 200);
  const ownRecordsBody = await ownRecords.json();
  assert.ok(ownRecordsBody.records.every((record) => record.department === "ARCH"));
  assert.ok(ownRecordsBody.records.every((record) => record.user === "engineer.one" || record.requestType === "TR"));
  const allOwnRecords = await request(baseUrl, "/engineer/records/page?pageSize=50", { headers: { Cookie: engineerCookie } });
  const allOwnRecordsBody = await allOwnRecords.json();
  assert.ok(allOwnRecordsBody.records.length >= 1);
  assert.ok(allOwnRecordsBody.records.every((record) => record.user === "engineer.one" || record.requestType === "TR"));
  const filteredOwnRecords = await request(baseUrl, "/engineer/records/page?project=D6-A1&type=IR&department=ST&status=pending&requester=engineer.one&pageSize=50", { headers: { Cookie: engineerCookie } });
  const filteredOwnRecordsBody = await filteredOwnRecords.json();
  assert.equal(filteredOwnRecords.status, 200);
  assert.equal(filteredOwnRecordsBody.total, 1);
  assert.equal(filteredOwnRecordsBody.records[0].id, item.id);
  assert.equal(filteredOwnRecordsBody.records[0].requesterName, "engineer.one");

  const adminRecords = await request(baseUrl, "/engineer/records/page", { headers: { Cookie: adminCookie } });
  assert.equal(adminRecords.status, 403);

  const word = await request(baseUrl, "/generate-word", {
    method: "POST",
    headers: { Cookie: engineerCookie },
    body: JSON.stringify({ id: item.id }),
  });
  assert.equal(word.status, 200);
  assert.equal(word.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.match(word.headers.get("x-contech-template"), /^ST\.docx \+ 1-Checklist for Concrete Pouring Request\.docx$/);
  const wordBuffer = Buffer.from(await word.arrayBuffer());
  assert.equal(wordBuffer.subarray(0, 2).toString(), "PK");
  const wordEntries = readZipEntries(wordBuffer);
  const documentXml = wordEntries.find((entry) => entry.name === "word/document.xml").data.toString("utf8");
  assert.match(documentXml, /BADYA-CON-D6-A1-IR-ST-001/);
  assert.match(documentXml, new RegExp(formatWordDate(item.receivedDate || item.sentAt || item.createdAt).replaceAll("/", "\\/")));
  assert.match(documentXml, /<w:sectPr\b[\s\S]*<w:sectPr\b/);
  assert.ok(wordEntries.some((entry) => /^word\/checklist-01-header\d+\.xml$/.test(entry.name)));
  assert.doesNotMatch(documentXml, /\{\{\s*(IRNo|ProjectName|Description|ReceivedDate|requestType)/);

  const editedReferencesResponse = await request(baseUrl, `/dc/documents/${architectureItem.id}/references`, {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ refDrawings: ["SD-ARCH-017", "sd-arch-017", "SD-ARCH-019"] }),
  });
  assert.equal(editedReferencesResponse.status, 200);
  const editedArchitectureItem = (await editedReferencesResponse.json()).item;
  assert.deepEqual(editedArchitectureItem.refDrawings, ["SD-ARCH-017", "SD-ARCH-019"]);

  const architectureWord = await request(baseUrl, "/generate-word", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify(editedArchitectureItem),
  });
  assert.equal(architectureWord.status, 200);
  assert.equal(architectureWord.headers.get("x-contech-template"), "ARCH.docx");
  const architectureXml = readZipEntries(Buffer.from(await architectureWord.arrayBuffer()))
    .find((entry) => entry.name === "word/document.xml").data.toString("utf8");
  assert.match(architectureXml, /BADYA-SD-CON-D6-A1-ARCH-SD-ARCH-017/);
  assert.match(architectureXml, /BADYA-SD-CON-D6-A1-ARCH-SD-ARCH-019/);
  assert.equal((architectureXml.match(/BADYA-SD-CON-D6-A1-ARCH-SD-ARCH-017/g) || []).length, 1);
  assert.match(architectureXml, /MS-ARCH-004/);
  assert.doesNotMatch(architectureXml, /\{\{\s*(refSD|RefMethod|RSD|RM)\s*\}\}/i);

  const dcWord = await request(baseUrl, `/dc/documents/${architectureItem.id}/word`, {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ part: "main" }),
  });
  assert.equal(dcWord.status, 200);
  const dcWordXml = readZipEntries(Buffer.from(await dcWord.arrayBuffer()))
    .find((entry) => entry.name === "word/document.xml").data.toString("utf8");
  assert.match(dcWordXml, new RegExp(formatWordDate(architectureItem.receivedDate || architectureItem.sentAt || architectureItem.createdAt).replaceAll("/", "\\/")));
  assert.match(dcWordXml, /BADYA-SD-CON-D6-A1-ARCH-SD-ARCH-019/);
  assert.doesNotMatch(dcWordXml, /SD-ARCH-018/);

  const otherDepartmentWord = await request(baseUrl, "/generate-word", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ ...editedArchitectureItem, project: "D7-B2", department: "ELECT", refDrawings: ["E-201"] }),
  });
  assert.equal(otherDepartmentWord.status, 200);
  const otherDepartmentXml = readZipEntries(Buffer.from(await otherDepartmentWord.arrayBuffer()))
    .find((entry) => entry.name === "word/document.xml").data.toString("utf8");
  assert.match(otherDepartmentXml, /BADYA-SD-CON-D7-B2-ELECT-E-201/);

  const cprResponse = await request(baseUrl, "/irs", {
    method: "POST", headers: { Cookie: adminCookie },
    body: JSON.stringify({ project: "D6-A1", department: "Civil", requestType: "CPR", location: "Building A1-04-01", category: "Slab", desc: "Concrete pouring", floorInput: "Ground Floor", checklistId: "checklist-01", refDrawing: "REMOVE", refDrawings: ["REMOVE"], refMethod: "REMOVE" }),
  });
  assert.equal(cprResponse.status, 201);
  const cpr = (await cprResponse.json()).item;
  assert.equal(cpr.floorInput, "Ground Floor");
  for (const key of ["refDrawing", "refDrawings", "refMethod"]) assert.equal(Object.hasOwn(cpr, key), false);
  const cprReferences = await request(baseUrl, `/dc/documents/${cpr.id}/references`, { method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ refDrawings: ["REMOVE"] }) });
  assert.equal(cprReferences.status, 400);
  assert.equal(cpr.checklistId, "checklist-01");
  const cprWord = await request(baseUrl, `/dc/documents/${cpr.id}/word`, { method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({}) });
  assert.equal(cprWord.status, 200);
  assert.match(cprWord.headers.get("x-contech-template"), /^CPR\.docx \+ 1-Checklist for Concrete Pouring Request\.docx$/);
  const cprParts = readZipEntries(Buffer.from(await cprWord.arrayBuffer()));
  const cprDocumentXml = cprParts.find((entry) => entry.name === "word/document.xml").data.toString("utf8");
  assert.match(cprDocumentXml, /Ground Floor/);
  assert.match(cprDocumentXml, /<w:sectPr\b[\s\S]*<w:sectPr\b/);
  assert.match(cprDocumentXml, new RegExp(formatWordDate(cpr.receivedDate || cpr.sentAt || cpr.createdAt).replaceAll("/", "\\/")));
  assert.match(cprParts.find((entry) => entry.name === "word/styles.xml").data.toString("utf8"), /w:ascii="Calibri"/);
  assert.doesNotMatch(cprDocumentXml, /REF\.(?:Drawings|Method)/i);
  assert.ok(cprParts.some((entry) => /^word\/checklist-01-header\d+\.xml$/.test(entry.name)));
  const separateChecklist = await request(baseUrl, `/dc/documents/${cpr.id}/word`, { method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ part: "checklist" }) });
  assert.equal(separateChecklist.status, 400);

  const trWord = await request(baseUrl, "/generate-word", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({ ...tr, requestType: "TR", refDrawings: ["TR-REF-DO-NOT-EXPORT"], refMethod: "TR-METHOD-DO-NOT-EXPORT" }),
  });
  assert.equal(trWord.status, 200);
  assert.equal(trWord.headers.get("x-contech-template"), "TR.docx");
  const trXml = readZipEntries(Buffer.from(await trWord.arrayBuffer()))
    .find((entry) => entry.name === "word/document.xml").data.toString("utf8");
  assert.match(trXml, new RegExp(formatWordDate(tr.receivedDate || tr.sentAt || tr.createdAt).replaceAll("/", "\\/")));
  assert.doesNotMatch(trXml, /REF\.(?:Drawings|Method)|TR-REF-DO-NOT-EXPORT|TR-METHOD-DO-NOT-EXPORT/i);

  const queueResponse = await request(baseUrl, "/dc/queue?type=TR&page=1&pageSize=25", {
    headers: { Cookie: adminCookie },
  });
  assert.equal(queueResponse.status, 200);
  const queue = await queueResponse.json();
  assert.equal(queue.total, 1);
  assert.equal(queue.items[0].requestType, "TR");
  assert.equal(queue.items[0].locationType, "SOG Area");
  const adminAllQueue = await request(baseUrl, "/irs/all", { headers: { Cookie: adminCookie } });
  assert.equal(adminAllQueue.status, 200);
  assert.equal((await adminAllQueue.json()).irs.find((record) => record.id === tr.id)?.locationType, "SOG Area");
  const hiddenPpirQueue = await request(baseUrl, "/dc/queue?type=PPIR", { headers: { Cookie: adminCookie } });
  assert.equal((await hiddenPpirQueue.json()).total, 0);

  const combinedResponse = await request(baseUrl, "/dc/queue?type=IR_CPR&pageSize=100", { headers: { Cookie: adminCookie } });
  assert.equal(combinedResponse.status, 200);
  const combined = await combinedResponse.json();
  assert.ok(combined.items.some((record) => record.requestType === "IR"));
  assert.ok(combined.items.some((record) => record.requestType === "CPR"));
  assert.ok(combined.items.every((record) => ["IR", "CPR"].includes(record.requestType)));

  const groupedFirst = await request(baseUrl, "/dc/queue?group=type&pageSize=2&page=1", { headers: { Cookie: adminCookie } });
  assert.equal(groupedFirst.status, 200);
  const groupedPage = await groupedFirst.json();
  const groupedTypes = [...groupedPage.items.map((record) => record.requestType)];
  for (let nextPage = 2; nextPage <= groupedPage.totalPages; nextPage += 1) {
    const response = await request(baseUrl, `/dc/queue?group=type&pageSize=2&page=${nextPage}`, { headers: { Cookie: adminCookie } });
    assert.equal(response.status, 200);
    groupedTypes.push(...(await response.json()).items.map((record) => record.requestType));
  }
  assert.deepEqual(groupedTypes, [...groupedTypes].sort());
  const projectGroupResponse = await request(baseUrl, "/dc/queue?group=project&pageSize=100", { headers: { Cookie: adminCookie } });
  assert.equal(projectGroupResponse.status, 200);
  const projectNames = (await projectGroupResponse.json()).items.map((record) => record.project || "");
  assert.deepEqual(projectNames, [...projectNames].sort());
  const nestedGroupResponse = await request(baseUrl, "/dc/queue?group=type-project&pageSize=100", { headers: { Cookie: adminCookie } });
  assert.equal(nestedGroupResponse.status, 200);
  const typeProjectKeys = (await nestedGroupResponse.json()).items.map((record) => `${record.requestType}|${record.project || ""}`);
  assert.deepEqual(typeProjectKeys, [...typeProjectKeys].sort());
  const projectFirstResponse = await request(baseUrl, "/dc/queue?group=project-type&pageSize=100", { headers: { Cookie: adminCookie } });
  assert.equal(projectFirstResponse.status, 200);
  const projectTypeKeys = (await projectFirstResponse.json()).items.map((record) => `${record.project || ""}|${record.requestType}`);
  const order = ["IR", "CPR", "TR", "REVISION", "SD"];
  assert.deepEqual(projectTypeKeys, [...projectTypeKeys].sort((a, b) => {
    const [aProject, aType] = a.split("|");
    const [bProject, bType] = b.split("|");
    return aProject.localeCompare(bProject) || order.indexOf(aType) - order.indexOf(bType);
  }));
  const departmentGroupResponse = await request(baseUrl, "/dc/queue?group=type-project-department&pageSize=100", { headers: { Cookie: adminCookie } });
  assert.equal(departmentGroupResponse.status, 200);
  const departmentKeys = (await departmentGroupResponse.json()).items.map((record) => `${record.requestType}|${record.project || ""}|${record.department || ""}`);
  assert.deepEqual(departmentKeys, [...departmentKeys].sort((a, b) => a.localeCompare(b)));
  const selectedSectionResponse = await request(baseUrl, `/dc/queue?type=IR&project=${encodeURIComponent(architectureItem.project)}&department=${encodeURIComponent(architectureItem.department)}`, { headers: { Cookie: adminCookie } });
  assert.equal(selectedSectionResponse.status, 200);
  assert.ok((await selectedSectionResponse.json()).items.every((record) => record.requestType === "IR" && record.project === architectureItem.project && record.department === architectureItem.department));

  const trProjects = await request(baseUrl, "/projects", { headers: { Cookie: adminCookie } });
  assert.ok(Object.keys((await trProjects.json()).projects).includes("D6-A1"));
  const trLocations = await request(baseUrl, "/locations?project=D6-A1", { headers: { Cookie: adminCookie } });
  assert.ok((await trLocations.json()).locations.includes("A1 - Ground Floor"));
  const trOptionsResponse = await request(baseUrl, "/general-descriptions?project=D6-A1&dept=Civil&requestType=TR", { headers: { Cookie: adminCookie } });
  assert.ok((await trOptionsResponse.json()).base.includes("SOG"));

  const summaryResponse = await request(baseUrl, "/reports/summary", {
    headers: { Cookie: adminCookie },
  });
  assert.equal(summaryResponse.status, 200);
  const summary = await summaryResponse.json();
  assert.equal(summary.all.byType.TR, 1);
  assert.equal(summary.all.byType.PPIR, undefined);
  assert.ok(summary.wordTemplates.templates.includes("ST.docx"));

  const filteredSummaryResponse = await request(
    baseUrl,
    `/reports/summary?project=D6-A1&type=TR&location=Building&dateFrom=${tr.receivedDate}&dateTo=${tr.receivedDate}`,
    { headers: { Cookie: adminCookie } },
  );
  assert.equal(filteredSummaryResponse.status, 200);
  const filteredSummary = await filteredSummaryResponse.json();
  assert.equal(filteredSummary.filtered.total, 1);
  assert.equal(filteredSummary.filtered.byAction["No action"], 1);

  const reportWorkbookResponse = await request(baseUrl, "/reports/export.xlsx?project=D6-A1&type=TR", {
    headers: { Cookie: adminCookie },
  });
  assert.equal(reportWorkbookResponse.status, 200);
  assert.equal(reportWorkbookResponse.headers.get("x-contech-record-count"), "1");
  const reportWorkbook = Buffer.from(await reportWorkbookResponse.arrayBuffer());
  assert.equal(reportWorkbook.subarray(0, 2).toString(), "PK");
  const reportSheet = readZipEntries(reportWorkbook).find((entry) => entry.name === "xl/worksheets/sheet1.xml").data.toString("utf8");
  assert.match(reportSheet, /BADYA-CON-D6-A1-TR-ST-001/);
  assert.match(reportSheet, /Compressive Strength Test Results for SOG at Building A1-04-01 28 Days\./);

  const excelFilesResponse = await request(baseUrl, "/excel-files", {
    headers: { Cookie: adminCookie },
  });
  assert.equal(excelFilesResponse.status, 200);
  const excelFiles = await excelFilesResponse.json();
  assert.ok(excelFiles.files.length >= 1);
  assert.ok(excelFiles.files[0].sheets.length >= 1);

  const firstWorkbook = excelFiles.files[0];
  const firstSheet = firstWorkbook.sheets[0];
  const previewResponse = await request(
    baseUrl,
    `/excel-files/${firstWorkbook.id}/preview?sheet=${encodeURIComponent(firstSheet.name)}&startRow=1&pageSize=10`,
    { headers: { Cookie: adminCookie } },
  );
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.sheet.name, firstSheet.name);
  assert.ok(preview.maxPreviewColumns <= 30);

  const archiveSingle = saveItem("irs", {
    id: "archive-single", uniqueId: "archive-single", irNo: "ARCHIVE-SINGLE",
    requestType: "IR", project: "ARCHIVE-SINGLE-PROJECT", department: "Civil",
    user: "engineer.one", isArchived: false, isDone: false, createdAt: "2026-09-05T08:00:00.000Z",
  });
  const singleArchiveResponse = await request(baseUrl, "/archive", {
    method: "POST", headers: { Cookie: adminCookie },
    body: JSON.stringify({ collection: "irs", uniqueId: archiveSingle.id, role: "spoofed-role" }),
  });
  assert.equal(singleArchiveResponse.status, 200);
  const singleArchived = (await singleArchiveResponse.json()).item;
  assert.equal(singleArchived.isArchived, true);
  assert.equal(singleArchived.archivedBy, "testadmin");
  assert.equal(singleArchived.archivedByRole, "admin");
  const engineerActiveAfterArchive = await request(baseUrl, "/engineer/records/page?pageSize=200", { headers: { Cookie: engineerCookie } });
  assert.ok((await engineerActiveAfterArchive.json()).records.every((record) => record.id !== archiveSingle.id));

  saveProject({ name: "ARCHIVE-PROJECT-A", description: "Archive scope A", counters: {} });
  saveProject({ name: "ARCHIVE-PROJECT-B", description: "Archive scope B", counters: {} });
  saveProject({ name: "ARCHIVE-PROJECT-C", description: "Archive discipline scope", counters: {} });
  saveItem("irs", { id: "archive-a-ir-1", uniqueId: "archive-a-ir-1", irNo: "ARCHIVE-A-IR-1", requestType: "IR", project: "ARCHIVE-PROJECT-A", department: "Civil", isArchived: false, createdAt: "2026-09-05T09:00:00.000Z" });
  saveItem("irs", { id: "archive-a-ir-2", uniqueId: "archive-a-ir-2", irNo: "ARCHIVE-A-IR-2", requestType: "IR", project: "ARCHIVE-PROJECT-A", department: "Civil", isArchived: false, createdAt: "2026-09-05T09:10:00.000Z" });
  saveItem("irs", { id: "archive-a-cpr", uniqueId: "archive-a-cpr", irNo: "ARCHIVE-A-CPR", requestType: "CPR", project: "ARCHIVE-PROJECT-A", department: "Civil", isArchived: false, createdAt: "2026-09-05T09:20:00.000Z" });
  saveItem("irs", { id: "archive-a-tr", uniqueId: "archive-a-tr", irNo: "ARCHIVE-A-TR", requestType: "TR", project: "ARCHIVE-PROJECT-A", department: "Civil", isArchived: false, createdAt: "2026-09-05T09:30:00.000Z" });
  saveItem("revs", { id: "archive-a-rev", uniqueId: "archive-a-rev", revNo: "ARCHIVE-A-REV", isRevision: true, project: "ARCHIVE-PROJECT-A", department: "Civil", isArchived: false, createdAt: "2026-09-05T09:40:00.000Z" });
  saveItem("irs", { id: "archive-b-ir", uniqueId: "archive-b-ir", irNo: "ARCHIVE-B-IR", requestType: "IR", project: "ARCHIVE-PROJECT-B", department: "Civil", isArchived: false, createdAt: "2026-09-05T10:00:00.000Z" });
  saveItem("irs", { id: "archive-b-cpr", uniqueId: "archive-b-cpr", irNo: "ARCHIVE-B-CPR", requestType: "CPR", project: "ARCHIVE-PROJECT-B", department: "Civil", isArchived: false, createdAt: "2026-09-05T10:10:00.000Z" });
  saveItem("irs", { id: "archive-b-tr", uniqueId: "archive-b-tr", irNo: "ARCHIVE-B-TR", requestType: "TR", project: "ARCHIVE-PROJECT-B", department: "Civil", isArchived: false, createdAt: "2026-09-05T10:20:00.000Z" });
  saveItem("irs", { id: "archive-c-ir-civil", uniqueId: "archive-c-ir-civil", irNo: "ARCHIVE-C-IR-CIVIL", requestType: "IR", project: "ARCHIVE-PROJECT-C", department: "ST", user: "engineer.one", isArchived: false, createdAt: "2026-09-05T10:30:00.000Z" });
  saveItem("irs", { id: "archive-c-ir-arch", uniqueId: "archive-c-ir-arch", irNo: "ARCHIVE-C-IR-ARCH", requestType: "IR", project: "ARCHIVE-PROJECT-C", department: "ARCH", user: "engineer.one", isArchived: false, createdAt: "2026-09-05T10:40:00.000Z" });

  const scopedCopyResponse = await request(baseUrl, "/copy/project-requests", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ project: "ARCHIVE-PROJECT-C", requestType: "IR", department: "Civil" }),
  });
  assert.equal(scopedCopyResponse.status, 200);
  const scopedCopy = await scopedCopyResponse.json();
  assert.deepEqual(scopedCopy.records.map((record) => record.id), ["archive-c-ir-civil"]);
  assert.equal(scopedCopy.records[0].requesterName, "engineer.one");
  const scopedArchiveResponse = await request(baseUrl, "/archive/project-requests", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ project: "ARCHIVE-PROJECT-C", requestType: "IR", department: "ST" }),
  });
  assert.equal((await scopedArchiveResponse.json()).archivedCount, 1);
  assert.equal(findItem("irs", "archive-c-ir-civil").isArchived, true);
  assert.equal(findItem("irs", "archive-c-ir-arch").isArchived, false);

  const unauthorizedProjectArchive = await request(baseUrl, "/archive/project-requests", {
    method: "POST", headers: { Cookie: engineerCookie }, body: JSON.stringify({ project: "ARCHIVE-PROJECT-A", requestType: "IR" }),
  });
  assert.equal(unauthorizedProjectArchive.status, 403);
  const missingProjectArchive = await request(baseUrl, "/archive/project-requests", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ requestType: "IR" }),
  });
  assert.equal(missingProjectArchive.status, 400);
  const missingTypeArchive = await request(baseUrl, "/archive/project-requests", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ project: "ARCHIVE-PROJECT-A" }),
  });
  assert.equal(missingTypeArchive.status, 400);
  const invalidTypeArchive = await request(baseUrl, "/archive/project-requests", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ project: "ARCHIVE-PROJECT-A", requestType: "SD" }),
  });
  assert.equal(invalidTypeArchive.status, 400);
  const unknownProjectArchive = await request(baseUrl, "/archive/project-requests", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ project: "UNKNOWN-PROJECT", requestType: "IR" }),
  });
  assert.equal(unknownProjectArchive.status, 404);
  const removedGlobalArchive = await request(baseUrl, "/archive/bulk", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ scope: "all" }),
  });
  assert.equal(removedGlobalArchive.status, 404);

  const irPreviewResponse = await request(baseUrl, "/archive/project-requests", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ project: "ARCHIVE-PROJECT-A", requestType: "IR", preview: true }),
  });
  assert.equal(irPreviewResponse.status, 200);
  assert.equal((await irPreviewResponse.json()).eligibleCount, 2);
  assert.equal(findItem("irs", "archive-a-ir-1").isArchived, false);
  const irArchiveResponse = await request(baseUrl, "/archive/project-requests", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ project: "ARCHIVE-PROJECT-A", requestType: "IR" }),
  });
  const irArchive = await irArchiveResponse.json();
  assert.equal(irArchiveResponse.status, 200);
  assert.equal(irArchive.archivedCount, 2);
  assert.deepEqual(new Set(irArchive.archivedIds), new Set(["archive-a-ir-1", "archive-a-ir-2"]));
  assert.equal(findItem("irs", "archive-a-cpr").isArchived, false);
  assert.equal(findItem("irs", "archive-a-tr").isArchived, false);
  assert.equal(findItem("revs", "archive-a-rev").isArchived, false);
  assert.equal(findItem("irs", "archive-b-ir").isArchived, false);

  const cprArchiveResponse = await request(baseUrl, "/archive/project-requests", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ project: "ARCHIVE-PROJECT-A", requestType: "CPR" }),
  });
  assert.equal((await cprArchiveResponse.json()).archivedCount, 1);
  assert.equal(findItem("irs", "archive-a-cpr").isArchived, true);
  assert.equal(findItem("irs", "archive-a-tr").isArchived, false);
  assert.equal(findItem("irs", "archive-b-cpr").isArchived, false);

  const trArchiveResponse = await request(baseUrl, "/archive/project-requests", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ project: "ARCHIVE-PROJECT-A", requestType: "TR" }),
  });
  assert.equal((await trArchiveResponse.json()).archivedCount, 1);
  assert.equal(findItem("irs", "archive-a-tr").isArchived, true);
  assert.equal(findItem("irs", "archive-b-tr").isArchived, false);

  const repeatedIrArchive = await request(baseUrl, "/archive/project-requests", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ project: "ARCHIVE-PROJECT-A", requestType: "IR" }),
  });
  assert.equal((await repeatedIrArchive.json()).archivedCount, 0);
  const projectAActive = await request(baseUrl, "/dc/queue?project=ARCHIVE-PROJECT-A&pageSize=100", { headers: { Cookie: adminCookie } });
  assert.deepEqual((await projectAActive.json()).items.map((record) => record.id), ["archive-a-rev"]);
  const projectBActive = await request(baseUrl, "/dc/queue?project=ARCHIVE-PROJECT-B&pageSize=100", { headers: { Cookie: adminCookie } });
  assert.deepEqual(new Set((await projectBActive.json()).items.map((record) => record.id)), new Set(["archive-b-ir", "archive-b-cpr", "archive-b-tr"]));
  const archiveRegister = await request(baseUrl, "/archive/dc?pageSize=100", { headers: { Cookie: adminCookie } });
  const archiveRegisterBody = await archiveRegister.json();
  const archivedIds = new Set(archiveRegisterBody.archive.map((record) => record.id));
  assert.ok(archiveRegisterBody.archive.filter((record) => record.archivedBy).every((record) => record.archivedByName));
  for (const id of ["archive-a-ir-1", "archive-a-ir-2", "archive-a-cpr", "archive-a-tr"]) assert.ok(archivedIds.has(id));
  for (const id of ["archive-b-ir", "archive-b-cpr", "archive-b-tr", "archive-a-rev"]) assert.equal(archivedIds.has(id), false);

  const checklistArchiveResponse = await request(baseUrl, "/archive", {
    method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ collection: "irs", uniqueId: item.id }),
  });
  assert.equal(checklistArchiveResponse.status, 200);
  const archivedChecklistItem = (await checklistArchiveResponse.json()).item;
  assert.equal(archivedChecklistItem.checklistId, "checklist-01");
  assert.equal(archivedChecklistItem.checklistName, "Checklist for Concrete Pouring Request");
  const archivedChecklistRegister = await request(baseUrl, "/archive/dc?pageSize=100", { headers: { Cookie: adminCookie } });
  const refreshedArchivedChecklist = (await archivedChecklistRegister.json()).archive.find((record) => record.id === item.id);
  assert.equal(refreshedArchivedChecklist.checklistId, "checklist-01");
  assert.equal(refreshedArchivedChecklist.checklistName, "Checklist for Concrete Pouring Request");
});
