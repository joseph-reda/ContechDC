import { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL } from "../../config";
import { copyAllRows, copyRow, displayedDescription } from "../../excelClipboardService";
import { displayTimestamp } from "../../utils/documentDisplay";
import { rowsInProjectTypeSection } from "../../utils/dcSections";
import DcRequestForm from "./DcRequestForm";
import DcProjectSections from "./DcProjectSections";
import DocumentReferences from "./DocumentReferences";

const typeStyles = {
  IR: "border-blue-200 bg-blue-50 text-blue-700",
  CPR: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PPIR: "border-orange-200 bg-orange-50 text-orange-700",
  TR: "border-cyan-200 bg-cyan-50 text-cyan-700",
  REVISION: "border-violet-200 bg-violet-50 text-violet-700",
};

function numberFor(item) {
  return item.irNo || item.revNo || item.sdNo || "—";
}

function typeFor(item) {
  if (item.isRevision || item.requestType === "REVISION") return "REVISION";
  return String(item.requestType || (item.isCPR ? "CPR" : "IR")).toUpperCase();
}

function Pill({ children, className = "border-slate-200 bg-slate-50 text-slate-700" }) {
  return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-bold ${className}`}>{children}</span>;
}

function Stat({ label, value, tone = "text-slate-900" }) {
  return (
    <div className="min-w-0 border-r border-slate-200 px-5 py-4 last:border-r-0">
      <div className={`text-2xl font-bold tracking-tight ${tone}`}>{value ?? 0}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function Toast({ value }) {
  if (!value.message) return null;
  const color = value.type === "error" ? "border-red-200 bg-red-50 text-red-800" : value.type === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div role="status" className={`fixed right-5 top-20 z-50 rounded-lg border px-4 py-3 text-sm font-semibold shadow-lg ${color}`}>{value.message}</div>;
}

export default function DcWorkspacePage({ fixedType = "", creationType = "", groupByProject = false, groupByType = false, title = "Document control queue", subtitle = "Review, issue, copy and archive project records from one table." }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, completed: 0, downloaded: 0, byType: {} });
  const [filterOptions, setFilterOptions] = useState({ projects: [], departments: [] });
  const [filters, setFilters] = useState({ q: "", type: fixedType || "all", project: "all", department: "all", status: "all", sort: "oldest" });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ message: "", type: "success" });
  const [busy, setBusy] = useState({});
  const [editingId, setEditingId] = useState("");
  const [serialDraft, setSerialDraft] = useState("");
  const [referenceItem, setReferenceItem] = useState(null);
  const [referenceDraft, setReferenceDraft] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [copyingGroup, setCopyingGroup] = useState("");

  const user = useMemo(() => JSON.parse(localStorage.getItem("user") || "{}"), []);
  const group = groupByProject ? "project-type" : groupByType ? "type" : "";

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast({ message: "", type: "success" }), type === "warning" ? 7000 : 3000);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "25",
          ...filters,
          type: fixedType || filters.type,
          group,
        });
        const response = await fetch(`${API_URL}/dc/queue?${params}`, { signal: controller.signal, credentials: "include" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load the document queue");
        setItems(data.items || []);
        setSummary(data.summary || {});
        setFilterOptions(data.filters || { projects: [], departments: [] });
        setTotalPages(data.totalPages || 1);
        if (page > (data.totalPages || 1)) setPage(data.totalPages || 1);
        setTotal(data.total || 0);
      } catch (caught) {
        if (caught.name !== "AbortError") { setError(caught.message); setItems([]); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, filters.q ? 250 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [filters, fixedType, group, page, refreshToken]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const withBusy = async (id, task) => {
    setBusy((current) => ({ ...current, [id]: true }));
    try { await task(); } finally { setBusy((current) => ({ ...current, [id]: false })); }
  };

  const downloadWord = (item, part = typeFor(item) === "CPR" ? "cover" : "main") => withBusy(item.uniqueId || item.id, async () => {
    try {
      const response = await fetch(`${API_URL}/dc/documents/${item.uniqueId || item.id}/word`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ part }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Word generation failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${numberFor(item)}${typeFor(item) === "CPR" ? `-${part}` : ""}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      notify(`Word downloaded using ${response.headers.get("x-contech-template") || "the company template"}`);
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      notify(caught.message, "error");
    }
  });

  const markDone = (item) => withBusy(item.uniqueId || item.id, async () => {
    try {
      const response = await fetch(`${API_URL}/${item.collection || item.sourceCollection || (item.isRevision ? "revs" : "irs")}/mark-done`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniqueId: item.uniqueId || item.id, downloadedBy: user.username || "dc" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not complete the record");
      notify("Record marked as completed");
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      notify(caught.message, "error");
    }
  });

  const archive = (item) => {
    if (!window.confirm(`Archive ${numberFor(item)}?`)) return;
    withBusy(item.uniqueId || item.id, async () => {
      try {
        const response = await fetch(`${API_URL}/archive`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uniqueId: item.uniqueId || item.id, collection: item.collection || item.sourceCollection || (item.isRevision ? "revs" : "irs"), role: "dc" }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Archive failed");
        notify("Record moved to archive");
        setRefreshToken((value) => value + 1);
      } catch (caught) {
        notify(caught.message, "error");
      }
    });
  };

  const saveSerial = (item) => withBusy(item.uniqueId || item.id, async () => {
    const serial = Number(serialDraft.trim());
    if (!/^\d+$/.test(serialDraft.trim()) || !Number.isSafeInteger(serial) || serial < 1) {
      notify("Enter a valid serial number", "error");
      return;
    }
    try {
      const response = await fetch(`${API_URL}/irs/update-ir-number`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniqueId: item.uniqueId || item.id, newSerial: serial }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Serial update failed");
      setEditingId("");
      setSerialDraft("");
      const duplicates = data.duplicateSerialRequests || [];
      notify(duplicates.length
        ? `Number updated to ${data.irNo}. Warning: serial ${serial} is also associated with ${duplicates.map((other) => other.irNo).join(", ")}.`
        : `Number updated to ${data.irNo}`, duplicates.length ? "warning" : "success");
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      notify(caught.message, "error");
    }
  });

  const editReferences = (item) => {
    const existing = item.refDrawings || item.refSD || item.SDAttatch || [];
    setReferenceItem(item);
    setReferenceDraft((Array.isArray(existing) ? existing : String(existing).split(/[\r\n,;]+/)).join("\n"));
  };

  const saveReferences = () => {
    if (!referenceItem) return;
    const id = referenceItem.uniqueId || referenceItem.id;
    withBusy(id, async () => {
      try {
        const response = await fetch(`${API_URL}/dc/documents/${id}/references`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refDrawings: referenceDraft.split(/[\r\n,;]+/) }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "References could not be saved");
        setItems((current) => current.map((item) => (item.uniqueId || item.id) === id ? data.item : item));
        setReferenceItem(null);
        setReferenceDraft("");
        notify("Ref Drawings saved. You can now download the Word file.");
      } catch (caught) {
        notify(caught.message, "error");
      }
    });
  };

  const copyOne = async (item) => {
    try {
      await copyRow(item);
      notify("One Excel row copied");
    } catch (caught) { notify(caught.message, "error"); }
  };

  const copyAllFunction = async (project, type, sectionItems) => {
    if (!["IR", "TR", "CPR"].includes(type) || copyingGroup) return;
    const groupKey = JSON.stringify([project, type]);
    setCopyingGroup(groupKey);
    try {
      const copyable = rowsInProjectTypeSection(sectionItems, project, type);
      if (!copyable.length) throw new Error("No copyable records are in this section");
      await copyAllRows(copyable);
      notify(`${copyable.length} displayed ${type} rows copied from ${project || "Unassigned"}`);
    } catch (caught) { notify(caught.message, "error"); }
    finally { setCopyingGroup(""); }
  };

  const renderRecordRow = (item) => {
    const id = item.uniqueId || item.id;
    const type = typeFor(item);
    const isBusy = busy[id];
    const submitted = displayTimestamp(item.sentAt || item.createdAt || item.receivedDate);
    return <tr key={id} className="align-top hover:bg-slate-50">
      <td className="px-4 py-4">
        {editingId === id ? <div className="flex items-center gap-2"><input autoFocus value={serialDraft} onChange={(event) => setSerialDraft(event.target.value)} className="w-24 rounded border px-2 py-1 font-mono text-xs" /><button onClick={() => saveSerial(item)} className="text-xs font-bold text-blue-700">Save</button><button onClick={() => setEditingId("")} className="text-xs text-slate-500">Cancel</button></div>
          : <div><div className="max-w-[260px] break-words font-mono text-xs font-bold text-slate-900">{numberFor(item)}</div>{!item.isRevision && <button onClick={() => { setEditingId(id); setSerialDraft(String(item.serialNumber || numberFor(item).match(/\d+$/)?.[0] || "")); }} className="mt-2 text-xs font-semibold text-blue-700 hover:underline">Edit serial</button>}</div>}
      </td>
      <td className="px-4 py-4"><Pill className={typeStyles[type] || typeStyles.IR}>{type}</Pill><div className="mt-2 max-w-[150px] text-xs text-slate-500">{item.locationType || item.typesMap?.[item.location || item.floor] || "—"}</div>{item.category && <div className="mt-1 max-w-[150px] text-xs text-slate-500">{item.category}</div>}</td>
      <td className="px-4 py-4"><div className="font-semibold">{item.project || "—"}</div><div className="mt-1 text-xs text-slate-500">{item.department || "—"}</div></td>
      <td className="max-w-[420px] px-4 py-4"><div className="font-medium text-slate-800">{displayedDescription(item)}</div><div className="mt-1 text-xs text-slate-500">{item.location || item.floor || "No location"}</div><DocumentReferences item={item} /></td>
      <td className="px-4 py-4"><div>{item.user || "—"}</div><div className="mt-1 text-xs text-slate-500">{submitted.date}</div>{submitted.time && <div className="dc-record-time">{submitted.time}</div>}</td>
      <td className="px-4 py-4">{type === "CPR" && item.wordDownloads && <div className="mb-2 text-xs text-slate-500">{item.wordDownloads.cover ? "Cover ✓" : "Cover pending"} · {item.wordDownloads.checklist ? "Checklist ✓" : "Checklist pending"}</div>}<Pill className={item.isDone ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{item.isDone ? "Completed" : "Pending"}</Pill>{item.downloadedBy && <div className="mt-2 text-xs text-slate-500">by {item.downloadedBy}</div>}</td>
      <td className="px-4 py-4"><div className="dc-row-actions"><button disabled={isBusy || item.isRevision} onClick={() => copyOne(item)} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Copy</button>{!item.isRevision && type !== "CPR" && <button disabled={isBusy} onClick={() => editReferences(item)} className="rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 disabled:opacity-40">Edit Ref Drawings</button>}{!item.isRevision && <button disabled={isBusy} onClick={() => downloadWord(item)} className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{type === "CPR" ? "Cover Word" : "Word"}</button>}{type === "CPR" && <button disabled={isBusy} onClick={() => downloadWord(item, "checklist")} className="rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 disabled:opacity-40">Pouring checklist · 2 pages</button>}{item.isRevision && !item.isDone && <button disabled={isBusy} onClick={() => markDone(item)} className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Complete</button>}<button disabled={isBusy} onClick={() => archive(item)} className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-40">Archive</button></div></td>
    </tr>;
  };

  return (
    <main className={`dc-workspace min-h-screen bg-slate-100 pb-12 text-slate-900 ${creationType === "TR" ? "dc-tr-workspace" : ""}`}>
      <Toast value={toast} />
      <div className="mx-auto max-w-[1600px] px-4 py-7 lg:px-8">
        <header className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Document Control</div>
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setRefreshToken((value) => value + 1)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Refresh</button>
          </div>
        </header>

        <section className={`mb-5 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:grid-cols-4 ${!fixedType ? "lg:grid-cols-8" : ""}`}>
          <Stat label="Matching records" value={summary.total} />
          <Stat label="Pending" value={summary.pending} tone="text-amber-700" />
          <Stat label="Completed" value={summary.completed} tone="text-emerald-700" />
          <Stat label="Downloaded" value={summary.downloaded} tone="text-blue-700" />
          {!fixedType && <><Stat label="IR" value={summary.byType?.IR} /><Stat label="CPR" value={summary.byType?.CPR} /><Stat label="TR" value={summary.byType?.TR} tone="text-cyan-700" /><Stat label="Revisions" value={summary.byType?.REVISION} tone="text-violet-700" /></>}
        </section>

        {fixedType === "TR" && creationType === "TR" && <DcRequestForm onCreated={() => { setPage(1); setRefreshToken((value) => value + 1); }} />}

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {creationType === "TR" && <div className="tr-register-heading"><div><span>02 · Project register</span><h2>Manage test reports</h2><p>Find a report, update its details, copy register rows or download its Word form.</p></div><strong>{total} matching reports</strong></div>}
          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-7">
            <input aria-label="Search documents" value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search number, project, description..." className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 xl:col-span-2" />
            {!fixedType && (
              <select aria-label="Document type" value={filters.type} onChange={(event) => updateFilter("type", event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="all">All types</option><option value="IR">IR</option><option value="CPR">CPR</option><option value="TR">TR</option><option value="REVISION">Revisions</option>
              </select>
            )}
            <select aria-label="Project" value={filters.project} onChange={(event) => updateFilter("project", event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="all">All projects</option>{filterOptions.projects.map((project) => <option key={project}>{project}</option>)}
            </select>
            <select aria-label="Discipline" value={filters.department} onChange={(event) => updateFilter("department", event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="all">All departments</option>{filterOptions.departments.map((department) => <option key={department}>{department}</option>)}
            </select>
            <select aria-label="Status" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="all">All statuses</option><option value="pending">Pending</option><option value="completed">Completed</option>
            </select>
            <select aria-label="Sort order" value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="oldest">Oldest first</option><option value="newest">Newest first</option>
            </select>
          </div>

          {error && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div>}
          <DcProjectSections
            items={items}
            columns={["Document number", "Request / location type", "Project and discipline", "Description and location", "Submitted", "Status", "Actions"]}
            renderRow={renderRecordRow}
            onCopyAll={copyAllFunction}
            copyingGroup={copyingGroup}
            loading={loading}
          />
          {!loading && items.length === 0 && <div className="px-6 py-16 text-center"><div className="text-lg font-bold">No matching records</div><div className="mt-2 text-sm text-slate-500">Change the filters or refresh the queue.</div></div>}
          {loading && <div className="px-6 py-12 text-center text-sm font-semibold text-slate-500">Loading document records...</div>}
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-slate-500">{total} records · Page {page} of {totalPages}</div>
            <div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded border px-4 py-2 font-semibold disabled:opacity-40">Previous</button><button disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded border px-4 py-2 font-semibold disabled:opacity-40">Next</button></div>
          </div>
        </section>
        {referenceItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-label="Edit Ref Drawings">
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold">Edit Ref Drawings / SD Attach</h2>
            <p className="mt-1 text-sm text-slate-600">{numberFor(referenceItem)} · Enter one reference per line. The Word export adds this request’s project and discipline.</p>
            <textarea value={referenceDraft} onChange={(event) => setReferenceDraft(event.target.value)} rows={7} className="mt-4 w-full rounded-lg border border-slate-300 p-3 font-mono text-sm" placeholder="One drawing reference per line" />
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setReferenceItem(null)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" disabled={busy[referenceItem.uniqueId || referenceItem.id]} onClick={saveReferences} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save references</button></div>
          </div>
        </div>}
      </div>
    </main>
  );
}
