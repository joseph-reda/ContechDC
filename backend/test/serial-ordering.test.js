import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const testDatabase = path.resolve("backend", "data", `serial-ordering-${process.pid}.sqlite`);
process.env.DATABASE_FILE = testDatabase;
process.env.INITIAL_ADMIN_USERNAME = "serialadmin";
process.env.INITIAL_ADMIN_PASSWORD = "SerialAdmin@123";

const { app } = await import("../server.js");
const { db, findItem, saveItem, saveProject } = await import("../db.js");
const { groupDcSections } = await import("../../src/utils/dcSections.js");
const { compareSerialRecords, compareSerialWithinScope } = await import("../../src/utils/serialOrdering.js");

function request(baseUrl, pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
}

function recordId(type, suffix, project = "SERIAL-A") {
  return `${project.toLowerCase()}-${type.toLowerCase()}-${suffix}`;
}

function seedRecord(type, suffix, serialNumber, createdAt, project = "SERIAL-A", extra = {}) {
  const id = recordId(type, suffix, project);
  return saveItem("irs", {
    id,
    uniqueId: id,
    project,
    requestType: type,
    department: "Civil",
    serialNumber,
    irNo: type === "CPR"
      ? `BADYA-CON-${project}-CPR-${String(serialNumber).padStart(3, "0")}`
      : `BADYA-CON-${project}-${type}-ST-${String(serialNumber).padStart(3, "0")}`,
    createdAt,
    sentAt: createdAt,
    user: "serial-owner",
    isDone: false,
    isArchived: false,
    auditMarker: `preserve-${id}`,
    ...extra,
  });
}

async function updateSerial(baseUrl, cookie, id, newSerial, extra = {}) {
  return request(baseUrl, "/irs/update-ir-number", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({ uniqueId: id, newSerial, ...extra }),
  });
}

function scopedIds(records, project, type) {
  return records
    .filter((item) => item.project === project && item.requestType === type)
    .map((item) => item.id);
}

test("IR, CPR and TR serial edits are atomic, scoped and deterministically ordered", async (context) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDatabase}${suffix}`, { force: true });
  });

  const login = await request(baseUrl, "/login", {
    method: "POST",
    body: JSON.stringify({ username: "serialadmin", password: "SerialAdmin@123" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";", 1)[0];

  saveProject({ name: "SERIAL-A", description: "Serial ordering scope A", counters: {} });
  saveProject({ name: "SERIAL-B", description: "Serial ordering scope B", counters: {} });

  for (const type of ["IR", "CPR", "TR"]) {
    seedRecord(type, "a", 1, "2026-01-01T08:00:00.000Z");
    seedRecord(type, "b", 2, "2026-01-01T09:00:00.000Z");
    seedRecord(type, "c", 3, "2026-01-01T10:00:00.000Z");
    seedRecord(type, "d", 4, "2026-01-01T11:00:00.000Z");
    seedRecord(type, "e", 3, "2026-01-01T10:00:00.000Z");
    seedRecord(type, "f", 3, "2026-01-01T10:00:00.000Z");
    seedRecord(type, "scope", 2, "2026-01-01T07:00:00.000Z", "SERIAL-B");
  }

  const untouchedBefore = db.prepare("SELECT data FROM items WHERE id = ?").get(recordId("IR", "b")).data;

  for (const type of ["IR", "CPR", "TR"]) {
    const a = recordId(type, "a");
    const b = recordId(type, "b");
    const c = recordId(type, "c");
    const d = recordId(type, "d");
    const e = recordId(type, "e");
    const f = recordId(type, "f");

    const larger = await updateSerial(baseUrl, cookie, a, 4, {
      project: "MALICIOUS-PROJECT",
      requestType: type === "IR" ? "CPR" : "IR",
      department: "ELECT",
    });
    assert.equal(larger.status, 200);
    const largerBody = await larger.json();
    assert.equal(largerBody.item.project, "SERIAL-A");
    assert.equal(largerBody.item.requestType, type);
    assert.equal(largerBody.item.department, "Civil");
    assert.equal(largerBody.item.auditMarker, `preserve-${a}`);

    let queueResponse = await request(baseUrl, `/dc/queue?project=SERIAL-A&type=${type}&pageSize=100`, { headers: { Cookie: cookie } });
    assert.equal(queueResponse.status, 200);
    let queue = await queueResponse.json();
    assert.deepEqual(scopedIds(queue.items, "SERIAL-A", type), [b, c, e, f, a, d]);
    assert.deepEqual(queue.items.map((item) => item.serialNumber), [2, 3, 3, 3, 4, 4]);

    const smaller = await updateSerial(baseUrl, cookie, d, 1);
    assert.equal(smaller.status, 200);
    queueResponse = await request(baseUrl, `/dc/queue?project=SERIAL-A&type=${type}&pageSize=100`, { headers: { Cookie: cookie } });
    queue = await queueResponse.json();
    assert.deepEqual(scopedIds(queue.items, "SERIAL-A", type), [d, b, c, e, f, a]);

    const duplicate = await updateSerial(baseUrl, cookie, a, 2);
    assert.equal(duplicate.status, 200);
    const duplicateBody = await duplicate.json();
    assert.deepEqual(duplicateBody.duplicateSerialRequests.map((item) => item.id), [b]);
    assert.ok(duplicateBody.duplicateSerialRequests.every((item) => item.requestType === type));

    queueResponse = await request(baseUrl, `/dc/queue?project=SERIAL-A&type=${type}&pageSize=100`, { headers: { Cookie: cookie } });
    queue = await queueResponse.json();
    assert.deepEqual(scopedIds(queue.items, "SERIAL-A", type), [d, a, b, c, e, f]);
    assert.deepEqual(queue.items.filter((item) => item.serialNumber === 3).map((item) => item.id), [c, e, f]);

    const newerDuplicate = await updateSerial(baseUrl, cookie, c, 2);
    assert.equal(newerDuplicate.status, 200);
    queueResponse = await request(baseUrl, `/dc/queue?project=SERIAL-A&type=${type}&pageSize=100`, { headers: { Cookie: cookie } });
    queue = await queueResponse.json();
    assert.deepEqual(scopedIds(queue.items, "SERIAL-A", type), [d, c, a, b, e, f]);
    assert.deepEqual(queue.items.filter((item) => item.serialNumber === 2).map((item) => item.id), [c, a, b]);

    const refresh = await request(baseUrl, `/dc/queue?project=SERIAL-A&type=${type}&pageSize=100`, { headers: { Cookie: cookie } });
    assert.deepEqual((await refresh.json()).items.map((item) => item.id), queue.items.map((item) => item.id));

    const frontendSection = groupDcSections([...queue.items].reverse())[0].sections.find((section) => section.type === type);
    assert.deepEqual(frontendSection.items.map((item) => item.id), queue.items.map((item) => item.id));
  }

  assert.equal(db.prepare("SELECT data FROM items WHERE id = ?").get(recordId("IR", "b")).data, untouchedBefore);
  for (const type of ["IR", "CPR", "TR"]) {
    assert.equal(findItem("irs", recordId(type, "scope", "SERIAL-B")).serialNumber, 2);
  }

  const protectedId = recordId("IR", "a");
  const protectedBefore = db.prepare("SELECT data FROM items WHERE id = ?").get(protectedId).data;
  for (const invalid of [0, -1, 1.5, "2.5", Number.MAX_SAFE_INTEGER + 1]) {
    const failed = await updateSerial(baseUrl, cookie, protectedId, invalid);
    assert.equal(failed.status, 400);
    assert.equal(db.prepare("SELECT data FROM items WHERE id = ?").get(protectedId).data, protectedBefore);
  }

  const allResponse = await request(baseUrl, "/irs/all", { headers: { Cookie: cookie } });
  assert.equal(allResponse.status, 200);
  const all = (await allResponse.json()).irs;
  assert.deepEqual(all.map((item) => item.id), [...all].sort(compareSerialRecords).map((item) => item.id));

  const deterministicFallback = [
    { id: "fallback-b", project: "P", requestType: "IR", serialNumber: 7 },
    { id: "fallback-a", project: "P", requestType: "IR", serialNumber: 7 },
  ].sort(compareSerialWithinScope);
  assert.deepEqual(deterministicFallback.map((item) => item.id), ["fallback-a", "fallback-b"]);
});
