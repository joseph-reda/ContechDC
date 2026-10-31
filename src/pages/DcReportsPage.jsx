import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";
import { buildChartSvg, chartContext, saveChart } from "../utils/reportCharts";

const initialFilters = { scope: "all", type: "all", project: "all", department: "all", location: "", description: "", action: "all", status: "all", dateFrom: "", dateTo: "" };
const control = "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800";
const queryFor = (filters) => new URLSearchParams(Object.entries(filters).filter(([, value]) => value && value !== "all"));
const fieldLabels = { project: "Project", location: "Location contains", description: "Description contains", action: "Action", type: "Type", department: "Discipline", status: "Status", scope: "Scope", dateFrom: "From", dateTo: "To" };

function Field({ label, children }) {
  return <label className="min-w-0 text-xs font-semibold text-slate-600">{label}{children}</label>;
}

function Select({ label, value, onChange, options }) {
  return <Field label={label}><select className={control} value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></Field>;
}

function Chart({ title, values, context, timeline, onError, disabled }) {
  const svg = useMemo(() => buildChartSvg({ title, values, context, timeline }), [title, values, context, timeline]);
  const download = async (format) => {
    try { await saveChart(svg, title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), format); }
    catch { onError("The chart could not be downloaded. Please try again."); }
  };
  return <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <h2 className="text-sm font-bold">{title}</h2>
      <div className="flex gap-2">{["png", "svg"].map((format) => <button key={format} disabled={disabled} onClick={() => download(format)} aria-label={`Download ${title} as ${format.toUpperCase()}`} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">{format.toUpperCase()}</button>)}</div>
    </div>
    <div className="dc-report-chart" dangerouslySetInnerHTML={{ __html: svg }} />
  </section>;
}

export default function DcReportsPage() {
  const [draft, setDraft] = useState({ ...initialFilters });
  const [filters, setFilters] = useState({ ...initialFilters });
  const [report, setReport] = useState(null);
  const [records, setRecords] = useState({ items: [], total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const dirty = JSON.stringify(filters) !== JSON.stringify(draft);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const query = queryFor(filters);
    const fetchData = async (path) => {
      const response = await fetch(`${API_URL}${path}`, { credentials: "include", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load report");
      return data;
    };
    Promise.all([fetchData(`/reports/summary?${query}`), fetchData(`/reports/records?${query}&page=${page}&pageSize=25`)])
      .then(([summary, rows]) => { setReport(summary); setRecords(rows); })
      .catch((caught) => { if (caught.name !== "AbortError") { setError(caught.message); setReport(null); setRecords({ items: [], total: 0, totalPages: 1 }); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, page, refresh]);

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const apply = (event) => {
    event.preventDefault();
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) return setError("From date must be before or equal to To date.");
    setPage(1); setFilters({ ...draft });
  };
  const reset = () => { setPage(1); setDraft({ ...initialFilters }); setFilters({ ...initialFilters }); };
  const download = async (format) => {
    setExporting(true); setError("");
    try {
      const response = await fetch(`${API_URL}/reports/export.${format}?${queryFor(filters)}`, { credentials: "include" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Report export failed"); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = `Contech-Report-${filters.project === "all" ? "All-Projects" : filters.project}.${format}`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) { setError(caught.message); } finally { setExporting(false); }
  };
  const summary = report?.filtered || {};
  const context = useMemo(() => chartContext(filters, summary.total, report?.generatedAt), [filters, summary.total, report?.generatedAt]);
  const applied = Object.entries(filters).filter(([, value]) => value && value !== "all");
  const allOptions = (label, values = []) => [["all", label], ...values.map((value) => [value, value])];
  const metrics = [
    ["Matching records", summary.total, "text-slate-900"], ["Active", report?.active?.total, "text-blue-700"],
    ["Archived", report?.archived?.total, "text-slate-700"], ["Pending", summary.pending, "text-amber-700"],
    ["Completed", summary.completed, "text-emerald-700"], ["Downloaded", summary.downloaded, "text-cyan-700"],
  ];

  return <main className="dc-workspace min-h-screen pb-12">
    <div className="mx-auto max-w-[1600px] px-4 py-7 lg:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-blue-700">Document control</p><h1 className="text-3xl font-bold tracking-tight">Reports</h1><p className="mt-2 text-sm text-slate-600">Review project records, consultant actions and activity across the selected period.</p></div>
        <div className="flex flex-wrap gap-2">
          <button disabled={loading || exporting || !report} onClick={() => download("xlsx")} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{exporting ? "Preparing report…" : "Download Excel report"}</button>
          <button disabled={loading || exporting || !report} onClick={() => download("csv")} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40">CSV</button>
          <button disabled={loading} onClick={() => setRefresh(value => value + 1)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Refresh</button>
        </div>
      </header>
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      <form onSubmit={apply} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Filter records</h2><p className="text-xs text-slate-500">Date uses received date, or submitted date when unavailable.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <Select label="Project" value={draft.project} onChange={value => update("project", value)} options={allOptions("All projects", report?.filters?.projects)} />
          <Field label="Location"><input list="report-locations" value={draft.location} onChange={e => update("location", e.target.value)} className={control} placeholder="Any location" /><datalist id="report-locations">{report?.filters?.locations?.map(value => <option key={value} value={value} />)}</datalist></Field>
          <Field label="Description"><input value={draft.description} onChange={e => update("description", e.target.value)} className={control} placeholder="Contains text" /></Field>
          <Field label="From date"><input type="date" value={draft.dateFrom} onChange={e => update("dateFrom", e.target.value)} className={control} /></Field>
          <Field label="To date"><input type="date" min={draft.dateFrom || undefined} value={draft.dateTo} onChange={e => update("dateTo", e.target.value)} className={control} /></Field>
          <Select label="Action" value={draft.action} onChange={value => update("action", value)} options={[...allOptions("All actions", ["A", "B", "C", "D"]), ["none", "No action"]]} />
          <Select label="Document type" value={draft.type} onChange={value => update("type", value)} options={allOptions("All types", ["IR", "CPR", "TR", "REVISION", "SD"])} />
          <Select label="Discipline" value={draft.department} onChange={value => update("department", value)} options={allOptions("All disciplines", report?.filters?.departments)} />
          <Select label="Status" value={draft.status} onChange={value => update("status", value)} options={[["all", "All statuses"], ["pending", "Pending"], ["completed", "Completed"]]} />
          <Select label="Scope" value={draft.scope} onChange={value => update("scope", value)} options={[["all", "Active and archived"], ["active", "Active only"], ["archived", "Archived only"]]} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className={`text-xs ${dirty ? "text-amber-700" : "text-slate-500"}`}>{dirty ? "Filters changed. Apply them to update charts and exports." : loading ? "Updating report…" : `${summary.total || 0} matching records`}</p>
          <div className="flex gap-2"><button type="button" onClick={reset} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Reset</button><button className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-bold text-white">Apply filters</button></div>
        </div>
      </form>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Applied filters">{applied.map(([key, value]) => <span key={key} className="rounded-md border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs text-blue-900">{fieldLabels[key]}: {value === "none" ? "No action" : value}</span>)}</div>
      <section aria-busy={loading} className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">{metrics.map(([label, value, color]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`text-2xl font-bold ${color}`}>{loading ? "…" : value ?? 0}</div><div className="mt-1 text-xs font-semibold text-slate-500">{label}</div></div>)}</section>
      {report && <section className="mb-5 grid gap-4 xl:grid-cols-2">
        <Chart title="Documents by project" values={summary.byProject} context={context} onError={setError} disabled={loading} />
        <Chart title="Consultant action" values={summary.byAction} context={context} onError={setError} disabled={loading} />
        <Chart title="Document types" values={summary.byType} context={context} onError={setError} disabled={loading} />
        <Chart title="Records by date" values={summary.byDate} context={context} timeline onError={setError} disabled={loading} />
      </section>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4"><h2 className="font-bold">Matching records</h2><p className="mt-1 text-xs text-slate-500">Excel exports all matching records across every page.</p></div>
        <div className="dc-table-scroll"><table className="min-w-[1100px] text-left text-sm"><thead><tr>{["Document number", "Type", "Project", "Location", "Description", "Action", "Status", "Received / submitted"].map(label => <th key={label} scope="col" className="px-4 py-3">{label}</th>)}</tr></thead><tbody>
          {!loading && records.items.map(item => <tr key={item.id}><td className="px-4 py-3 font-mono text-xs font-semibold">{item.irNo || item.revNo || item.sdNo}</td><td className="px-4 py-3">{item.requestType}</td><td className="px-4 py-3">{item.project}</td><td className="px-4 py-3">{item.location || "—"}</td><td className="max-w-[420px] px-4 py-3">{item.desc || item.revNote || item.subject || "—"}</td><td className="px-4 py-3 font-semibold">{item.action || "—"}</td><td className="px-4 py-3">{item.isDone ? "Completed" : "Pending"}</td><td className="whitespace-nowrap px-4 py-3">{String(item.receivedDate || item.sentAt || item.createdAt || "").slice(0, 10)}</td></tr>)}
          {(loading || !records.items.length) && <tr><td colSpan="8" className="p-12 text-center text-slate-500">{loading ? "Loading records…" : "No records match these filters."}</td></tr>}
        </tbody></table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm"><span className="text-slate-500">{records.total} records · Page {page} of {records.totalPages}</span><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)} className="rounded border px-4 py-2 disabled:opacity-40">Previous</button><button disabled={page >= records.totalPages || loading} onClick={() => setPage(value => value + 1)} className="rounded border px-4 py-2 disabled:opacity-40">Next</button></div></div>
      </section>
    </div>
  </main>;
}
