export const CHECKLIST_DEPARTMENT_KEYS = Object.freeze(["ARCH", "ST", "MEP", "ELEC"]);

const CHECKLIST_DEPARTMENT_ALIASES = Object.freeze({
  ARCH: Object.freeze([
    "ARCH", "ARCH.", "ARCHITECTURAL", "ARCHITECTURE",
    "ARCHITECTURAL DEPARTMENT", "ARCHITECTURAL ENGINEERING",
  ]),
  ST: Object.freeze([
    "ST", "S.T", "S.T.", "CIVIL", "STRUCTURAL", "STRUCTURE",
    "CIVIL/STRUCTURE", "CIVIL / STRUCTURE", "CIVIL DEPARTMENT",
    "CIVIL ENGINEERING", "STRUCTURAL DEPARTMENT", "STRUCTURAL ENGINEERING",
  ]),
  MEP: Object.freeze([
    "MEP", "M.E.P", "M.E.P.", "MECH", "MECHANICAL",
    "MECHANICAL DEPARTMENT", "MECHANICAL ENGINEERING",
  ]),
  ELEC: Object.freeze([
    "ELEC", "ELEC.", "ELECT", "ELECTRICAL",
    "ELECTRICAL DEPARTMENT", "ELECTRICAL ENGINEERING",
  ]),
});

export function checklistDepartmentToken(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

const checklistDepartmentAliasMap = new Map(
  Object.entries(CHECKLIST_DEPARTMENT_ALIASES)
    .flatMap(([canonical, aliases]) => aliases.map((alias) => [checklistDepartmentToken(alias), canonical])),
);

export function normalizeChecklistDepartment(value) {
  return checklistDepartmentAliasMap.get(checklistDepartmentToken(value)) || "";
}

export function checklistDepartmentDiagnostic(value) {
  const received = checklistDepartmentToken(value) || "(blank)";
  return `Unrecognized checklist department "${received}". Supported values are ARCH, ST/Civil, MEP/MECH, and ELEC/ELECT.`;
}

export function normalizeChecklistDepartmentList(values) {
  if (!Array.isArray(values)) throw new Error("Checklist departments must be an array");
  const normalized = values.map((value) => {
    const department = normalizeChecklistDepartment(value);
    if (!department) throw new Error(checklistDepartmentDiagnostic(value));
    return department;
  });
  return [...new Set(normalized)];
}
