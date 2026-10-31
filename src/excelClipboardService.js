// The Type column is the configured location type, not the request type.
export const COPY_COLUMNS = ["description", "location", "type", "receivedDate"];

export function displayedDescription(item) {
  if (!item || typeof item !== "object") return "";
  return item.sdNo ? (item.subject || "") : (item.desc || item.revNote || item.subject || "No description");
}

function cell(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function copyDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (name) => parts.find((entry) => entry.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function copyFields(item) {
  if (!item || typeof item !== "object") throw new Error("A record is required");
  return {
    description: displayedDescription(item),
    location: item.location || item.floor || "",
    type: item.locationType || item.typesMap?.[item.location || item.floor] || "",
    receivedDate: copyDate(item.receivedDate || item.sentAt || item.createdAt || item.date),
  };
}

export function convertIRToExcelRow(item) {
  const fields = copyFields(item);
  return COPY_COLUMNS.map((key) => cell(fields[key])).join("\t");
}

export function convertToExcelText(items) {
  if (!Array.isArray(items)) throw new Error("Records must be an array");
  return items.map(convertIRToExcelRow).join("\n");
}

export async function writeClipboardText(value) {
  const text = String(value);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return text;
    }
  } catch {
    // Clipboard API can be denied on the dashboard's HTTP intranet address.
  }
  if (typeof document === "undefined" || !document.body || typeof document.execCommand !== "function") {
    throw new Error("Clipboard access is unavailable. Use a supported browser or a secure connection.");
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  field.style.left = "-9999px";
  const focused = document.activeElement;
  document.body.appendChild(field);
  try {
    field.focus();
    field.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard access was denied.");
  } finally {
    field.remove();
    try { focused?.focus?.(); } catch { /* Clipboard copy already succeeded. */ }
  }
  return text;
}

export async function copyRow(item) {
  return writeClipboardText(convertIRToExcelRow(item));
}

export async function copyAllRows(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("No rows to copy");
  return writeClipboardText(convertToExcelText(items));
}

export default { copyRow, copyAllRows, convertIRToExcelRow, convertToExcelText, displayedDescription, writeClipboardText };
