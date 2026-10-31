import { useEffect, useMemo, useState } from "react";

import { API_URL } from "../../config";

export default function DcRequestForm({ onCreated }) {
  const requestType = "TR";
  const [open, setOpen] = useState(true);
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [descriptions, setDescriptions] = useState([]);
  const [projectLoading, setProjectLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [projectError, setProjectError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ project: "", location: "", category: "", testAge: "" });

  useEffect(() => {
    const controller = new AbortController();
    setProjectLoading(true);
    setProjectError("");
    fetch(`${API_URL}/projects`, { credentials: "include", signal: controller.signal })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Projects could not be loaded");
        const names = Object.keys(data.projects || {}).sort();
        setProjects(names);
        setForm((value) => ({ ...value, project: names.includes(value.project) ? value.project : "" }));
      })
      .catch((error) => { if (error.name !== "AbortError") setProjectError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setProjectLoading(false); });
    return () => controller.abort();
  }, [reloadToken]);

  useEffect(() => {
    if (!form.project) {
      setCatalogLoading(false);
      setLocations([]);
      setDescriptions([]);
      return;
    }
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError("");
    setLocations([]);
    setDescriptions([]);
    const read = async (path) => {
      const response = await fetch(API_URL + path, { credentials: "include", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The entry options could not be loaded");
      return data;
    };
    const query = new URLSearchParams({ project: form.project, requestType: "TR" });
    const descriptionsQuery = new URLSearchParams({ project: form.project, dept: "Civil", requestType: "TR" });
    Promise.all([read("/locations?" + query), read("/general-descriptions?" + descriptionsQuery)])
      .then(([places, categories]) => {
        if (controller.signal.aborted) return;
        const locations = Array.isArray(places.locations) ? places.locations.filter(Boolean) : [];
        const descriptions = Array.isArray(categories.base) ? categories.base.filter(Boolean) : [];
        setLocations(locations);
        setDescriptions(descriptions);
        setForm(current => ({ ...current, location: locations.includes(current.location) ? current.location : "", category: descriptions.includes(current.category) ? current.category : "" }));
      })
      .catch(error => { if (error.name !== "AbortError") setCatalogError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [form.project, reloadToken]);

  const description = useMemo(() => form.category.trim() && form.location && form.testAge
    ? `Compressive Strength Test Results for ${form.category.trim()} at ${form.location} ${form.testAge}.`
    : "", [form.category, form.location, form.testAge]);
  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value, ...(key === "project" ? { location: "" } : {}) }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage(null);
    if (catalogLoading || !projects.includes(form.project) || !locations.includes(form.location) || !descriptions.includes(form.category) || !["7 Days", "28 Days"].includes(form.testAge)) {
      setMessage({ tone: "error", text: "Complete all four fields before saving." });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/irs`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType, project: form.project, location: form.location, category: form.category.trim(), testAge: form.testAge }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `${requestType} could not be created`);
      const duplicates = data.duplicateSerialRequests || [];
      setMessage({ tone: duplicates.length ? "warning" : "success", text: duplicates.length
        ? `${data.item.irNo} created. Warning: serial ${data.item.serialNumber} is also associated with ${duplicates.map((other) => other.irNo).join(", ")}.`
        : `${data.item.irNo} created and added to the queue.` });
      onCreated?.(data.item);
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="tr-entry mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="tr-entry-title">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="tr-entry-toggle flex w-full items-center justify-between gap-4 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-left text-white">
        <div><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">01 · New test report</div><div id="tr-entry-title" className="mt-1 text-lg font-bold">Create a TR</div><div className="mt-1 text-xs text-slate-300">Choose the project and test details. The description is generated automatically.</div></div>
        <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-bold">{open ? "Hide form" : "Open form"}</span>
      </button>
      {open && <form onSubmit={submit} className="tr-entry-body p-5" aria-busy={catalogLoading}>
        <div className="tr-entry-fields">
          <div className="tr-entry-grid">
            <Field label="Project"><select disabled={projectLoading} value={form.project} onChange={(event) => update("project", event.target.value)} className={controlClass}><option value="">{projectLoading ? "Loading projects..." : projects.length ? "Select project" : "No projects available"}</option>{projects.map((project) => <option key={project}>{project}</option>)}</select></Field>
            <Field label="Location"><select disabled={!form.project || catalogLoading || Boolean(catalogError)} value={form.location} onChange={(event) => update("location", event.target.value)} className={controlClass}><option value="">{!form.project ? "Select project first" : catalogLoading ? "Loading locations..." : locations.length ? "Select location" : "No locations available"}</option>{locations.map((location) => <option key={location}>{location}</option>)}</select></Field>
            <Field label="Description"><select disabled={!form.project || catalogLoading || Boolean(catalogError)} value={form.category} onChange={(event) => update("category", event.target.value)} className={controlClass}><option value="">{catalogLoading ? "Loading descriptions..." : descriptions.length ? "Select description" : "No descriptions available"}</option>{descriptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
            <Field label="Test age"><select value={form.testAge} onChange={(event) => update("testAge", event.target.value)} className={controlClass}><option value="">Select test age</option><option value="7 Days">7 Days</option><option value="28 Days">28 Days</option></select></Field>
          </div>
        </div>
        <aside className="tr-entry-preview" aria-live="polite"><div className="tr-entry-preview-label">Report preview</div><div className="tr-entry-preview-project">{form.project || "Project not selected"}</div><div className="tr-entry-preview-description">{description || "Complete the four fields to preview the generated TR description."}</div><button disabled={saving || catalogLoading || !description} className="tr-entry-submit rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50">{saving ? "Saving..." : `Create ${requestType}`}</button></aside>
        {(projectError || catalogError) && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{projectError || catalogError} <button type="button" className="ml-3 font-bold underline" onClick={() => setReloadToken((value) => value + 1)}>Retry</button></div>}
        {!projectLoading && !projectError && projects.length === 0 && <p className="mt-4 text-sm text-amber-800">No projects are configured. Ask an administrator to add a project.</p>}
        {form.project && !catalogLoading && !catalogError && locations.length === 0 && <p className="mt-4 text-sm text-amber-800">No locations are configured for this project. Ask an administrator to add location rules.</p>}
        {message && <div role="status" className={`mt-4 rounded-lg border p-3 text-sm font-semibold ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : message.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800"}`}>{message.text}</div>}
      </form>}
    </section>
  );
}

const controlClass = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal";

function Field({ label, children }) {
  return <label className="text-xs font-bold uppercase tracking-wide text-slate-600">{label} *{children}</label>;
}
