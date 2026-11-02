import { useEffect, useState } from "react";

import { API_URL } from "../config";
import { LoadingIndicator, useNotifications } from "../components/Feedback";
import DocumentReferences from "../components/dc/DocumentReferences";
import { disciplineLabel, groupDcSections, requestTypeOf } from "../utils/dcSections";
import { displayTimestamp } from "../utils/documentDisplay";

const EMPTY_FILTERS = { q: "", type: "all", project: "all", department: "all", status: "all", requester: "all", archivedBy: "all", action: "all", dateFrom: "", dateTo: "" };

function numberFor(item) { return item.irNo || item.revNo || item.sdNo || "—"; }
function collectionFor(item) { return item.collection || item.sourceCollection || (item.isRevision ? "revs" : item.sdNo ? "shopdrawings" : "irs"); }

function ArchiveTable({ items, busy, onRestore, onDelete, onAction }) {
  return <div className="dc-table-scroll"><table className="w-full min-w-[1250px] text-left text-sm">
    <thead><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Requester</th><th className="px-4 py-3">Archived by</th><th className="px-4 py-3">Archived at</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">References</th><th className="px-4 py-3 text-right">Operations</th></tr></thead>
    <tbody>{items.map((item) => {
      const id = item.uniqueId || item.id;
      const archived = displayTimestamp(item.archivedAt);
      return <tr key={id} className="align-top">
        <td className="px-4 py-4"><div className="max-w-[250px] break-words font-mono text-xs font-bold">{numberFor(item)}</div><div className="mt-2 text-xs text-slate-500">{requestTypeOf(item)} · {item.isDone ? "Completed" : "Pending"}</div></td>
        <td className="max-w-[370px] px-4 py-4"><div className="font-medium">{item.desc || item.revNote || item.subject || "No description"}</div><div className="mt-1 text-xs text-slate-500">{item.location || item.floor || "No location"}</div></td>
        <td className="px-4 py-4"><div className="font-semibold">{item.requesterName || "Unknown"}</div><div className="mt-1 text-xs text-slate-500">{item.user || "Unknown"}</div></td>
        <td className="px-4 py-4"><div className="font-semibold">{item.archivedByName || "Unknown"}</div><div className="mt-1 text-xs text-slate-500">{item.archivedBy || "Unknown"}</div></td>
        <td className="px-4 py-4"><div>{archived.date}</div>{archived.time && <div className="dc-record-time">{archived.time}</div>}</td>
        <td className="px-4 py-4"><select aria-label={`Action for ${numberFor(item)}`} disabled={busy[id]} value={item.action || ""} onChange={(event) => onAction(item, event.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"><option value="">—</option><option>A</option><option>B</option><option>C</option><option>D</option></select></td>
        <td className="px-4 py-4"><DocumentReferences item={item} /></td>
        <td className="px-4 py-4"><div className="dc-row-actions"><button disabled={busy[id]} aria-busy={busy[id]} onClick={() => onRestore(item)} className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{busy[id] ? "Working…" : "Restore"}</button><button disabled={busy[id]} onClick={() => onDelete(item)} className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40">Delete</button></div></td>
      </tr>;
    })}</tbody>
  </table></div>;
}

function GroupedArchive(props) {
  return <div className="dc-project-cards">{groupDcSections(props.items).map(({ project, sections }) => <section key={project} className="dc-project-card">
    <header className="dc-project-card-header"><div><span>Project</span><h3>{project || "Unassigned"}</h3></div><strong>{sections.reduce((sum, section) => sum + section.items.length, 0)} archived</strong></header>
    <div className="dc-project-card-body">{sections.map(({ type, disciplines, items }) => <section key={type} className={`dc-type-subsection dc-type-subsection-${type.toLowerCase()}`}>
      <div className="dc-type-subsection-header"><div><h4>{type}</h4><span>{items.length} archived records</span></div></div>
      {disciplines.map(({ discipline, items: disciplineItems }) => <section key={discipline || "unassigned"} className="dc-discipline-section"><div className="dc-discipline-header"><div><h5>{disciplineLabel(discipline)}</h5><span>{disciplineItems.length} records</span></div></div><ArchiveTable {...props} items={disciplineItems} /></section>)}
    </section>)}</div>
  </section>)}</div>;
}

function ArchiveFilters({ value, options, onChange, onClear, loading }) {
  const set = (key) => (event) => onChange(key, event.target.value);
  return <section className="border-b border-slate-200 p-4" aria-busy={loading}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    <label className="grid gap-1 text-xs font-bold text-slate-600 xl:col-span-2">Search<input value={value.q} onChange={set("q")} placeholder="Number, description, requester, archiver…" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
    <label className="grid gap-1 text-xs font-bold text-slate-600">Request type<select value={value.type} onChange={set("type")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All types</option><option>IR</option><option>CPR</option><option>TR</option><option>REVISION</option><option>SD</option></select></label>
    <label className="grid gap-1 text-xs font-bold text-slate-600">Project<select value={value.project} onChange={set("project")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All projects</option>{(options.projects || []).map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="grid gap-1 text-xs font-bold text-slate-600">Discipline<select value={value.department} onChange={set("department")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All disciplines</option>{(options.departments || []).map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="grid gap-1 text-xs font-bold text-slate-600">Status<select value={value.status} onChange={set("status")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All statuses</option><option value="pending">Pending</option><option value="completed">Completed</option></select></label>
    <label className="grid gap-1 text-xs font-bold text-slate-600">Requester<select value={value.requester} onChange={set("requester")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All requesters</option>{(options.requesters || []).map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="grid gap-1 text-xs font-bold text-slate-600">Archived by<select value={value.archivedBy} onChange={set("archivedBy")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All archivers</option>{(options.archivedBy || []).map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="grid gap-1 text-xs font-bold text-slate-600">Action<select value={value.action} onChange={set("action")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All actions</option><option value="none">No action</option><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
    <label className="grid gap-1 text-xs font-bold text-slate-600">From<input type="date" value={value.dateFrom} onChange={set("dateFrom")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
    <label className="grid gap-1 text-xs font-bold text-slate-600">To<input type="date" value={value.dateTo} onChange={set("dateTo")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
  </div><div className="mt-4 flex justify-end border-t border-slate-100 pt-4"><button type="button" disabled={loading} onClick={onClear} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40">Clear filters</button></div></section>;
}

export default function DcArchive() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, completed: 0, byType: {} });
  const [options, setOptions] = useState({ projects: [], departments: [], archivedBy: [], requesters: [] });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});
  const [refreshToken, setRefreshToken] = useState(0);
  const { notify } = useNotifications();

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ ...filters, page: String(page), pageSize: "25" });
        const response = await fetch(`${API_URL}/archive/dc?${params}`, { credentials: "include", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Archive could not be loaded");
        setItems(data.archive || []); setSummary(data.summary || {}); setOptions(data.filters || {}); setTotalPages(data.totalPages || 1);
        if (page > (data.totalPages || 1)) setPage(data.totalPages || 1);
      } catch (caught) { if (caught.name !== "AbortError") setError(caught.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, filters.q ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [filters, page, refreshToken]);

  const updateFilter = (key, value) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })); };
  const runBusy = async (item, task) => { const id = item.uniqueId || item.id; setBusy((current) => ({ ...current, [id]: true })); try { await task(); } finally { setBusy((current) => ({ ...current, [id]: false })); } };

  const restore = (item) => runBusy(item, async () => {
    try {
      const response = await fetch(`${API_URL}/unarchive`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uniqueId: item.uniqueId || item.id, collection: collectionFor(item) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Restore failed"); notify("Record restored to the active queue"); setRefreshToken((value) => value + 1);
    } catch (caught) { notify(caught.message, "error"); }
  });

  const remove = (item) => {
    if (!window.confirm(`Permanently delete ${numberFor(item)}? This cannot be undone.`)) return;
    runBusy(item, async () => { try { const response = await fetch(`${API_URL}/${collectionFor(item)}/delete`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uniqueId: item.uniqueId || item.id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Delete failed"); notify("Record permanently deleted"); setRefreshToken((value) => value + 1); } catch (caught) { notify(caught.message, "error"); } });
  };

  const updateAction = (item, action) => runBusy(item, async () => { try { const response = await fetch(`${API_URL}/update-action`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uniqueId: item.uniqueId || item.id, collection: collectionFor(item), action }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Action update failed"); notify(`Action updated to ${action || "blank"}`); setRefreshToken((value) => value + 1); } catch (caught) { notify(caught.message, "error"); } });

  return <main className="dc-workspace min-h-screen bg-slate-100 pb-12 text-slate-900">
    <div className="mx-auto max-w-[1700px] px-4 py-7 lg:px-8">
      <header className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Document Control</div><h1 className="text-3xl font-bold tracking-tight">Archive register</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Audit archived records by project, request type and discipline, with trusted requester and archiver attribution.</p></div><button onClick={() => setRefreshToken((value) => value + 1)} disabled={loading} aria-busy={loading} className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Refreshing…" : "Refresh archive"}</button></header>
      <section className="mb-5 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:grid-cols-6">{[["Archived", summary.total], ["Pending", summary.pending], ["Completed", summary.completed], ["IR", summary.byType?.IR], ["CPR", summary.byType?.CPR], ["TR", summary.byType?.TR]].map(([label, value]) => <div key={label} className="border-r border-slate-200 px-5 py-4 last:border-0"><div className="text-2xl font-bold">{value || 0}</div><div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div></div>)}</section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-busy={loading}>
        <ArchiveFilters value={filters} options={options} onChange={updateFilter} onClear={() => { setPage(1); setFilters(EMPTY_FILTERS); }} loading={loading} />
        {error && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{error}</div>}
        {loading && <div className="px-6 py-14 text-center"><LoadingIndicator label="Loading archive…" /></div>}
        {!loading && items.length > 0 && <GroupedArchive items={items} busy={busy} onRestore={restore} onDelete={remove} onAction={updateAction} />}
        {!loading && !items.length && <div className="px-6 py-16 text-center"><div className="text-lg font-bold">No archived records match these filters</div></div>}
        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div className="text-slate-500">{summary.total || 0} archived records · Page {page} of {totalPages}</div><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded border px-4 py-2 font-semibold disabled:opacity-40">Previous</button><button disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded border px-4 py-2 font-semibold disabled:opacity-40">Next</button></div></div>
      </section>
    </div>
  </main>;
}
