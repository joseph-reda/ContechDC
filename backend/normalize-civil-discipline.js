import { db, canonicalDepartment } from "./db.js";

const changedAt = new Date().toISOString();
let usersUpdated = 0;
let itemsUpdated = 0;
let projectsUpdated = 0;

for (const user of db.prepare("SELECT username, department FROM users").all()) {
  const department = canonicalDepartment(user.department);
  if (department !== user.department) {
    db.prepare("UPDATE users SET department = ?, updated_at = ? WHERE username = ?").run(department, changedAt, user.username);
    usersUpdated += 1;
  }
}

for (const row of db.prepare("SELECT id, data FROM items").all()) {
  const item = JSON.parse(row.data);
  const department = canonicalDepartment(item.department);
  if (department && department !== item.department) {
    item.department = department;
    db.prepare("UPDATE items SET data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(item), changedAt, row.id);
    itemsUpdated += 1;
  }
}

for (const row of db.prepare("SELECT name, data FROM projects").all()) {
  const project = JSON.parse(row.data);
  const counters = { ...(project.counters || {}) };
  let changed = false;
  for (const [legacy, canonical] of [["ST", "Civil"], ["SD_ST", "SD_Civil"]]) {
    if (Object.hasOwn(counters, legacy)) {
      counters[canonical] = Math.max(Number(counters[canonical] || 0), Number(counters[legacy] || 0));
      delete counters[legacy];
      changed = true;
    }
  }
  if (changed) {
    project.counters = counters;
    project.updatedAt = changedAt;
    db.prepare("UPDATE projects SET data = ?, updated_at = ? WHERE name = ?").run(JSON.stringify(project), changedAt, row.name);
    projectsUpdated += 1;
  }
}

console.log(JSON.stringify({ usersUpdated, itemsUpdated, projectsUpdated, canonicalDepartment: "Civil" }));
