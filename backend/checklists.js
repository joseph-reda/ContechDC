import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readZipEntries } from "./office-zip.js";
import {
  checklistDepartmentDiagnostic,
  normalizeChecklistDepartment,
  normalizeChecklistDepartmentList,
} from "../src/utils/checklistDepartments.js";

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(backendDirectory, "..");

export const CHECKLIST_SETTING_KEY = "word_checklists";

export const CHECKLIST_DEPARTMENT_TEMPLATE_MAP = Object.freeze({
  ARCH: Object.freeze([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]),
  ST: Object.freeze([1, 2, 3, 19]),
  MEP: Object.freeze([18, 26, 27, 30, 31, 36, 37, 38, 39]),
  ELEC: Object.freeze([27, 28, 29, 30, 31, 32, 33, 34, 39]),
});

function checklistError(message, code = "CHECKLIST_VALIDATION_ERROR") {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

export const checklistWorkflowDepartment = normalizeChecklistDepartment;

function requiredChecklistDepartment(value) {
  const department = normalizeChecklistDepartment(value);
  if (!department) {
    throw checklistError(checklistDepartmentDiagnostic(value), "CHECKLIST_DEPARTMENT_UNRECOGNIZED");
  }
  return department;
}

export function checklistLocationCode(value) {
  const match = /(\d{2})\s*$/.exec(String(value || "").trim());
  return match ? match[1] : "";
}

export function configuredChecklistDirectory() {
  const configured = String(process.env.CHECKLIST_TEMPLATE_DIR || "").trim();
  return configured
    ? (path.isAbsolute(configured) ? configured : path.resolve(projectDirectory, configured))
    : path.join(projectDirectory, "Files", "CheachList");
}

function validateDocxBuffer(buffer, filename) {
  let entries;
  try {
    entries = readZipEntries(buffer);
  } catch {
    throw checklistError(`Checklist template is not a valid Word document: ${filename}`);
  }
  const names = new Set(entries.map((entry) => entry.name));
  if (!names.has("[Content_Types].xml") || !names.has("word/document.xml")) {
    throw checklistError(`Checklist template is not a valid Word document: ${filename}`);
  }
}

function departmentsForChecklistNumber(checklistNumber) {
  const value = Number(checklistNumber);
  return Object.entries(CHECKLIST_DEPARTMENT_TEMPLATE_MAP)
    .filter(([, checklistNumbers]) => checklistNumbers.includes(value))
    .map(([department]) => department);
}

function approvedTemplateFromFilename(directory, filename) {
  const match = /^(\d{1,2})-(.+)\.docx$/i.exec(filename);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1 || number > 99) return null;
  const checklistNumber = String(number).padStart(2, "0");
  const allowedDepartments = departmentsForChecklistNumber(checklistNumber);
  if (allowedDepartments.length === 0) return null;
  const absolutePath = path.join(directory, filename);
  validateDocxBuffer(fs.readFileSync(absolutePath), filename);
  return {
    id: `checklist-${checklistNumber}`,
    defaultName: match[2].trim(),
    sourceName: filename,
    number: checklistNumber,
    allowedDepartments,
    path: absolutePath,
  };
}

export function getChecklistCatalogInfo() {
  const directory = configuredChecklistDirectory();
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    return { directory, templates: [], invalidTemplates: [] };
  }
  const templates = [];
  const invalidTemplates = [];
  for (const filename of fs.readdirSync(directory).filter((name) => name.toLowerCase().endsWith(".docx")).sort()) {
    try {
      const template = approvedTemplateFromFilename(directory, filename);
      if (template) templates.push(template);
      else invalidTemplates.push({ sourceName: filename, error: "Filename or checklist number is not approved" });
    } catch (error) {
      invalidTemplates.push({ sourceName: filename, error: error.message });
    }
  }
  templates.sort((left, right) => Number(left.number) - Number(right.number));
  return { directory, templates, invalidTemplates };
}

export function publicChecklistTemplate(template) {
  return {
    id: template.id,
    defaultName: template.defaultName,
    sourceName: template.sourceName,
    number: template.number,
    allowedDepartments: [...template.allowedDepartments],
  };
}

export function defaultChecklistConfiguration(approvedTemplates = getChecklistCatalogInfo().templates) {
  return {
    entries: approvedTemplates.map((template) => ({
      id: template.id,
      name: template.defaultName,
      departments: [...template.allowedDepartments],
    })),
  };
}

export function validateChecklistConfiguration(input, approvedTemplates = getChecklistCatalogInfo().templates) {
  if (!input || !Array.isArray(input.entries) || input.entries.length > 100) {
    throw checklistError("Checklist configuration must contain an entries array with at most 100 items");
  }
  const approved = new Map(approvedTemplates.map((template) => [template.id, template]));
  const seen = new Set();
  const entries = input.entries.map((entry) => {
    const id = String(entry?.id || "").trim();
    const template = approved.get(id);
    if (!template) throw checklistError(`Checklist template is not approved: ${id || "unknown"}`);
    if (seen.has(id)) throw checklistError(`Checklist template is duplicated: ${id}`);
    seen.add(id);
    const name = String(entry?.name || "").trim();
    if (!name || name.length > 150) throw checklistError("Checklist name is required and must be 150 characters or fewer");
    if (!Array.isArray(entry?.departments)) throw checklistError(`Departments are required for ${id}`);
    let departments;
    try {
      departments = normalizeChecklistDepartmentList(entry.departments);
    } catch (error) {
      throw checklistError(`${error.message} Checklist: ${id}.`, "CHECKLIST_DEPARTMENT_UNRECOGNIZED");
    }
    if (departments.some((department) => !template.allowedDepartments.includes(department))) {
      throw checklistError(`Checklist ${id} cannot be assigned outside its approved department mapping`);
    }
    return { id, name, departments };
  });
  entries.sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
  return { entries };
}

export function checklistConfiguration(storedValue, approvedTemplates = getChecklistCatalogInfo().templates) {
  if (!storedValue || !Array.isArray(storedValue.entries)) return defaultChecklistConfiguration(approvedTemplates);
  return validateChecklistConfiguration(storedValue, approvedTemplates);
}

export function checklistOptions({ requestType, department, configuration, approvedTemplates }) {
  const type = String(requestType || "").trim().toUpperCase();
  if (!["IR", "CPR"].includes(type)) return [];
  const workflowDepartment = requiredChecklistDepartment(department);
  const templates = approvedTemplates || getChecklistCatalogInfo().templates;
  const config = configuration || defaultChecklistConfiguration(templates);
  const approved = new Map(templates.map((template) => [template.id, template]));
  return config.entries
    .filter((entry) => entry.departments.includes(workflowDepartment))
    .filter((entry) => approved.get(entry.id)?.allowedDepartments.includes(workflowDepartment))
    .map((entry) => ({
      id: entry.id,
      number: approved.get(entry.id).number,
      name: entry.name,
    }));
}

export function validateChecklistSelection({
  checklistId,
  requestType,
  department,
  location,
  configuration,
  approvedTemplates,
  requireConfigured = true,
  requireLocation = true,
}) {
  const id = String(checklistId || "").trim();
  if (!id) return null;
  const type = String(requestType || "").trim().toUpperCase();
  if (!["IR", "CPR"].includes(type)) throw checklistError("Checklists are available only for IR and CPR requests");
  const workflowDepartment = requiredChecklistDepartment(department);
  const locationCode = checklistLocationCode(location);
  if (requireLocation && !locationCode) throw checklistError("Location must end in two digits when a checklist is selected");
  const templates = approvedTemplates || getChecklistCatalogInfo().templates;
  const template = templates.find((entry) => entry.id === id);
  if (!template) throw checklistError("The selected checklist template is missing, invalid, or not approved");
  if (!template.allowedDepartments.includes(workflowDepartment)) {
    throw checklistError("The selected checklist is not eligible for this department");
  }
  let name = template.defaultName;
  if (requireConfigured) {
    const config = configuration || defaultChecklistConfiguration(templates);
    const configured = config.entries.find((entry) => entry.id === id && entry.departments.includes(workflowDepartment));
    if (!configured) throw checklistError("The selected checklist is not assigned to this department");
    name = configured.name;
  }
  return {
    id,
    number: template.number,
    name,
    department: workflowDepartment,
    locationCode,
    templatePath: template.path,
    sourceName: template.sourceName,
  };
}
