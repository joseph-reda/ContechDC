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

export function projectRequestArchiveKey(project, requestType) {
  return JSON.stringify([project, requestType]);
}

export function archiveProjectRequestsConfirmation({ project, requestType, count }) {
  const noun = count === 1 ? "record" : "records";
  return `Are you sure you want to archive all ${requestType} records for Project ${project}?\n\n${count} active ${noun} will be archived and hidden from active lists.`;
}

export async function previewProjectRequestsArchive(apiUrl, project, requestType) {
  return postProjectRequestArchive(apiUrl, { project, requestType, preview: true });
}

export async function archiveProjectRequests(apiUrl, project, requestType) {
  return postProjectRequestArchive(apiUrl, { project, requestType });
}

