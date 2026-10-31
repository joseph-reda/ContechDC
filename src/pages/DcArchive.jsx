import { useCallback, useEffect, useState } from "react";

import { API_URL } from "../config";
import DocumentReferences from "../components/dc/DocumentReferences";
import { displayTimestamp } from "../utils/documentDisplay";

const typeColors = {
  IR: "border-blue-200 bg-blue-50 text-blue-700",
  CPR: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PPIR: "border-orange-200 bg-orange-50 text-orange-700",
  TR: "border-cyan-200 bg-cyan-50 text-cyan-700",
  REVISION: "border-violet-200 bg-violet-50 text-violet-700",
  SD: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
};

function documentNumber(item) {
  return item.irNo || item.revNo || item.sdNo || "—";
}

function documentType(item) {
  if (item.isRevision) return "REVISION";
  if (item.sdNo) return "SD";
  return String(item.requestType || (item.isCPR ? "CPR" : "IR")).toUpperCase();
}

function Stat({ label, value, color = "text-slate-900" }) {
  return <div className="border-r border-slate-200 px-5 py-4 last:border-r-0"><div className={`text-2xl font-bold ${color}`}>{value || 0}</div><div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div></div>;
}

export default function DcArchive() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, completed: 0, byType: {} });
  const [options, setOptions] = useState({ projects: [], departments: [], archivedBy: [] });
  const [filters, setFilters] = useState({ q: "", type: "all", project: "all", department: "all", status: "all", archivedBy: "all", action: "all" });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});
  const [message, setMessage] = useState({ text: "", error: false });
  const [refreshToken, setRefreshToken] = useState(0);

  const notify = useCallback((text, errorValue = false) => {
    setMessage({ text, error: errorValue });
    window.setTimeout(() => setMessage({ text: "", error: false }), 3000);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: "25", ...filters });
        const response = await fetch(`${API_URL}/archive/dc?${params}`, { credentials: "include", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Archive could not be loaded");
        setItems(data.archive || []);
        setSummary(data.summary || {});
        setOptions(data.filters || {});
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } catch (caught) {
        if (caught.name !== "AbortError") setError(caught.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, filters.q ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [filters, page, refreshToken]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const runBusy = async (item, callback) => {
    const id = item.uniqueId || item.id;
    setBusy((current) => ({ ...current, [id]: true }));
    try { await callback(); } finally { setBusy((current) => ({ ...current, [id]: false })); }
  };

  const restore = (item) => runBusy(item, async () => {
    try {
      const response = await fetch(`${API_URL}/unarchive`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniqueId: item.uniqueId || item.id, collection: item.collection || item.sourceCollection || (item.isRevision ? "revs" : item.sdNo ? "shopdrawings" : "irs") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Restore failed");
      notify("Record restored to the active queue");
      setRefreshToken((value) => value + 1);
    } catch (caught) { notify(caught.message, true); }
  });

  const permanentlyDelete = (item) => {
    if (!window.confirm(`Permanently delete ${documentNumber(item)}? This cannot be undone.`)) return;
    runBusy(item, async () => {
      try {
        const collection = item.collection || item.sourceCollection || (item.isRevision ? "revs" : item.sdNo ? "shopdrawings" : "irs");
        const response = await fetch(`${API_URL}/${collection}/delete`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uniqueId: item.uniqueId || item.id }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Delete failed");
        notify("Record permanently deleted");
        setRefreshToken((value) => value + 1);
      } catch (caught) { notify(caught.message, true); }
    });
  };

  const updateAction = (item, action) => runBusy(item, async () => {
    try {
      const response = await fetch(`${API_URL}/update-action`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniqueId: item.uniqueId || item.id, collection: item.collection || item.sourceCollection || (item.isRevision ? "revs" : item.sdNo ? "shopdrawings" : "irs"), action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Action update failed");
      notify(`Action updated to ${action || "blank"}`);
      setRefreshToken((value) => value + 1);
    } catch (caught) { notify(caught.message, true); }
  });

  return (
    <main className="dc-workspace min-h-screen bg-slate-100 pb-12 text-slate-900">
      {message.text && <div className={`fixed right-5 top-20 z-50 rounded-lg border px-4 py-3 text-sm font-semibold shadow-lg ${message.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{message.text}</div>}
      <div className="mx-auto max-w-[1600px] px-4 py-7 lg:px-8">
        <header className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div><div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Document Control</div><h1 className="text-3xl font-bold tracking-tight">Archive register</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Search and audit archived records in a single register. Restore records when work resumes or permanently remove only confirmed duplicates.</p></div>
          <button onClick={() => setRefreshToken((value) => value + 1)} className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Refresh archive</button>
        </header>

        <section className="mb-5 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:grid-cols-4 lg:grid-cols-8">
          <Stat label="Archived" value={summary.total} /><Stat label="Pending" value={summary.pending} color="text-amber-700" /><Stat label="Completed" value={summary.completed} color="text-emerald-700" /><Stat label="IR" value={summary.byType?.IR} /><Stat label="CPR" value={summary.byType?.CPR} /><Stat label="TR" value={summary.byType?.TR} color="text-cyan-700" /><Stat label="Revisions" value={summary.byType?.REVISION} color="text-violet-700" />
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-7">
            <input aria-label="Search archive" value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search archive..." className="rounded-lg border border-slate-300 px-3 py-2 text-sm xl:col-span-2" />
            <select aria-label="Document type" value={filters.type} onChange={(event) => updateFilter("type", event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">All types</option><option>IR</option><option>CPR</option><option>TR</option><option>REVISION</option><option>SD</option></select>
            <select aria-label="Project" value={filters.project} onChange={(event) => updateFilter("project", event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">All projects</option>{(options.projects || []).map((value) => <option key={value}>{value}</option>)}</select>
            <select aria-label="Discipline" value={filters.department} onChange={(event) => updateFilter("department", event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">All disciplines</option>{(options.departments || []).map((value) => <option key={value}>{value}</option>)}</select>
            <select aria-label="Status" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">All statuses</option><option value="pending">Pending</option><option value="completed">Completed</option></select>
            <select aria-label="Action" value={filters.action} onChange={(event) => updateFilter("action", event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">All actions</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select>
          </div>
          {error && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div>}
          <div className="dc-table-scroll">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-200"><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Project and discipline</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Archived</th><th className="px-4 py-3">Action</th><th className="px-4 py-3 text-right">Operations</th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((item) => {
                  const id = item.uniqueId || item.id;
                  const type = documentType(item);
                  const archived = displayTimestamp(item.archivedAt);
                  return <tr key={id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-4"><div className="max-w-[250px] break-words font-mono text-xs font-bold">{documentNumber(item)}</div><div className="mt-2 text-xs text-slate-500">{item.isDone ? "Completed" : "Pending"}</div></td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-bold ${typeColors[type] || typeColors.IR}`}>{type}</span></td>
                    <td className="px-4 py-4"><div className="font-semibold">{item.project || "—"}</div><div className="mt-1 text-xs text-slate-500">{item.department || "—"}</div></td>
                    <td className="max-w-[420px] px-4 py-4"><div className="font-medium">{item.desc || item.revNote || item.subject || "No description"}</div><div className="mt-1 text-xs text-slate-500">{item.location || "No location"}</div><DocumentReferences item={item} /></td>
                    <td className="px-4 py-4"><div>{archived.date}</div>{archived.time && <div className="dc-record-time">{archived.time}</div>}<div className="mt-1 text-xs text-slate-500">by {item.archivedBy || "—"}</div></td>
                    <td className="px-4 py-4"><select disabled={busy[id]} value={item.action || ""} onChange={(event) => updateAction(item, event.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"><option value="">—</option><option>A</option><option>B</option><option>C</option><option>D</option></select></td>
                    <td className="px-4 py-4"><div className="dc-row-actions"><button disabled={busy[id]} onClick={() => restore(item)} className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Restore</button><button disabled={busy[id]} onClick={() => permanentlyDelete(item)} className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40">Delete</button></div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          {loading && <div className="px-6 py-12 text-center text-sm font-semibold text-slate-500">Loading archive...</div>}
          {!loading && !items.length && <div className="px-6 py-16 text-center"><div className="text-lg font-bold">No archived records match these filters</div></div>}
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div className="text-slate-500">{total} archived records · Page {page} of {totalPages}</div><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded border px-4 py-2 font-semibold disabled:opacity-40">Previous</button><button disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded border px-4 py-2 font-semibold disabled:opacity-40">Next</button></div></div>
        </section>
      </div>
    </main>
  );
}
