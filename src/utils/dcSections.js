const TYPE_ORDER = ["IR", "CPR", "TR", "REVISION", "SD"];

export function requestTypeOf(item) {
  if (item?.isRevision || String(item?.requestType || "").toUpperCase() === "REVISION") return "REVISION";
  if (item?.sdNo) return "SD";
  return String(item?.requestType || (item?.isCPR ? "CPR" : "IR")).toUpperCase();
}

export function rowsInProjectTypeSection(items, project, type) {
  if (!Array.isArray(items)) throw new Error("Records must be an array");
  return items.filter((item) => String(item.project || "") === String(project || "") && requestTypeOf(item) === type);
}

export function groupDcSections(items) {
  if (!Array.isArray(items)) throw new Error("Records must be an array");
  const projects = new Map();
  for (const item of items) {
    const project = String(item.project || "");
    const type = requestTypeOf(item);
    if (!projects.has(project)) projects.set(project, new Map());
    const types = projects.get(project);
    if (!types.has(type)) types.set(type, []);
    types.get(type).push(item);
  }
  return [...projects].sort(([a], [b]) => a.localeCompare(b)).map(([project, types]) => ({
    project,
    sections: [...types].sort(([a], [b]) => {
      const aOrder = TYPE_ORDER.indexOf(a);
      const bOrder = TYPE_ORDER.indexOf(b);
      return (aOrder < 0 ? TYPE_ORDER.length : aOrder) - (bOrder < 0 ? TYPE_ORDER.length : bOrder) || a.localeCompare(b);
    }).map(([type, records]) => ({ type, items: records })),
  }));
}
