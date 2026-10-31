// src/components/admin/DCModeTab.jsx
import React, { useEffect, useState, useCallback, useMemo, memo } from "react";
import { API_URL } from "../../config";
import { copyAllRows, displayedDescription } from "../../excelClipboardService";
import { rowsInProjectTypeSection } from "../../utils/dcSections";
import DcProjectSections from "../dc/DcProjectSections";

// ==============================
// Constants
// ==============================
const DEPARTMENTS = [
  { value: "ARCH", label: "Architectural", icon: "🏛️", color: "bg-blue-100 text-blue-800" },
  { value: "Civil", label: "Civil", icon: "🏗️", color: "bg-green-100 text-green-800" },
  { value: "ELECT", label: "Electrical", icon: "⚡", color: "bg-purple-100 text-purple-800" },
  { value: "MECH", label: "Mechanical", icon: "🔧", color: "bg-amber-100 text-amber-800" },
  { value: "SURV", label: "Survey", icon: "📐", color: "bg-indigo-100 text-indigo-800" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All Types", icon: "📋" },
  { value: "IR", label: "IR", icon: "📝" },
  { value: "CPR", label: "CPR", icon: "🏗️" },
  { value: "TR", label: "Test Report", icon: "🧪" },
  { value: "REV", label: "Revision", icon: "🔄" },
  { value: "SD", label: "Shop Drawing", icon: "📐" },
];

const SORT_OPTIONS = [
  { value: "date", label: "Date" },
  { value: "irNo", label: "Number" },
  { value: "project", label: "Project" },
  { value: "user", label: "User" },
];

// ==============================
// Helper functions
// ==============================
const getDeptInfo = (dept) =>
  DEPARTMENTS.find((d) => d.value === dept) || {
    label: dept,
    icon: "👤",
    color: "bg-gray-100 text-gray-800",
  };

const getStatusInfo = (item) => {
  if (item.isArchived) return { label: "Archived", color: "bg-gray-100 text-gray-800", icon: "🗄️" };
  if (item.isDone) return { label: "Completed", color: "bg-green-100 text-green-800", icon: "✅" };
  return { label: "Pending", color: "bg-amber-100 text-amber-800", icon: "⏳" };
};

const formatDate = (dateString) => {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return dateString;
  }
};

// ==============================
// Revision Chip Component
// ==============================
const RevisionChip = memo(({ rev, onMarkDone, onArchive }) => {
  const getRevDisplayNumber = (rev) => {
    if (!rev) return "REV";
    if (rev.displayNumber) return rev.displayNumber;
    if (rev.userRevNumber) {
      const prefix = rev.revisionType === "CPR_REVISION" ? "REV-CPR-" : "REV-IR-";
      return `${prefix}${rev.userRevNumber}`;
    }
    if (rev.revText) {
      const prefix = rev.revisionType === "CPR_REVISION" ? "REV-CPR-" : "REV-IR-";
      return `${prefix}${rev.revText}`;
    }
    return rev.revNo || "REV";
  };

  const getRevTypeClass = (rev) => {
    if (!rev) return "bg-gray-100 text-gray-800";
    if (rev.revisionType === "CPR_REVISION" || rev.isCPRRevision) {
      return "bg-green-200 text-green-800";
    }
    return "bg-amber-200 text-amber-800";
  };

  const getRevTypeText = (rev) => {
    if (!rev) return "REVISION";
    if (rev.revisionType === "CPR_REVISION" || rev.isCPRRevision) return "CPR REV";
    return "IR REV";
  };

  const displayNumber = getRevDisplayNumber(rev);
  const revTypeClass = getRevTypeClass(rev);
  const revTypeText = getRevTypeText(rev);
  const time = rev.sentAt ? new Date(rev.sentAt).toLocaleTimeString() : "";

  return (
    <div className="p-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="flex gap-1 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-1 rounded ${revTypeClass}`}>
            {revTypeText}
          </span>
          <span className="text-xs font-semibold px-2 py-1 bg-gray-200 text-gray-800 rounded">
            {displayNumber}
          </span>
        </div>
      </div>
      <div className="space-y-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-800 rounded">
            📌 {rev.project || "Unknown"}
          </span>
          <span className="text-xs font-medium px-2 py-1 bg-purple-100 text-purple-800 rounded">
            🏢 {rev.department || rev.deptAbbr || "Unknown"}
          </span>
          <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-800 rounded">
            👤 {rev.user || "Unknown"}
          </span>
        </div>
      </div>
      <div className="text-sm text-gray-700 mb-4 line-clamp-2">
        {rev.revNote || rev.desc || "No description"}
      </div>
      <div className="text-xs text-gray-500 mb-4">
        ⏰ {time} • {formatDate(rev.sentAt)}
      </div>
      <div className="flex gap-2">
        {!rev.isDone && (
          <button
            onClick={() => onMarkDone(rev)}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-black text-white rounded-lg transition flex-1"
          >
            Mark Done
          </button>
        )}
        <button
          onClick={() => onArchive(rev)}
          className="px-3 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition flex-1"
        >
          Archive
        </button>
      </div>
    </div>
  );
});

// ==============================
// Admin Table Row for IR/CPR
// ==============================
const AdminTableRow = memo(({
  item,
  onApprove,
  onArchive,
  onDelete,
  onDownloadWord,
  onUpdateIRNumber,
  onUpdateAction,
  isSaving,
}) => {
  const itemType = String(item.requestType || "IR").toUpperCase();
  const isCPR = itemType === "CPR";
  const rowColor = itemType === "CPR" ? "bg-green-50 hover:bg-green-100"
    : itemType === "PPIR" ? "bg-orange-50 hover:bg-orange-100"
      : itemType === "TR" ? "bg-cyan-50 hover:bg-cyan-100" : "bg-blue-50 hover:bg-blue-100";
  const badgeColor = itemType === "CPR" ? "bg-green-600"
    : itemType === "PPIR" ? "bg-orange-600"
      : itemType === "TR" ? "bg-teal-600" : "bg-blue-600";
  const statusInfo = getStatusInfo(item);
  const deptInfo = getDeptInfo(item.deptAbbr || item.department);

  return (
    <tr className={`border-b ${rowColor} transition-colors`}>
      <td className="p-3 align-top">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-bold rounded text-white ${badgeColor}`}>
              {itemType}
            </span>
            <div className="font-mono font-bold text-sm">{item.irNo || item.revNo}</div>
          </div>
        </div>
       </td>
      <td className="p-3 align-top">
        <div className="font-medium text-gray-800 line-clamp-2">{item.desc}</div>
        {item.location && <div className="text-xs text-gray-500 mt-1">📍 {item.location}</div>}
        {item.floor && <div className="text-xs text-gray-500 mt-1">🏢 {item.floor}</div>}
      </td>
      <td className="p-3 align-top">
        <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${deptInfo.color}`}>
          {deptInfo.icon} {deptInfo.label}
        </span>
        <div className="text-xs text-gray-500 mt-1">👤 {item.user || "—"}</div>
      </td>
      <td className="p-3 align-top">
        <div className="text-gray-600 whitespace-pre-line text-sm">{formatDate(item.sentAt)}</div>
      </td>
      <td className="p-3 align-top">
        <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
          {statusInfo.icon} {statusInfo.label}
        </span>
      </td>
      <td className="p-3 align-top">
        <div className="flex flex-wrap gap-2 min-w-[200px]">
          {/* Download Word */}
          <button
            onClick={() => onDownloadWord(item)}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm flex items-center gap-1"
            title="Download Word"
          >
            📄 Word
          </button>

          {/* Update IR Number (only for non-revision IR/CPR, not archived) */}
          {!item.isRevision && !item.sdNo && !item.isArchived && (
            <button
              onClick={() => onUpdateIRNumber(item)}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm flex items-center gap-1"
              title="Update Number"
            >
              🔢
            </button>
          )}

          {/* Approve (if pending) */}
          {!item.isDone && !item.isArchived && (
            <button
              onClick={() => onApprove(item)}
              disabled={isSaving}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
            >
              ✅ Approve
            </button>
          )}

          {/* Archive / Restore */}
          {!item.isArchived ? (
            <button
              onClick={() => onArchive(item)}
              disabled={isSaving}
              className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm flex items-center gap-1"
            >
              📁 Archive
            </button>
          ) : (
            <button
              onClick={() => onArchive(item)} // unarchive uses same handler? Actually we have handleUnarchive separate, but we can unify
              disabled={isSaving}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-1"
            >
              ↩️ Restore
            </button>
          )}

          {/* Delete */}
          <button
            onClick={() => onDelete(item)}
            disabled={isSaving}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm flex items-center gap-1"
          >
            🗑️ Delete
          </button>

          {/* Action dropdown */}
          {!item.isArchived && (
            <select
              onChange={(e) => onUpdateAction(item, e.target.value)}
              defaultValue={item.action || ""}
              className="text-xs border rounded p-1 bg-white"
            >
              <option value="" disabled>Action</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          )}
        </div>
      </td>
    </tr>
  );
});

// ==============================
// Project Section Component
// ==============================
const ProjectSection = memo(({
  project,
  depts,
  onApprove,
  onArchive,
  onDelete,
  onDownloadWord,
  onUpdateIRNumber,
  onUpdateAction,
  onMarkRevDone,
  isSaving,
}) => {
  const allItems = Object.values(depts).flat();
  const revisions = allItems.filter(x => x.isRevision);
  const cprs = allItems.filter(x => !x.isRevision && x.requestType === "CPR");
  const irs = allItems.filter(x => !x.isRevision && x.requestType !== "CPR" && !x.sdNo);

  const sortedDepts = Object.keys(depts).sort();

  return (
    <section className="bg-white rounded-2xl shadow-lg border overflow-hidden  w-[1500px]">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3">
              📌 {project}
              <span className="text-sm font-normal bg-white/20 px-3 py-1 rounded-full">
                {allItems.length} items
              </span>
            </h2>
            <div className="flex flex-wrap gap-3 mt-2">
              <span className="text-slate-200">IR: {irs.length}</span>
              <span className="text-green-200">CPR: {cprs.length}</span>
              <span className="text-amber-200">REV: {revisions.length}</span>
              <span className="text-yellow-200">
                Pending: {irs.filter(x => !x.isDone).length + cprs.filter(x => !x.isDone).length}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Revisions */}
        {revisions.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h3 className="font-bold text-amber-800 mb-3 flex items-center gap-2">
              🔄 Pending Revisions ({revisions.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {revisions.map(rev => (
                <RevisionChip
                  key={rev.uniqueId || rev.id}
                  rev={rev}
                  onMarkDone={onMarkRevDone}
                  onArchive={onArchive}
                />
              ))}
            </div>
          </div>
        )}

        {/* CPRs */}
        {cprs.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-green-200 pb-2">
              <h3 className="text-lg font-bold text-green-700 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-xs font-bold text-white">C</span>
                Concrete Pouring Requests (CPR)
                <span className="text-sm font-normal text-gray-500">({cprs.length} items)</span>
              </h3>
            </div>

            {sortedDepts.map(dept => {
              const deptCprs = depts[dept].filter(x => !x.isRevision && x.requestType === "CPR");
              if (deptCprs.length === 0) return null;
              const deptInfo = getDeptInfo(dept);
              return (
                <div key={`cpr-${dept}`} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-md font-semibold text-gray-700 flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${deptInfo.color}`}>
                        {deptInfo.icon}
                      </span>
                      {deptInfo.label} Department
                      <span className="text-sm font-normal text-gray-500 ml-2">({deptCprs.length} items)</span>
                    </h4>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-green-200">
                    <table className="w-full">
                      <thead className="bg-green-700 text-white">
                        <tr>
                          <th className="p-3 text-left">Number</th>
                          <th className="p-3 text-left">Description</th>
                          <th className="p-3 text-left">Department/User</th>
                          <th className="p-3 text-left">Sent At</th>
                          <th className="p-3 text-left">Status</th>
                          <th className="p-3 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptCprs.map(item => (
                          <AdminTableRow
                            key={item.uniqueId || item.id}
                            item={item}
                            onApprove={onApprove}
                            onArchive={onArchive}
                            onDelete={onDelete}
                            onDownloadWord={onDownloadWord}
                            onUpdateIRNumber={onUpdateIRNumber}
                            onUpdateAction={onUpdateAction}
                            isSaving={isSaving}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* IRs */}
        {irs.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-blue-200 pb-2">
              <h3 className="text-lg font-bold text-blue-700 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">I</span>
                Inspection & Report Requests (IR / TR)
                <span className="text-sm font-normal text-gray-500">({irs.length} items)</span>
              </h3>
            </div>

            {sortedDepts.map(dept => {
              const deptIrs = depts[dept].filter(x => !x.isRevision && x.requestType !== "CPR" && !x.sdNo);
              if (deptIrs.length === 0) return null;
              const deptInfo = getDeptInfo(dept);
              return (
                <div key={`ir-${dept}`} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-md font-semibold text-gray-700 flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${deptInfo.color}`}>
                        {deptInfo.icon}
                      </span>
                      {deptInfo.label} Department
                      <span className="text-sm font-normal text-gray-500 ml-2">({deptIrs.length} items)</span>
                    </h4>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-blue-200">
                    <table className="w-full">
                      <thead className="bg-blue-700 text-white">
                        <tr>
                          <th className="p-3 text-left">Number</th>
                          <th className="p-3 text-left">Description</th>
                          <th className="p-3 text-left">Department/User</th>
                          <th className="p-3 text-left">Sent At</th>
                          <th className="p-3 text-left">Status</th>
                          <th className="p-3 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptIrs.map(item => (
                          <AdminTableRow
                            key={item.uniqueId || item.id}
                            item={item}
                            onApprove={onApprove}
                            onArchive={onArchive}
                            onDelete={onDelete}
                            onDownloadWord={onDownloadWord}
                            onUpdateIRNumber={onUpdateIRNumber}
                            onUpdateAction={onUpdateAction}
                            isSaving={isSaving}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
});

// ==============================
// Main Component (rest of the file)
// ==============================
// ... (the rest of the code, including load functions, handlers, and render) ...

// ==============================
// Main Component
// ==============================
export default function DCModeTab({ user }) {
  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyingGroup, setCopyingGroup] = useState("");
  const [toast, setToast] = useState({ show: false, message: "", type: "" });

  // View state
  const [activeView, setActiveView] = useState("pending"); // pending, archive, all

  // Data states
  const [pendingIRs, setPendingIRs] = useState([]);
  const [pendingRevisions, setPendingRevisions] = useState([]);
  const [pendingSD, setPendingSD] = useState([]);
  const [archiveIRs, setArchiveIRs] = useState([]);
  const [archiveRevisions, setArchiveRevisions] = useState([]);
  const [archiveSD, setArchiveSD] = useState([]);
  const [allIRs, setAllIRs] = useState([]);
  const [allRevisions, setAllRevisions] = useState([]);
  const [allSD, setAllSD] = useState([]);

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");

  // Modal states
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingReferencesItem, setEditingReferencesItem] = useState(null);
  const [referencesDraft, setReferencesDraft] = useState("");
  const [updatingIRNumber, setUpdatingIRNumber] = useState({
    uniqueId: "",
    irNo: "",
    newSerial: "",
    showModal: false,
  });

  // Projects list for filter
  const [projects, setProjects] = useState([]);

  // ==============================
  // Toast helper
  // ==============================
  const showToast = useCallback((message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
  }, []);

  // ==============================
  // Data loading
  // ==============================
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadPendingData(), loadArchiveData(), loadAllIRsData(), loadProjects()]);
    } catch (error) {
      console.error("Failed to load DC data:", error);
      showToast("Failed to load DC data", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadPendingData = async () => {
    try {
      const [irsRes, revsRes, sdRes] = await Promise.all([
        fetch(`${API_URL}/irs`),
        fetch(`${API_URL}/revs`),
        fetch(`${API_URL}/shopdrawings`),
      ]);

      if (irsRes.ok) {
        const data = await irsRes.json();
        setPendingIRs((data.irs || []).filter((ir) => !ir.isDone && !ir.isArchived));
      }
      if (revsRes.ok) {
        const data = await revsRes.json();
        setPendingRevisions((data.revs || []).filter((rev) => !rev.isDone && !rev.isArchived));
      }
      if (sdRes.ok) {
        const data = await sdRes.json();
        setPendingSD((data.shopdrawings || []).filter((sd) => !sd.isDone && !sd.isArchived));
      }
    } catch (error) {
      console.error("Failed to load pending data:", error);
    }
  };

  const loadArchiveData = async () => {
    try {
      const [irsAllRes, revsAllRes, sdAllRes] = await Promise.all([
        fetch(`${API_URL}/irs/all`),
        fetch(`${API_URL}/revs/all`),
        fetch(`${API_URL}/shopdrawings/all`),
      ]);

      if (irsAllRes.ok) {
        const data = await irsAllRes.json();
        setArchiveIRs((data.irs || []).filter((ir) => ir.isArchived));
      }
      if (revsAllRes.ok) {
        const data = await revsAllRes.json();
        setArchiveRevisions((data.revs || []).filter((rev) => rev.isArchived));
      }
      if (sdAllRes.ok) {
        const data = await sdAllRes.json();
        setArchiveSD((data.shopdrawings || []).filter((sd) => sd.isArchived));
      }
    } catch (error) {
      console.error("Failed to load archive data:", error);
    }
  };

  const loadAllIRsData = async () => {
    try {
      const [irsRes, revsRes, sdRes] = await Promise.all([
        fetch(`${API_URL}/irs/all`),
        fetch(`${API_URL}/revs/all`),
        fetch(`${API_URL}/shopdrawings/all`),
      ]);

      if (irsRes.ok) {
        const data = await irsRes.json();
        setAllIRs(data.irs || []);
      }
      if (revsRes.ok) {
        const data = await revsRes.json();
        setAllRevisions(data.revs || []);
      }
      if (sdRes.ok) {
        const data = await sdRes.json();
        setAllSD(data.shopdrawings || []);
      }
    } catch (error) {
      console.error("Failed to load all data:", error);
    }
  };

  const loadProjects = async () => {
    try {
      const res = await fetch(`${API_URL}/projects`);
      if (res.ok) {
        const data = await res.json();
        setProjects(Object.keys(data.projects || {}));
      }
    } catch (error) {
      console.error("Failed to load projects:", error);
    }
  };

  // ==============================
  // Statistics (memoized)
  // ==============================
  const stats = useMemo(() => {
    const allItems = [
      ...pendingIRs,
      ...pendingRevisions,
      ...pendingSD,
      ...archiveIRs,
      ...archiveRevisions,
      ...archiveSD,
    ];
    const byProject = {};
    const byDepartment = {};
    const byStatus = {};

    allItems.forEach((item) => {
      const project = item.project || "Unknown";
      byProject[project] = (byProject[project] || 0) + 1;
      const dept = item.department || item.deptAbbr || "Unknown";
      byDepartment[dept] = (byDepartment[dept] || 0) + 1;
      const status = item.isArchived ? "archived" : item.isDone ? "completed" : "pending";
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    return {
      totalPending: pendingIRs.length + pendingRevisions.length + pendingSD.length,
      totalArchive: archiveIRs.length + archiveRevisions.length + archiveSD.length,
      totalAll: allItems.length,
      byProject,
      byDepartment,
      byStatus,
      sdPending: pendingSD.length,
      sdArchive: archiveSD.length,
      sdTotal: allSD.length,
    };
  }, [pendingIRs, pendingRevisions, pendingSD, archiveIRs, archiveRevisions, archiveSD, allSD]);

  // ==============================
  // Filtered and sorted data
  // ==============================
  const currentData = useMemo(() => {
    switch (activeView) {
      case "pending":
        return [...pendingIRs, ...pendingRevisions, ...pendingSD];
      case "archive":
        return [...archiveIRs, ...archiveRevisions, ...archiveSD];
      case "all":
        return [...allIRs, ...allRevisions, ...allSD];
      default:
        return [];
    }
  }, [activeView, pendingIRs, pendingRevisions, pendingSD, archiveIRs, archiveRevisions, archiveSD, allIRs, allRevisions, allSD]);

  const filteredData = useMemo(() => {
    let data = [...currentData];

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter((item) => {
        return (
          (item.irNo && item.irNo.toLowerCase().includes(term)) ||
          (item.revNo && item.revNo.toLowerCase().includes(term)) ||
          (item.sdNo && item.sdNo.toLowerCase().includes(term)) ||
          (item.project && item.project.toLowerCase().includes(term)) ||
          (item.user && item.user.toLowerCase().includes(term)) ||
          (item.subject && item.subject.toLowerCase().includes(term)) ||
          (item.desc && item.desc.toLowerCase().includes(term))
        );
      });
    }

    // Project filter
    if (projectFilter !== "all") {
      data = data.filter((item) => item.project === projectFilter);
    }

    // Department filter
    if (departmentFilter !== "all") {
      data = data.filter((item) => item.department === departmentFilter || item.deptAbbr === departmentFilter);
    }

    // Status filter (only for 'all' view)
    if (activeView === "all" && statusFilter !== "all") {
      data = data.filter((item) => {
        if (statusFilter === "pending") return !item.isDone && !item.isArchived;
        if (statusFilter === "completed") return item.isDone && !item.isArchived;
        if (statusFilter === "archived") return item.isArchived;
        return true;
      });
    }

    // Type filter
    if (typeFilter !== "all") {
      data = data.filter((item) => {
        if (["IR", "CPR", "TR"].includes(typeFilter)) {
          return !item.isRevision && !item.sdNo && String(item.requestType || "IR").toUpperCase() === typeFilter;
        }
        if (typeFilter === "REV") return item.isRevision;
        if (typeFilter === "SD") return !!item.sdNo;
        return true;
      });
    }

    // Sorting
    data.sort((a, b) => {
      let aVal, bVal;
      switch (sortBy) {
        case "date":
          aVal = new Date(a.sentAt || a.createdAt || a.updatedAt).getTime();
          bVal = new Date(b.sentAt || b.createdAt || b.updatedAt).getTime();
          break;
        case "irNo":
          aVal = a.irNo || a.revNo || a.sdNo || "";
          bVal = b.irNo || b.revNo || b.sdNo || "";
          break;
        case "project":
          aVal = a.project || "";
          bVal = b.project || "";
          break;
        case "user":
          aVal = a.user || a.fullname || "";
          bVal = b.user || b.fullname || "";
          break;
        default:
          aVal = new Date(a.sentAt || a.createdAt).getTime();
          bVal = new Date(b.sentAt || b.createdAt).getTime();
      }
      if (sortOrder === "asc") return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

    return data;
  }, [currentData, searchTerm, projectFilter, departmentFilter, statusFilter, typeFilter, sortBy, sortOrder, activeView]);

  const copySection = async (project, type, sectionItems) => {
    if (copyingGroup) return;
    setCopyingGroup(JSON.stringify([project, type]));
    try {
      const records = rowsInProjectTypeSection(sectionItems, project, type);
      if (!records.length) throw new Error("No records are displayed in this section");
      await copyAllRows(records);
      showToast(`${records.length} ${type} rows copied from ${project || "Unassigned"}`);
    } catch (error) {
      showToast(error.message || "Copy failed", "error");
    } finally {
      setCopyingGroup("");
    }
  };

  // ==============================
  // Action handlers
  // ==============================
  const handleApprove = async (item) => {
    const type = item.isRevision ? "revision" : item.sdNo ? "shop drawing" : "inspection request";
    if (!window.confirm(`Approve ${type} ${item.irNo || item.revNo || item.sdNo}?`)) return;

    setSaving(true);
    try {
      let endpoint = "";
      if (item.isRevision) endpoint = "revs";
      else if (item.sdNo) endpoint = "shopdrawings";
      else endpoint = "irs";

      const res = await fetch(`${API_URL}/${endpoint}/mark-done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uniqueId: item.uniqueId || item.id,
          downloadedBy: user?.username || "admin",
        }),
      });

      if (res.ok) {
        showToast(`${type} approved`, "success");
        await loadAllData();
      } else {
        throw new Error("Failed to approve");
      }
    } catch (error) {
      console.error("Approve error:", error);
      showToast("Failed to approve", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (item) => {
    const type = item.isRevision ? "revision" : item.sdNo ? "shop drawing" : "IR";
    if (!window.confirm(`Archive ${type} ${item.irNo || item.revNo || item.sdNo}?`)) return;

    setSaving(true);
    try {
      const collection = item.isRevision ? "revs" : item.sdNo ? "shopdrawings" : "irs";
      const res = await fetch(`${API_URL}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uniqueId: item.uniqueId || item.id,
          role: "dc",
          collection,
        }),
      });

      if (res.ok) {
        showToast(`Item archived`, "success");
        await loadAllData();
      } else {
        throw new Error("Failed to archive");
      }
    } catch (error) {
      console.error("Archive error:", error);
      showToast("Failed to archive", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUnarchive = async (item) => {
    const type = item.isRevision ? "revision" : item.sdNo ? "shop drawing" : "IR";
    if (!window.confirm(`Restore ${type} ${item.irNo || item.revNo || item.sdNo} from archive?`)) return;

    setSaving(true);
    try {
      const collection = item.isRevision ? "revs" : item.sdNo ? "shopdrawings" : "irs";
      const res = await fetch(`${API_URL}/unarchive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uniqueId: item.uniqueId || item.id,
          collection,
        }),
      });

      if (res.ok) {
        showToast(`Item restored`, "success");
        await loadAllData();
      } else {
        throw new Error("Failed to unarchive");
      }
    } catch (error) {
      console.error("Unarchive error:", error);
      showToast("Failed to unarchive", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    const type = item.isRevision ? "revision" : item.sdNo ? "shop drawing" : "IR";
    if (
      !window.confirm(
        `Permanently delete ${type} ${item.irNo || item.revNo || item.sdNo}?\nThis action cannot be undone.`
      )
    )
      return;

    setSaving(true);
    try {
      let endpoint = "";
      if (item.isRevision) endpoint = "revs/delete";
      else if (item.sdNo) endpoint = "shopdrawings/delete";
      else endpoint = "irs/delete";

      const res = await fetch(`${API_URL}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniqueId: item.uniqueId || item.id }),
      });

      if (res.ok) {
        showToast(`Item deleted`, "success");
        await loadAllData();
      } else {
        throw new Error("Failed to delete");
      }
    } catch (error) {
      console.error("Delete error:", error);
      showToast("Failed to delete", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadWord = async (item) => {
    try {
      let endpoint = "";
      let payload = {};
      if (item.sdNo) {
        endpoint = "shopdrawings/generate-word";
        payload = { uniqueId: item.uniqueId || item.id, downloadedBy: user?.username || "admin" };
      } else {
        endpoint = "generate-word";
        payload = {
          ...item,
          irNo: item.irNo,
          project: item.project,
          department: item.department,
          desc: item.desc || item.subject,
          requestType: String(item.requestType || (item.isCPR ? "CPR" : "IR")).toUpperCase(),
          downloadedBy: user?.username || "admin",
          ...(item.requestType === "CPR" && {
            concreteGrade: item.concreteGrade,
            pouringElement: item.pouringElement,
            floor: item.floor,
          }),
        };
      }

      const res = await fetch(`${API_URL}/${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${item.irNo || item.sdNo || "document"}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
        showToast("Document downloaded", "success");

        if (!item.isDone && !item.isArchived) {
          await handleApprove(item);
        }
      } else {
        const details = await res.json().catch(() => ({}));
        throw new Error(details.error || "Failed to generate word document");
      }
    } catch (error) {
      console.error("Download word error:", error);
      showToast(error.message || "Failed to download document", "error");
    }
  };

  const openReferencesEditor = (item) => {
    const existing = item.refDrawings || item.refSD || item.SDAttatch || [];
    setEditingReferencesItem(item);
    setReferencesDraft((Array.isArray(existing) ? existing : String(existing).split(/[\r\n,;]+/)).join("\n"));
    setShowDetailsModal(false);
  };

  const handleSaveReferences = async () => {
    if (!editingReferencesItem) return;
    setSaving(true);
    try {
      const id = editingReferencesItem.uniqueId || editingReferencesItem.id;
      const response = await fetch(`${API_URL}/dc/documents/${id}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refDrawings: referencesDraft.split(/[\r\n,;]+/) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "References could not be saved");
      setEditingReferencesItem(null);
      setReferencesDraft("");
      await loadAllData();
      showToast("Ref Drawings saved. You can now download the Word file.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAction = async (item, newAction) => {
    if (!newAction || !["A", "B", "C", "D"].includes(newAction)) return;

    setSaving(true);
    try {
      const collection = item.isRevision ? "revs" : item.sdNo ? "shopdrawings" : "irs";
      const res = await fetch(`${API_URL}/update-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uniqueId: item.uniqueId || item.id,
          collection,
          action: newAction,
          updatedBy: user?.username || "admin",
        }),
      });

      if (res.ok) {
        showToast(`Action updated to ${newAction}`, "success");
        await loadAllData();
      } else {
        throw new Error("Failed to update action");
      }
    } catch (error) {
      console.error("Update action error:", error);
      showToast("Failed to update action", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateIRNumber = async () => {
    const { uniqueId, irNo, newSerial } = updatingIRNumber;
    if (!uniqueId || !irNo || !/^\d+$/.test(String(newSerial).trim()) || !Number.isSafeInteger(Number(newSerial)) || Number(newSerial) < 1) {
      showToast("Please enter a valid IR number and serial", "error");
      return;
    }

    setSaving(true);
    try {
      const item = currentData.find((item) => (item.uniqueId || item.id) === uniqueId);
      if (!item) {
        showToast("IR not found", "error");
        return;
      }

      const res = await fetch(`${API_URL}/irs/update-ir-number`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uniqueId: item.uniqueId || item.id,
          irNo,
          newSerial: parseInt(newSerial),
          project: item.project,
          department: item.department,
          requestType: item.requestType || "IR",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const duplicates = data.duplicateSerialRequests || [];
        showToast(duplicates.length
          ? `IR number updated. Warning: serial ${newSerial} is also associated with ${duplicates.map((other) => other.irNo).join(", ")}.`
          : "IR number updated", duplicates.length ? "warning" : "success");
        setUpdatingIRNumber({ uniqueId: "", irNo: "", newSerial: "", showModal: false });
        await loadAllData();
      } else {
        throw new Error("Failed to update IR number");
      }
    } catch (error) {
      console.error("Update IR number error:", error);
      showToast("Failed to update IR number", "error");
    } finally {
      setSaving(false);
    }
  };

  // ==============================
  // Render helpers
  // ==============================
  const renderItemRow = (item) => {
    const isRevision = item.isRevision;
    const isSD = !!item.sdNo;
    const deptInfo = getDeptInfo(item.department || item.deptAbbr);
    const statusInfo = getStatusInfo(item);

    return (
      <tr key={item.uniqueId || item.id || item.irNo || item.revNo || item.sdNo} className="border-b hover:bg-gray-50 transition">
        <td className="p-4">
          <div className="font-mono font-bold text-gray-800">{item.irNo || item.revNo || item.sdNo}</div>
          {item.requestType && item.requestType !== "IR" && <div className="text-xs text-teal-600">{item.requestType}</div>}
        </td>
        <td className="p-4">
          <div className="max-w-[320px] break-words text-sm font-medium text-gray-800">{displayedDescription(item)}</div>
        </td>
        <td className="p-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {isRevision ? "🔄" : isSD ? "📐" : item.requestType === "CPR" ? "🏗️" : item.requestType === "PPIR" ? "🧱" : item.requestType === "TR" ? "🧪" : "📝"}
            </span>
            <span className="text-sm">
              {isRevision ? "Revision" : isSD ? "Shop Drawing" : String(item.requestType || "IR").toUpperCase()}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-500">{item.locationType || item.typesMap?.[item.location || item.floor] || "—"}</div>
        </td>
        <td className="p-4">
          <div className="font-medium text-gray-800">{item.project}</div>
          {item.location && <div className="text-xs text-gray-500 truncate max-w-[150px]">📍 {item.location}</div>}
        </td>
        <td className="p-4">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${deptInfo.color}`}>
            {deptInfo.icon} {deptInfo.label}
          </span>
        </td>
        <td className="p-4">
          <div className="font-medium text-gray-800">{item.user}</div>
        </td>
        <td className="p-4">
          <div className="text-sm text-gray-700">{formatDate(item.sentAt || item.createdAt)}</div>
        </td>
        <td className="p-4">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
            {statusInfo.icon} {statusInfo.label}
          </span>
        </td>
        <td className="p-4">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => {
                setSelectedItem(item);
                setShowDetailsModal(true);
              }}
              className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded"
              title="Details"
            >
              👁️
            </button>

            {/* Download Word (for IR/CPR or SD) */}
            {!isRevision && !isSD && <button onClick={() => openReferencesEditor(item)} className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded" title="Edit Ref Drawings / SD Attach">📎</button>}
            <button
              onClick={() => handleDownloadWord(item)}
              className="p-2 text-green-600 hover:text-green-800 hover:bg-green-100 rounded"
              title="Download Word"
            >
              📄
            </button>

            {/* Update IR Number (only for non-revision IR/CPR, not archived) */}
            {!isRevision && !isSD && !item.isArchived && (
              <button
                onClick={() => setUpdatingIRNumber({ uniqueId: item.uniqueId || item.id, irNo: item.irNo, newSerial: "", showModal: true })}
                className="p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded"
                title="Update IR Number"
              >
                🔢
              </button>
            )}

            {/* Approve (if pending) */}
            {!item.isDone && !item.isArchived && (
              <button
                onClick={() => handleApprove(item)}
                disabled={saving}
                className="p-2 text-green-600 hover:text-green-800 hover:bg-green-100 rounded disabled:opacity-50"
                title="Approve"
              >
                ✅
              </button>
            )}

            {/* Archive / Restore */}
            {!item.isArchived ? (
              <button
                onClick={() => handleArchive(item)}
                disabled={saving}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-50"
                title="Archive"
              >
                🗄️
              </button>
            ) : (
              <button
                onClick={() => handleUnarchive(item)}
                disabled={saving}
                className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded disabled:opacity-50"
                title="Restore"
              >
                ↩️
              </button>
            )}

            {/* Delete */}
            <button
              onClick={() => handleDelete(item)}
              disabled={saving}
              className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded disabled:opacity-50"
              title="Delete"
            >
              🗑️
            </button>

            {/* Action dropdown (only for non-archived) */}
            {!item.isArchived && (
              <select
                onChange={(e) => handleUpdateAction(item, e.target.value)}
                defaultValue=""
                className="text-xs border rounded p-1"
              >
                <option value="" disabled>
                  Action
                </option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            )}
          </div>
        </td>
      </tr>
    );
  };

  // ==============================
  // Loading state
  // ==============================
  if (loading && currentData.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
          <p className="text-gray-600 font-medium">Loading DC data...</p>
        </div>
      </div>
    );
  }

  // ==============================
  // Render
  // ==============================
  return (
    <div className="p-6">
      {/* Toast */}
      {toast.show && (
        <div
          className={`fixed top-5 right-5 z-50 px-6 py-3 rounded-lg shadow-lg text-white font-medium ${
            toast.type === "error"
              ? "bg-red-600"
              : toast.type === "warning"
              ? "bg-amber-600"
              : "bg-green-600"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "error" ? "❌" : toast.type === "warning" ? "⚠️" : "✅"} {toast.message}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">📋 Document Controller Mode</h2>
            <p className="text-gray-600">Review, archive, and manage all requests, revisions, and shop drawings</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadAllData}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <span className={saving ? "animate-spin" : ""}>🔄</span> {saving ? "Updating..." : "Refresh Data"}
            </button>
            <div className="text-sm bg-gray-100 px-3 py-1 rounded-full text-gray-600">
              {user?.username || "admin"} • DC
            </div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {["pending", "archive", "all"].map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`px-4 py-2 font-medium text-sm transition flex items-center gap-2 ${
                activeView === view
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              <span>{view === "pending" ? "⏳" : view === "archive" ? "🗄️" : "📋"}</span>
              {view === "pending" && `Pending (${stats.totalPending})`}
              {view === "archive" && `Archive (${stats.totalArchive})`}
              {view === "all" && `All (${stats.totalAll})`}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-blue-700">Pending</p>
              <p className="text-2xl font-bold text-blue-800">{stats.totalPending}</p>
            </div>
            <div className="text-2xl">⏳</div>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-green-700">Completed</p>
              <p className="text-2xl font-bold text-green-800">{stats.byStatus.completed || 0}</p>
            </div>
            <div className="text-2xl">✅</div>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-700">Archived</p>
              <p className="text-2xl font-bold text-gray-800">{stats.totalArchive}</p>
            </div>
            <div className="text-2xl">🗄️</div>
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-purple-700">Shop Drawings</p>
              <p className="text-2xl font-bold text-purple-800">{stats.sdTotal}</p>
            </div>
            <div className="text-2xl">📐</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-sm text-gray-600 mb-1">🔍 Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Search by number, project, user..."
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">📁 Project</label>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">🏗️ Department</label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="all">All Departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">📄 Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.icon} {opt.label}
                </option>
              ))}
            </select>
          </div>
          {activeView === "all" && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">📊 Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-600 mb-1">🔢 Sort By</label>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-lg"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="px-3 py-2 border rounded-lg hover:bg-gray-50"
              >
                {sortOrder === "asc" ? "↑" : "↓"}
              </button>
            </div>
          </div>
        </div>

        {/* Active filters */}
        {(searchTerm ||
          projectFilter !== "all" ||
          departmentFilter !== "all" ||
          typeFilter !== "all" ||
          statusFilter !== "all") && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap gap-2">
            <span className="text-sm text-gray-600">Active filters:</span>
            {searchTerm && (
              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full flex items-center gap-1">
                Search: "{searchTerm}" <button onClick={() => setSearchTerm("")}>×</button>
              </span>
            )}
            {projectFilter !== "all" && (
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full flex items-center gap-1">
                Project: {projectFilter} <button onClick={() => setProjectFilter("all")}>×</button>
              </span>
            )}
            {departmentFilter !== "all" && (
              <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full flex items-center gap-1">
                Dept: {departmentFilter} <button onClick={() => setDepartmentFilter("all")}>×</button>
              </span>
            )}
            {typeFilter !== "all" && (
              <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full flex items-center gap-1">
                Type: {typeFilter} <button onClick={() => setTypeFilter("all")}>×</button>
              </span>
            )}
            {statusFilter !== "all" && (
              <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full flex items-center gap-1">
                Status: {statusFilter} <button onClick={() => setStatusFilter("all")}>×</button>
              </span>
            )}
            <button
              onClick={() => {
                setSearchTerm("");
                setProjectFilter("all");
                setDepartmentFilter("all");
                setTypeFilter("all");
                setStatusFilter("all");
              }}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white p-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-lg font-bold">
                {activeView === "pending" ? "Pending Items" : activeView === "archive" ? "Archive" : "All Items"}
              </h3>
              <p className="text-slate-300 text-sm">
                Showing {filteredData.length} of {currentData.length} items
              </p>
            </div>
            <div className="text-sm bg-white/10 px-3 py-1 rounded-full">{filteredData.length} items</div>
          </div>
        </div>

        {filteredData.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-gray-400 text-6xl mb-4">📭</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No items found</h3>
            <button
              onClick={() => {
                setSearchTerm("");
                setProjectFilter("all");
                setDepartmentFilter("all");
                setTypeFilter("all");
                setStatusFilter("all");
              }}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <DcProjectSections
            items={filteredData}
            columns={["Number", "Description", "Request / location type", "Project", "Department", "User", "Date", "Status", "Actions"]}
            renderRow={renderItemRow}
            onCopyAll={copySection}
            copyingGroup={copyingGroup}
            loading={loading}
          />
        )}

        {filteredData.length > 0 && (
          <div className="bg-gray-50 px-4 py-3 border-t">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="text-sm text-gray-600">
                Showing <span className="font-medium">{filteredData.length}</span> of{" "}
                <span className="font-medium">{currentData.length}</span> items
              </div>
              <button
                onClick={loadAllData}
                className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm"
              >
                🔄 Refresh
              </button>
            </div>
          </div>
        )}
      </div>

      {editingReferencesItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Edit Ref Drawings">
        <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
          <h3 className="text-xl font-bold">Edit Ref Drawings / SD Attach</h3>
          <p className="mt-1 text-sm text-gray-600">{editingReferencesItem.irNo} · One reference per line. Word export adds this request’s project and discipline.</p>
          <textarea value={referencesDraft} onChange={(event) => setReferencesDraft(event.target.value)} rows={7} className="mt-4 w-full rounded-lg border p-3 font-mono text-sm" />
          <div className="mt-4 flex justify-end gap-2"><button onClick={() => setEditingReferencesItem(null)} className="rounded-lg border px-4 py-2">Cancel</button><button disabled={saving} onClick={handleSaveReferences} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">Save references</button></div>
        </div>
      </div>}

      {/* Update IR Number Modal */}
      {updatingIRNumber.showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in">
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-6 text-white">
              <h3 className="text-xl font-bold">🔢 Update IR Number</h3>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Current IR Number</label>
                <input
                  type="text"
                  value={updatingIRNumber.irNo}
                  readOnly
                  className="w-full px-4 py-3 bg-gray-100 border rounded-lg"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">New Serial Number *</label>
                <input
                  type="number"
                  value={updatingIRNumber.newSerial}
                  onChange={(e) => setUpdatingIRNumber((prev) => ({ ...prev, newSerial: e.target.value }))}
                  className="w-full px-4 py-3 border rounded-lg"
                  placeholder="Enter new serial"
                  min="1"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setUpdatingIRNumber({ uniqueId: "", irNo: "", newSerial: "", showModal: false })}
                  className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateIRNumber}
                  disabled={saving}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50"
                >
                  {saving ? "Updating..." : "Update"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item Details Modal */}
      {showDetailsModal && selectedItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold">Details</h3>
                  <p className="text-blue-100 text-sm mt-1">{selectedItem.irNo || selectedItem.revNo || selectedItem.sdNo}</p>
                </div>
                <button onClick={() => setShowDetailsModal(false)} className="text-2xl hover:opacity-70">
                  &times;
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <pre className="text-sm bg-gray-50 p-4 rounded-lg overflow-auto">{JSON.stringify(selectedItem, null, 2)}</pre>
            </div>
            <div className="bg-gray-50 p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
              >
                Close
              </button>
              {!selectedItem.isRevision && !selectedItem.sdNo && (
                <button onClick={() => openReferencesEditor(selectedItem)} className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg">Edit Ref Drawings</button>
              )}
              {!selectedItem.isRevision && (
                <button
                  onClick={() => {
                    handleDownloadWord(selectedItem);
                    setShowDetailsModal(false);
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                >
                  📄 Download Word
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
