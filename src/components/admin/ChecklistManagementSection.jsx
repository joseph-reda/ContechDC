import { useEffect, useMemo, useState } from "react";

import { API_URL } from "../../config";
import { normalizeChecklistDepartmentList } from "../../utils/checklistDepartments";

const DEPARTMENTS = [
  { id: "ARCH", label: "ARCH" },
  { id: "ST", label: "ST (Civil)" },
  { id: "MEP", label: "MEP (Mechanical)" },
  { id: "ELEC", label: "ELEC (Electrical)" },
];

export default function ChecklistManagementSection({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState("ST");
  const [entries, setEntries] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [mapping, setMapping] = useState({});
  const [invalidTemplates, setInvalidTemplates] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/admin/checklists`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Checklist configuration could not be loaded");
      const loadedEntries = Array.isArray(data.entries) ? data.entries : [];
      setEntries(loadedEntries.map((entry) => ({
        ...entry,
        departments: normalizeChecklistDepartmentList(entry.departments),
      })));
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
      setMapping(data.mapping || {});
      setInvalidTemplates(Array.isArray(data.invalidTemplates) ? data.invalidTemplates : []);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const eligibleTemplates = useMemo(() => templates.filter((template) => (
    template.allowedDepartments?.includes(selectedDepartment)
  )), [templates, selectedDepartment]);

  const updateEntry = (template, updater) => {
    setEntries((current) => {
      const existing = current.find((entry) => entry.id === template.id) || {
        id: template.id,
        name: template.defaultName,
        departments: [],
      };
      const updated = updater(existing);
      return current.some((entry) => entry.id === template.id)
        ? current.map((entry) => entry.id === template.id ? updated : entry)
        : [...current, updated];
    });
  };

  const toggleAssignment = (template) => updateEntry(template, (entry) => {
    const assigned = entry.departments.includes(selectedDepartment);
    return {
      ...entry,
      departments: assigned
        ? entry.departments.filter((department) => department !== selectedDepartment)
        : [...entry.departments, selectedDepartment],
    };
  });

  const removeEntry = (templateId) => setEntries((current) => current.filter((entry) => entry.id !== templateId));

  const save = async () => {
    setSaving(true);
    try {
      const canonicalEntries = entries.map((entry) => ({
        ...entry,
        departments: normalizeChecklistDepartmentList(entry.departments),
      }));
      const response = await fetch(`${API_URL}/admin/checklists`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: canonicalEntries }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Checklist configuration could not be saved");
      setEntries(data.entries || []);
      showToast("Checklist configuration saved");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">Loading checklist configuration...</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Word Checklists</h3>
            <p className="mt-1 text-sm text-gray-600">Assign approved Word templates by department. Engineers see the numbered templates linked to their registered department.</p>
          </div>
          <button onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : "Save Checklists"}
          </button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {DEPARTMENTS.map((department) => (
            <button
              key={department.id}
              onClick={() => setSelectedDepartment(department.id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${selectedDepartment === department.id ? "bg-slate-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              {department.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">Linked checklist numbers: {(mapping[selectedDepartment] || []).map((value) => String(value).padStart(2, "0")).join(", ") || "None"}</p>
      </div>

      {invalidTemplates.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Some Word files are not selectable</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{invalidTemplates.map((template) => <li key={template.sourceName}>{template.sourceName}: {template.error}</li>)}</ul>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h4 className="font-semibold text-gray-800">{selectedDepartment} checklist templates</h4>
        {eligibleTemplates.length === 0 ? (
          <div className="mt-4 rounded-lg border-2 border-dashed border-gray-200 py-8 text-center text-gray-500">No approved templates for this department.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {eligibleTemplates.map((template) => {
              const entry = entries.find((item) => item.id === template.id);
              const assigned = Boolean(entry?.departments.includes(selectedDepartment));
              return (
                <div key={template.id} className="grid gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-[90px_minmax(0,1fr)_auto] md:items-center">
                  <div>
                    <div className="font-mono text-sm font-bold text-slate-800">{template.number}</div>
                    <div className="text-xs text-gray-500">{template.id}</div>
                  </div>
                  <div>
                    <input
                      value={entry?.name ?? template.defaultName}
                      onChange={(event) => updateEntry(template, (current) => ({ ...current, name: event.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      aria-label={`Checklist name for ${template.id}`}
                    />
                    <div className="mt-1 text-xs text-gray-500">Approved file: {template.sourceName}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleAssignment(template)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${assigned ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"}`}>
                      {assigned ? "Assigned" : "Assign"}
                    </button>
                    {entry && <button onClick={() => removeEntry(template.id)} className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Remove</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
