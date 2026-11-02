import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { API_URL } from "../config";
import { LoadingIndicator, useNotifications } from "../components/Feedback";
import DocumentReferences from "../components/dc/DocumentReferences";
import { disciplineLabel, groupDcSections, requestTypeOf } from "../utils/dcSections";
import { displayTimestamp } from "../utils/documentDisplay";

const EMPTY_FILTERS = {
  q: "", project: "all", type: "all", department: "all", status: "all",
  requester: "all", action: "all", dateFrom: "", dateTo: "",
};

function numberFor(item) {
  return item.irNo || item.revNo || item.sdNo || item.displayNumber || "—";
}

function RecordTable({ items }) {
  return (
    <div className="dc-table-scroll">
      <table className="w-full min-w-[1050px] text-left text-sm">
        <thead><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Requester</th><th className="px-4 py-3">Submitted</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">References</th><th className="px-4 py-3">Status</th></tr></thead>
        <tbody>{items.map((item) => {
          const submitted = displayTimestamp(item.sentAt || item.createdAt || item.receivedDate);
          return <tr key={item.uniqueId || item.id} className="align-top">
            <td className="px-4 py-4"><div className="max-w-[260px] break-words font-mono text-xs font-bold">{numberFor(item)}</div><div className="mt-2 text-xs text-slate-500">{requestTypeOf(item)}</div></td>
            <td className="max-w-[380px] px-4 py-4"><div className="font-medium">{item.desc || item.revNote || item.subject || "No description"}</div><div className="mt-1 text-xs text-slate-500">{item.location || item.floor || "No location"}</div></td>
            <td className="px-4 py-4"><div className="font-semibold">{item.requesterName || "Unknown"}</div><div className="mt-1 text-xs text-slate-500">{item.user || "Unknown"}</div></td>
            <td className="px-4 py-4"><div>{submitted.date}</div>{submitted.time && <div className="dc-record-time">{submitted.time}</div>}</td>
            <td className="px-4 py-4"><span className="inline-flex min-w-8 justify-center rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{item.action || "—"}</span></td>
            <td className="px-4 py-4"><DocumentReferences item={item} /></td>
            <td className="px-4 py-4"><span className={`inline-flex rounded-md border px-2 py-1 text-xs font-bold ${item.isDone ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{item.isDone ? "Completed" : "Pending"}</span>{item.downloadedBy && <div className="mt-2 text-xs text-slate-500">Downloaded by {item.downloadedBy}</div>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}

function GroupedRecords({ records }) {
  return <div className="dc-project-cards">
    {groupDcSections(records).map(({ project, sections }) => <section key={project} className="dc-project-card">
      <header className="dc-project-card-header"><div><span>Project</span><h3>{project || "Unassigned"}</h3></div><strong>{sections.reduce((sum, section) => sum + section.items.length, 0)} records</strong></header>
      <div className="dc-project-card-body">{sections.map(({ type, disciplines, items }) => <section key={type} className={`dc-type-subsection dc-type-subsection-${type.toLowerCase()}`}>
        <div className="dc-type-subsection-header"><div><h4>{type}</h4><span>{items.length} records</span></div></div>
        {disciplines.map(({ discipline, items: disciplineItems }) => <section key={discipline || "unassigned"} className="dc-discipline-section">
          <div className="dc-discipline-header"><div><h5>{disciplineLabel(discipline)}</h5><span>{disciplineItems.length} records</span></div></div>
          <RecordTable items={disciplineItems} />
        </section>)}
      </section>)}</div>
    </section>)}
  </div>;
}

function Filters({ value, options, onChange, onClear, loading }) {
  const set = (key) => (event) => onChange(key, event.target.value);
  const active = Object.entries(value).some(([key, current]) => current && current !== "all" && !(key === "q" && !current.trim()));
  return <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-busy={loading}>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="grid gap-1 text-xs font-bold text-slate-600 xl:col-span-2">Search<input value={value.q} onChange={set("q")} placeholder="Number, description, location, requester…" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
      <label className="grid gap-1 text-xs font-bold text-slate-600">Project<select value={value.project} onChange={set("project")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All projects</option>{(options.projects || []).map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-bold text-slate-600">Request type<select value={value.type} onChange={set("type")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All types</option><option>IR</option><option>CPR</option><option>TR</option><option value="REVISION">Revision</option><option>SD</option></select></label>
      <label className="grid gap-1 text-xs font-bold text-slate-600">Discipline<select value={value.department} onChange={set("department")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All disciplines</option>{(options.departments || []).map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-bold text-slate-600">Status<select value={value.status} onChange={set("status")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All statuses</option><option value="pending">Pending</option><option value="completed">Completed</option></select></label>
      <label className="grid gap-1 text-xs font-bold text-slate-600">Requester<select value={value.requester} onChange={set("requester")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All requesters</option>{(options.requesters || []).map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-bold text-slate-600">Action<select value={value.action} onChange={set("action")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="all">All actions</option><option value="none">No action</option><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
      <label className="grid gap-1 text-xs font-bold text-slate-600">From<input type="date" value={value.dateFrom} onChange={set("dateFrom")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
      <label className="grid gap-1 text-xs font-bold text-slate-600">To<input type="date" value={value.dateTo} onChange={set("dateTo")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
    </div>
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4"><span className="text-xs text-slate-500">Filters are combined and applied only to records you are authorized to view.</span><button type="button" disabled={!active || loading} onClick={onClear} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40">Clear filters</button></div>
  </section>;
}

export default function EngineerRecords() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useMemo(() => JSON.parse(localStorage.getItem("user") || "null"), []);
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, ...Object.fromEntries([...searchParams].filter(([key]) => key in EMPTY_FILTERS)) }));
  const [page, setPage] = useState(() => Math.max(Number(searchParams.get("page")) || 1, 1));
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, completed: 0, byType: {} });
  const [options, setOptions] = useState({ projects: [], departments: [], requesters: [] });
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const { notify } = useNotifications();

  useEffect(() => { if (!user?.username) navigate("/login", { replace: true }); }, [navigate, user]);

  useEffect(() => {
    const nextFilters = { ...EMPTY_FILTERS, ...Object.fromEntries([...searchParams].filter(([key]) => key in EMPTY_FILTERS)) };
    setFilters((current) => Object.keys(EMPTY_FILTERS).every((key) => current[key] === nextFilters[key]) ? current : nextFilters);
    const nextPage = Math.max(Number(searchParams.get("page")) || 1, 1);
    setPage((current) => current === nextPage ? current : nextPage);
  }, [searchParams]);

  useEffect(() => {
    if (!user?.username) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ ...filters, page: String(page), pageSize: "25" });
        const response = await fetch(`${API_URL}/engineer/records/page?${params}`, { credentials: "include", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Records could not be loaded");
        setRecords(data.records || []); setSummary(data.summary || {}); setOptions(data.filters || {}); setTotalPages(data.totalPages || 1);
        if (page > (data.totalPages || 1)) setPage(data.totalPages || 1);
      } catch (caught) { if (caught.name !== "AbortError") setError(caught.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, filters.q ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [filters, page, refreshToken, user]);

  useEffect(() => {
    const next = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value && value !== "all") next.set(key, value); });
    if (page > 1) next.set("page", String(page));
    setSearchParams(next, { replace: true });
  }, [filters, page, setSearchParams]);

  const updateFilter = useCallback((key, value) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })); }, []);
  const refresh = () => { setRefreshToken((value) => value + 1); notify("Refreshing your records…", "info"); };

  if (!user) return null;
  return <main className="records-workspace min-h-screen p-4 md:p-8">
    <div className="mx-auto max-w-[1800px]">
      <header className="records-page-header mb-6 flex flex-col justify-between gap-5 md:flex-row md:items-center">
        <div><div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Engineer workspace</div><h1 className="text-3xl font-bold">My Records</h1><p className="mt-2 text-slate-600">Records submitted by {user.fullname || user.username}, plus read-only TR records for your IR/CPR projects.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={refresh} disabled={loading} aria-busy={loading} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Refreshing…" : "Refresh"}</button><button onClick={() => navigate("/engineer?type=IR")} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Back to Create</button></div>
      </header>

      <section className="mb-5 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:grid-cols-5">
        {[["Matching", summary.total], ["Pending", summary.pending], ["Completed", summary.completed], ["IR", summary.byType?.IR], ["CPR / TR", (summary.byType?.CPR || 0) + (summary.byType?.TR || 0)]].map(([label, value]) => <div key={label} className="border-r border-slate-200 px-5 py-4 last:border-0"><div className="text-2xl font-bold">{value || 0}</div><div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div></div>)}
      </section>

      <Filters value={filters} options={options} onChange={updateFilter} onClear={() => { setPage(1); setFilters(EMPTY_FILTERS); }} loading={loading} />
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{error}</div>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-busy={loading}>
        {loading && <div className="px-6 py-14 text-center"><LoadingIndicator label="Loading your records…" /></div>}
        {!loading && records.length > 0 && <GroupedRecords records={records} />}
        {!loading && !records.length && <div className="px-6 py-16 text-center"><div className="text-lg font-bold">No records match these filters</div><p className="mt-2 text-sm text-slate-500">Clear or adjust the filters to see your authorized records.</p></div>}
        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div className="text-slate-500">{summary.total || 0} matching records · Page {page} of {totalPages}</div><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded border px-4 py-2 font-semibold disabled:opacity-40">Previous</button><button disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded border px-4 py-2 font-semibold disabled:opacity-40">Next</button></div></div>
      </section>
    </div>
  </main>;
}
