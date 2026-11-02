async function postProjectRequestArchive(apiUrl, payload) {
  const response = await fetch(`${apiUrl}/archive/project-requests`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Archive operation failed");
  return data;
}

export function projectRequestArchiveKey(project, requestType, department = "") {
  return JSON.stringify([project, requestType, department]);
}

export function archiveProjectRequestsConfirmation({ project, requestType, department = "", count }) {
  const noun = count === 1 ? "record" : "records";
  const scope = department ? ` — ${department}` : "";
  return `Are you sure you want to archive all ${requestType}${scope} records for Project ${project}?\n\n${count} active ${noun} will be archived and hidden from active lists.`;
}

export async function previewProjectRequestsArchive(apiUrl, project, requestType, department = "") {
  return postProjectRequestArchive(apiUrl, { project, requestType, ...(department ? { department } : {}), preview: true });
}

export async function archiveProjectRequests(apiUrl, project, requestType, department = "") {
  return postProjectRequestArchive(apiUrl, { project, requestType, ...(department ? { department } : {}) });
}

export async function copyProjectRequests(apiUrl, project, requestType, department = "") {
  const response = await fetch(`${apiUrl}/copy/project-requests`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, requestType, ...(department ? { department } : {}) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Copy operation failed");
  return data;
}

