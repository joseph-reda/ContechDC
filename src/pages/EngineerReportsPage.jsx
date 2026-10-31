import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";

const control = "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800";
const PAGE_SIZE = 25;
const PALETTE = ["#1769d1", "#0f8b8d", "#53a66c", "#e0a02b", "#8465c6", "#d45d67", "#64748b"];

function recordDate(record) {
  return String(record.receivedDate || record.sentAt || record.createdAt || "").slice(0, 10);
}

function recordType(record) {
  if (record.isRevision || record.revNo) return "Revision";
  const type = String(record.requestType || record.type || "IR").toUpperCase();
  return ({ IR: "IR", CPR: "CPR", PPIR: "PPIR", TR: "TR", SD: "Shop Drawing" })[type] || type;
}

function recordStatus(record) {
  return record.isDone ? "Completed" : "Pending";
}

function Field({ label, children }) {
  return <label className="min-w-0 text-xs font-semibold text-slate-600">{label}{children}</label>;
}

function ChartCard({ title, subtitle, children }) {
  return <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-800">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div>
    <div className="p-4">{children}</div>
  </section>;
}

function EmptyChart({ children = "No chart data for this selection." }) {
  return <div className="grid min-h-52 place-items-center rounded-lg bg-slate-50 px-5 text-center text-sm text-slate-500">{children}</div>;
}

function MonthlyChart({ records, loading, error }) {
  const values = useMemo(() => {
    const counts = new Map();
    records.forEach((record) => {
      const date = recordDate(record);
      if (date) {
        const month = date.slice(0, 7);
        counts.set(month, (counts.get(month) || 0) + 1);
      }
    });
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  }, [records]);
  if (loading) return <EmptyChart>Loading activity data…</EmptyChart>;
  if (error) return <EmptyChart>Activity data is unavailable.</EmptyChart>;
  if (!values.length) return <EmptyChart />;
  const max = Math.max(...values.map(([, value]) => value), 1);
  const points = values.map(([month, value], index) => ({
    month, value,
    x: 36 + index * (528 / Math.max(values.length - 1, 1)),
    y: 166 - value / max * 128,
  }));
  return <div className="overflow-x-auto">
    <svg viewBox="0 0 600 220" role="img" aria-label="Records created by month" className="mx-auto block min-w-[480px] w-full max-w-[680px]">
      {[0, 1, 2, 3].map((step) => <g key={step}><line x1="35" x2="570" y1={38 + step * 42} y2={38 + step * 42} stroke="#e8edf3"/><text x="27" y={42 + step * 42} textAnchor="end" fill="#8290a2" fontSize="10">{Math.round(max * (3 - step) / 3)}</text></g>)}
      <polyline points={points.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="#1769d1" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {points.map(({ month, value, x, y }) => <g key={month}><circle cx={x} cy={y} r="5" fill="#fff" stroke="#1769d1" strokeWidth="3"><title>{month}: {value} records</title></circle><text x={x} y="193" textAnchor="middle" fill="#64748b" fontSize="10">{new Date(`${month}-15T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}</text></g>)}
    </svg>
  </div>;
}

function TypeChart({ records, loading, error }) {
  const values = useMemo(() => {
    const counts = {};
    records.forEach((record) => { const label = recordType(record); counts[label] = (counts[label] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [records]);
  if (loading) return <EmptyChart>Loading report type data…</EmptyChart>;
  if (error) return <EmptyChart>Report type data is unavailable.</EmptyChart>;
  if (!values.length) return <EmptyChart />;
  const max = Math.max(...values.map(([, count]) => count));
  return <div className="space-y-4 py-2">
    {values.map(([label, count], index) => <div key={label} className="grid grid-cols-[minmax(74px,105px)_1fr_34px] items-center gap-3 text-xs">
      <span className="truncate font-semibold text-slate-600">{label}</span><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.max(count / max * 100, 3)}%`, background: PALETTE[index % PALETTE.length] }} /></div><span className="text-right font-bold text-slate-700">{count}</span>
    </div>)}
  </div>;
}

function StatusChart({ records, loading, error }) {
  const completed = records.filter((record) => record.isDone).length;
  const pending = records.length - completed;
  if (loading) return <EmptyChart>Loading status data…</EmptyChart>;
  if (error) return <EmptyChart>Status data is unavailable.</EmptyChart>;
  if (!records.length) return <EmptyChart />;
  const completedPercent = completed / records.length * 100;
  return <div className="flex min-h-52 flex-wrap items-center justify-center gap-8 py-3">
    <div className="relative grid h-36 w-36 place-items-center rounded-full" style={{ background: `conic-gradient(#14966f 0 ${completedPercent}%, #e4a32e ${completedPercent}% 100%)` }} role="img" aria-label={`${completed} completed, ${pending} pending`}>
      <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><div><strong className="block text-2xl text-slate-800">{records.length}</strong><span className="text-[10px] uppercase tracking-wide text-slate-500">records</span></div></div>
    </div>
    <div className="space-y-3 text-sm"><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-600"/><span className="text-slate-600">Completed</span><strong className="ml-3">{completed}</strong></div><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-500"/><span className="text-slate-600">Pending</span><strong className="ml-3">{pending}</strong></div></div>
  </div>;
}

export default function EngineerReportsPage() {
  const [allRecords, setAllRecords] = useState([]);
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", project: "all", type: "all", status: "all" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadRecords() {
      setLoading(true);
      setError("");
      try {
        let cursor = {};
        let records = [];
        let hasMore = true;
        while (hasMore) {
          const params = new URLSearchParams({ pageSize: "200" });
          if (Object.keys(cursor).length) params.set("cursors", JSON.stringify(cursor));
          const response = await fetch(`${API_URL}/engineer/records/page?${params}`, { credentials: "include", signal: controller.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not load your reports.");
          records = records.concat(data.records || []);
          cursor = data.cursors || {};
          hasMore = Boolean(data.hasMore);
        }
        setAllRecords(records);
      } catch (caught) {
        if (caught.name !== "AbortError") {
          setError(caught.message || "Could not load your reports.");
          setAllRecords([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadRecords();
    return () => controller.abort();
  }, [refresh]);

  const projects = useMemo(() => [...new Set(allRecords.map((record) => record.project).filter(Boolean))].sort(), [allRecords]);
  const types = useMemo(() => [...new Set(allRecords.map(recordType))].sort(), [allRecords]);
  const filteredRecords = useMemo(() => allRecords.filter((record) => {
    const date = recordDate(record);
    if (filters.dateFrom && (!date || date < filters.dateFrom)) return false;
    if (filters.dateTo && (!date || date > filters.dateTo)) return false;
    if (filters.project !== "all" && record.project !== filters.project) return false;
    if (filters.type !== "all" && recordType(record) !== filters.type) return false;
    if (filters.status !== "all" && recordStatus(record) !== filters.status) return false;
    return true;
  }), [allRecords, filters]);
  const completed = filteredRecords.filter((record) => record.isDone).length;
  const pending = filteredRecords.length - completed;
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const pageRecords = filteredRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [filters]);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => setFilters({ dateFrom: "", dateTo: "", project: "all", type: "all", status: "all" });

  return <main className="dc-workspace min-h-screen pb-12">
    <div className="mx-auto max-w-[1600px] px-4 py-7 lg:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-blue-700">Engineer workspace</p><h1 className="text-3xl font-bold tracking-tight">Reports &amp; Charts</h1><p className="mt-2 text-sm text-slate-600">Track your submitted reports, workload and completion status across projects.</p></div>
        <button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Refresh data</button>
      </header>

      {error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>{error}</span><button onClick={() => setRefresh((value) => value + 1)} className="rounded-md border border-red-300 px-3 py-1.5 font-semibold">Try again</button></div>}

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold text-slate-800">Filter reports</h2><p className="mt-1 text-xs text-slate-500">Choose a date range, project, report type or status.</p></div><button type="button" onClick={clearFilters} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600">Clear filters</button></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="From date"><input type="date" value={filters.dateFrom} onChange={(event) => setFilter("dateFrom", event.target.value)} className={control} /></Field>
          <Field label="To date"><input type="date" min={filters.dateFrom || undefined} value={filters.dateTo} onChange={(event) => setFilter("dateTo", event.target.value)} className={control} /></Field>
          <Field label="Project"><select className={control} value={filters.project} onChange={(event) => setFilter("project", event.target.value)}><option value="all">All projects</option>{projects.map((project) => <option key={project}>{project}</option>)}</select></Field>
          <Field label="Report type"><select className={control} value={filters.type} onChange={(event) => setFilter("type", event.target.value)}><option value="all">All report types</option>{types.map((type) => <option key={type}>{type}</option>)}</select></Field>
          <Field label="Status"><select className={control} value={filters.status} onChange={(event) => setFilter("status", event.target.value)}><option value="all">All statuses</option><option>Pending</option><option>Completed</option></select></Field>
        </div>
      </section>

      <section aria-busy={loading} className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Total reports", filteredRecords.length, "text-slate-900"], ["Pending", pending, "text-amber-700"], ["Completed", completed, "text-emerald-700"], ["Projects", new Set(filteredRecords.map((record) => record.project).filter(Boolean)).size, "text-blue-700"]].map(([label, value, color]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`text-2xl font-bold ${color}`}>{loading ? "…" : error ? "—" : value}</div><div className="mt-1 text-xs font-semibold text-slate-500">{label}</div></div>)}
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-3" aria-busy={loading}>
        <ChartCard title="Report activity" subtitle="Reports received per month, up to the last 12 active months"><MonthlyChart records={filteredRecords} loading={loading} error={Boolean(error)} /></ChartCard>
        <ChartCard title="Reports by type" subtitle="Distribution of your report workload"><TypeChart records={filteredRecords} loading={loading} error={Boolean(error)} /></ChartCard>
        <ChartCard title="Completion status" subtitle="Completed compared with pending reports"><StatusChart records={filteredRecords} loading={loading} error={Boolean(error)} /></ChartCard>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4"><div><h2 className="font-bold text-slate-800">Detailed reports</h2><p className="mt-1 text-xs text-slate-500">{loading ? "Loading report records…" : `${filteredRecords.length} matching records`}</p></div><span role="status" className="text-xs text-slate-500">{loading ? "Updating…" : `Page ${page} of ${pageCount}`}</span></div>
        <div className="dc-table-scroll"><table className="min-w-[980px] text-left text-sm"><thead><tr>{["Report number", "Type", "Project", "Description", "Status", "Date"].map((label) => <th key={label} scope="col" className="px-4 py-3">{label}</th>)}</tr></thead><tbody>
          {!loading && !error && pageRecords.map((record, index) => <tr key={record.uniqueId || record.id || `${recordType(record)}-${index}`}><td className="px-4 py-3 font-mono text-xs font-semibold">{record.isRevision ? record.revNo || record.displayNumber || record.irNo || "—" : record.displayNumber || record.irNo || record.revNo || record.sdNo || "—"}</td><td className="px-4 py-3">{recordType(record)}</td><td className="px-4 py-3">{record.project || "—"}</td><td className="max-w-[420px] truncate px-4 py-3" title={record.desc || record.revNote || record.subject || "—"}>{record.desc || record.revNote || record.subject || "—"}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${record.isDone ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{recordStatus(record)}</span></td><td className="whitespace-nowrap px-4 py-3">{recordDate(record) || "—"}</td></tr>)}
          {loading && <tr><td colSpan="6" className="p-12 text-center text-slate-500"><span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-r-transparent"/>Loading your reports…</span></td></tr>}
          {!loading && error && <tr><td colSpan="6" className="p-12 text-center text-slate-500">Report records could not be displayed.</td></tr>}
          {!loading && !error && allRecords.length === 0 && <tr><td colSpan="6" className="p-12 text-center"><strong className="block text-slate-700">No reports yet</strong><span className="mt-1 block text-sm text-slate-500">Your submitted reports will appear here.</span></td></tr>}
          {!loading && !error && allRecords.length > 0 && filteredRecords.length === 0 && <tr><td colSpan="6" className="p-12 text-center"><strong className="block text-slate-700">No matching reports</strong><span className="mt-1 block text-sm text-slate-500">Try changing or clearing your filters.</span></td></tr>}
        </tbody></table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm"><span className="text-slate-500">Showing {filteredRecords.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filteredRecords.length)} of {filteredRecords.length}</span><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded border border-slate-300 px-4 py-2 disabled:opacity-40">Previous</button><button disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)} className="rounded border border-slate-300 px-4 py-2 disabled:opacity-40">Next</button></div></div>
      </section>
    </div>
  </main>;
}
