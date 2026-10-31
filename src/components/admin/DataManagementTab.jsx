// src/components/admin/DataManagementTab.jsx
import { useEffect, useState, useCallback, useMemo } from "react";
import { API_URL } from "../../config";

// ==============================
// Constants
// ==============================
const DEPARTMENTS = [
  { value: "Architectural", label: "Architectural", icon: "🏛️", color: "bg-blue-100 text-blue-800" },
  { value: "Civil", label: "Civil", icon: "🏗️", color: "bg-green-100 text-green-800" },
  { value: "Electrical", label: "Electrical", icon: "⚡", color: "bg-purple-100 text-purple-800" },
  { value: "Mechanical", label: "Mechanical", icon: "🔧", color: "bg-amber-100 text-amber-800" },
  { value: "Survey", label: "Survey", icon: "📐", color: "bg-indigo-100 text-indigo-800" },
];

const COMMON_FLOORS = [
  "SOG", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor", "Penthouse Floor",
  "Upper Roof", "Common area", "Common area walls", "Common area ceiling", "Stairs",
  "Services court", "Elevation", "Front Elevation", "Back Elevation", "Side Elevation",
  "Parapet of upper roof", "Public entrance",
];

// Helper to generate abbreviation from title (fallback)
const getInitialsFromTitle = (title) => {
  if (!title) return "XX";
  const words = title.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

// ==============================
// Main Component
// ==============================
export default function DataManagementTab() {
  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const [activeSection, setActiveSection] = useState("location_rules");

  // Location rules
  const [locationRules, setLocationRules] = useState({});
  const [projects, setProjects] = useState({});
  const [editingProjectRules, setEditingProjectRules] = useState({ project: "", rules: [] });
  const [newRule, setNewRule] = useState({ pattern: "", type: "", floors: [] });

  // General descriptions (IR, CPR, PPIR, TR, SD)
  const [generalDescriptions, setGeneralDescriptions] = useState({});
  const [cprDescriptions, setCprDescriptions] = useState({});
  const [ppirDescriptions, setPpirDescriptions] = useState({});
  const [trDescriptions, setTrDescriptions] = useState({});
  const [sdDescriptions, setSdDescriptions] = useState({});
  const [selectedDepartment, setSelectedDepartment] = useState("Architectural");
  const [descriptionType, setDescriptionType] = useState("IR"); // IR, cpr, sd
  const [editingDescriptions, setEditingDescriptions] = useState({
    department: "Architectural",
    base: [],
    floors: [],
    type: "IR",
  });
  const [editingSDDescriptions, setEditingSDDescriptions] = useState({
    department: "Architectural",
    base: [],
    elements: [],
    type: "sd",
  });
  const [newDescription, setNewDescription] = useState({ text: "", type: "base", floor: "" });
  const [customFloor, setCustomFloor] = useState("");

  // Sheet titles (with abbreviation)
  const [sheetTitles, setSheetTitles] = useState({});
  const [selectedSheetDept, setSelectedSheetDept] = useState("Architectural");
  const [editingSheets, setEditingSheets] = useState({ department: "Architectural", sheets: [] });
  const [newSheet, setNewSheet] = useState({ title: "", abbr: "" });

  // Subject titles (strings)
  const [subjectTitles, setSubjectTitles] = useState({});
  const [selectedSubjectDept, setSelectedSubjectDept] = useState("Architectural");
  const [editingSubjects, setEditingSubjects] = useState({ department: "Architectural", subjects: [] });
  const [newSubject, setNewSubject] = useState("");

  // ==============================
  // Toast helper
  // ==============================
  const showToast = useCallback((message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
  }, []);

  // ==============================
  // Load all data
  // ==============================
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadProjects(),
        loadLocationRules(),
        loadAllDescriptions(),      // ✅ now uses the correct single endpoint
        loadAllSheetTitles(),
        loadAllSubjectTitles(),
      ]);
    } catch (error) {
      console.error("Failed to load data:", error);
      showToast("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const res = await fetch(`${API_URL}/projects`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || {});
      }
    } catch (error) {
      console.error("Failed to load projects:", error);
    }
  };

  const loadLocationRules = async () => {
    try {
      const res = await fetch(`${API_URL}/location-rules`);
      if (res.ok) {
        const data = await res.json();
        setLocationRules(data.location_rules || {});
      }
    } catch (error) {
      console.error("Failed to load location rules:", error);
    }
  };

  // ✅ FIXED: use the single correct endpoint
  const loadAllDescriptions = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/general-descriptions`);
      if (res.ok) {
        const data = await res.json();
        setGeneralDescriptions(data.general_descriptions || {});
        setCprDescriptions(data.general_descriptions_cpr || {});
        setPpirDescriptions(data.general_descriptions_ppir || {});
        setTrDescriptions(data.general_descriptions_tr || {});
        setSdDescriptions(data.general_descriptions_sd || {});

        // Keep the currently selected catalog after save/refresh.
        const firstDept = selectedDepartment || DEPARTMENTS[0].value;
        const activeType = String(descriptionType || "IR").toLowerCase();
        const activeCatalog = activeType === "cpr"
          ? data.general_descriptions_cpr
          : activeType === "ppir"
            ? data.general_descriptions_ppir
            : activeType === "tr"
              ? data.general_descriptions_tr
              : data.general_descriptions;
        const activeDept = activeType === "cpr" ? "Civil" : firstDept;
        const IRData = activeCatalog?.[activeDept] || {};
        setEditingDescriptions({
          department: activeDept,
          base: IRData.base || [],
          floors: IRData.floors || [],
          type: activeType === "ir" ? "IR" : activeType,
        });
        setSelectedDepartment(activeDept);

        // Initialise SD descriptions for first department
        const sdData = data.general_descriptions_sd?.[firstDept] || {};
        setEditingSDDescriptions({
          department: firstDept,
          base: sdData.base || [],
          elements: sdData.elements || [],
          type: "sd",
        });
      }
    } catch (error) {
      console.error("Failed to load descriptions:", error);
      showToast("Failed to load descriptions", "error");
    }
  };

  const loadAllSheetTitles = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/sheet-titles`);
      if (res.ok) {
        const data = await res.json();
        const raw = data.sheet_titles || {};
        // Normalise to { title, abbr } objects
        const normalised = {};
        Object.entries(raw).forEach(([dept, items]) => {
          normalised[dept] = items.map(item => {
            if (typeof item === 'string') {
              return { title: item, abbr: getInitialsFromTitle(item) };
            }
            if (item && typeof item === 'object' && item.title) {
              return { title: item.title, abbr: item.abbr || getInitialsFromTitle(item.title) };
            }
            return { title: '', abbr: 'XX' };
          }).filter(s => s.title.trim() !== '');
        });
        setSheetTitles(normalised);
        const firstDept = DEPARTMENTS[0].value;
        setEditingSheets({ department: firstDept, sheets: normalised[firstDept] || [] });
        setSelectedSheetDept(firstDept);
      } else {
        throw new Error("The sheet-title catalog could not be loaded");
      }
    } catch (error) {
      console.error("Failed to load sheet titles:", error);
      showToast("Failed to load sheet titles", "error");
    }
  };

  const loadAllSubjectTitles = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/subject-titles`);
      if (res.ok) {
        const data = await res.json();
        setSubjectTitles(data.subject_titles || {});
        const firstDept = DEPARTMENTS[0].value;
        setEditingSubjects({
          department: firstDept,
          subjects: data.subject_titles?.[firstDept] || [],
        });
        setSelectedSubjectDept(firstDept);
      } else {
        throw new Error("The subject-title catalog could not be loaded");
      }
    } catch (error) {
      console.error("Failed to load subject titles:", error);
      showToast("Failed to load subject titles", "error");
    }
  };

  // ==============================
  // Location Rules handlers (unchanged)
  // ==============================
  const handleEditProjectRules = (projectName) => {
    const projectData = locationRules[projectName] || { rules: [] };
    setEditingProjectRules({ project: projectName, rules: projectData.rules || [] });
    showToast(`Loading rules for ${projectName}`, "info");
  };

  const handleAddNewRule = () => {
    if (!newRule.pattern.trim()) {
      showToast("Location pattern is required", "error");
      return;
    }
    setEditingProjectRules(prev => ({
      ...prev,
      rules: [...prev.rules, { ...newRule }],
    }));
    setNewRule({ pattern: "", type: "", floors: [] });
    showToast("Rule added", "success");
  };

  const handleRemoveRule = (index) => {
    setEditingProjectRules(prev => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
    showToast("Rule removed", "info");
  };

  const handleUpdateRule = (index, field, value) => {
    setEditingProjectRules(prev => {
      const updated = [...prev.rules];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, rules: updated };
    });
  };

  const handleSaveProjectRules = async () => {
    if (!editingProjectRules.project) {
      showToast("Project name is required", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/location-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: editingProjectRules.project,
          rules: editingProjectRules.rules,
        }),
      });
      if (res.ok) {
        showToast(`Rules for ${editingProjectRules.project} saved`, "success");
        await Promise.all([loadLocationRules(), loadProjects()]);
      } else {
        throw new Error("Failed to save location rules");
      }
    } catch (error) {
      console.error("Save location rules error:", error);
      showToast("Failed to save rules", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProjectRules = async (projectName) => {
    if (!window.confirm(`Delete all rules for "${projectName}"?\nThis cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/location-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: projectName, rules: [] }),
      });
      if (res.ok) {
        showToast(`Rules for ${projectName} deleted`, "success");
        await loadLocationRules();
        if (editingProjectRules.project === projectName) {
          setEditingProjectRules({ project: "", rules: [] });
        }
      }
    } catch (error) {
      console.error("Delete location rules error:", error);
      showToast("Failed to delete rules", "error");
    } finally {
      setSaving(false);
    }
  };

  // ==============================
  // General Descriptions handlers (IR & CPR)
  // ==============================
  const handleSelectDepartment = (dept, type = "IR") => {
    setSelectedDepartment(dept);
    setDescriptionType(type);
    let descriptionsData = { base: [], floors: [] };
    const normalizedType = type.toLowerCase();
    if (normalizedType === "cpr") {
      descriptionsData = cprDescriptions.Civil || {};
    } else if (normalizedType === "ppir") {
      descriptionsData = ppirDescriptions[dept] || {};
    } else if (normalizedType === "tr") {
      descriptionsData = trDescriptions[dept] || {};
    } else {
      descriptionsData = generalDescriptions[dept] || {};
    }
    setEditingDescriptions({
      department: dept,
      base: descriptionsData.base || [],
      floors: descriptionsData.floors || [],
      type,
    });
    showToast(`Loaded ${type} descriptions for ${dept}`, "info");
  };

  const handleAddDescription = async () => {
    if (newDescription.type === "base") {
      if (!newDescription.text.trim()) {
        showToast("Description text is required", "error");
        return;
      }
      setEditingDescriptions(prev => ({ ...prev, base: [...prev.base, newDescription.text.trim()] }));
      setNewDescription({ text: "", type: "base", floor: "" });
      showToast("Description added. Click Save to apply changes.", "success");
      return;
    }

    const floor = (customFloor.trim() || newDescription.floor).trim();
    if (!floor) {
      showToast("Please select or enter a floor", "error");
      return;
    }
    if (editingDescriptions.floors.some(existing => existing.trim().toLowerCase() === floor.toLowerCase())) {
      showToast("Floor already exists", "info");
      return;
    }

    const updated = { ...editingDescriptions, floors: [...editingDescriptions.floors, floor] };
    setEditingDescriptions(updated);
    setNewDescription({ text: "", type: "floor", floor: "" });
    setCustomFloor("");
    await persistDescriptions(updated, `Floor "${floor}" added and saved`);
  };

  const handleRemoveBaseDescription = (index) => {
    setEditingDescriptions(prev => ({
      ...prev,
      base: prev.base.filter((_, i) => i !== index),
    }));
    showToast("Description removed", "info");
  };

  const handleRemoveFloor = (index) => {
    setEditingDescriptions(prev => ({
      ...prev,
      floors: prev.floors.filter((_, i) => i !== index),
    }));
    showToast("Floor removed", "info");
  };

  const handleUpdateBaseDescription = (index, newText) => {
    setEditingDescriptions(prev => {
      const updated = [...prev.base];
      updated[index] = newText;
      return { ...prev, base: updated };
    });
  };

  const handleUpdateFloor = (index, newFloor) => {
    setEditingDescriptions(prev => {
      const updated = [...prev.floors];
      updated[index] = newFloor;
      return { ...prev, floors: updated };
    });
  };

  const persistDescriptions = async (descriptions, successMessage) => {
    if (!descriptions.department) {
      showToast("Department is required", "error");
      return false;
    }
    setSaving(true);
    try {
      const requestData = {
        department: descriptions.department,
        descriptions: {
          base: descriptions.base.filter(item => item.trim() !== ""),
          floors: descriptions.floors.filter(item => item.trim() !== ""),
        },
        type: descriptions.type,
      };
      const res = await fetch(`${API_URL}/admin/general-descriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save descriptions");
      }
      showToast(successMessage || `Descriptions for ${descriptions.department} saved`, "success");
      await loadAllDescriptions();
      return true;
    } catch (error) {
      console.error("Save descriptions error:", error);
      showToast(`Failed to save descriptions: ${error.message}`, "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDescriptions = () => persistDescriptions(editingDescriptions);

  const handleDeleteDepartmentDescriptions = async () => {
    if (!window.confirm(`Delete all descriptions for "${editingDescriptions.department}"?\nThis cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/general-descriptions/${editingDescriptions.department}?type=${encodeURIComponent(editingDescriptions.type)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast(`Descriptions for ${editingDescriptions.department} deleted`, "success");
        setEditingDescriptions(prev => ({ ...prev, base: [], floors: [] }));
        await loadAllDescriptions();
      }
    } catch (error) {
      console.error("Delete descriptions error:", error);
      showToast("Failed to delete descriptions", "error");
    } finally {
      setSaving(false);
    }
  };

  // ==============================
  // SD Descriptions handlers (unchanged)
  // ==============================
  const handleSelectSDDepartment = (dept) => {
    setSelectedDepartment(dept);
    setDescriptionType("sd");
    const deptData = sdDescriptions[dept] || {};
    setEditingSDDescriptions({
      department: dept,
      base: deptData.base || [],
      elements: deptData.elements || [],
      type: "sd",
    });
    showToast(`Loaded SD descriptions for ${dept}`, "info");
  };

  const handleAddSDDescription = () => {
    if (!newDescription.text.trim()) {
      showToast("Description text is required", "error");
      return;
    }
    const updated = { ...editingSDDescriptions };
    if (newDescription.type === "base") {
      updated.base = [...updated.base, newDescription.text.trim()];
      showToast("Base description added", "success");
    } else {
      updated.elements = [...updated.elements, newDescription.text.trim()];
      showToast("Element added", "success");
    }
    setEditingSDDescriptions(updated);
    setNewDescription({ text: "", type: "base", floor: "" });
  };

  const handleRemoveSDBase = (index) => {
    setEditingSDDescriptions(prev => ({
      ...prev,
      base: prev.base.filter((_, i) => i !== index),
    }));
    showToast("Base description removed", "info");
  };

  const handleRemoveSDElement = (index) => {
    setEditingSDDescriptions(prev => ({
      ...prev,
      elements: prev.elements.filter((_, i) => i !== index),
    }));
    showToast("Element removed", "info");
  };

  const handleUpdateSDBase = (index, newText) => {
    setEditingSDDescriptions(prev => {
      const updated = [...prev.base];
      updated[index] = newText;
      return { ...prev, base: updated };
    });
  };

  const handleUpdateSDElement = (index, newText) => {
    setEditingSDDescriptions(prev => {
      const updated = [...prev.elements];
      updated[index] = newText;
      return { ...prev, elements: updated };
    });
  };

  const handleSaveSDDescriptions = async () => {
    if (!editingSDDescriptions.department) {
      showToast("Department is required", "error");
      return;
    }
    setSaving(true);
    try {
      const requestData = {
        department: editingSDDescriptions.department,
        descriptions: {
          base: editingSDDescriptions.base.filter(item => item.trim() !== ""),
          elements: editingSDDescriptions.elements.filter(item => item.trim() !== ""),
        },
      };
      const res = await fetch(`${API_URL}/admin/general-descriptions-sd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });
      if (res.ok) {
        showToast(`SD descriptions for ${editingSDDescriptions.department} saved`, "success");
        await loadAllDescriptions();
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save SD descriptions");
      }
    } catch (error) {
      console.error("Save SD descriptions error:", error);
      showToast(`Failed to save SD descriptions: ${error.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSDDepartment = async () => {
    if (!window.confirm(`Delete all SD descriptions for "${editingSDDescriptions.department}"?\nThis cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/general-descriptions-sd/${editingSDDescriptions.department}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast(`SD descriptions for ${editingSDDescriptions.department} deleted`, "success");
        setEditingSDDescriptions(prev => ({ ...prev, base: [], elements: [] }));
        await loadAllDescriptions();
      }
    } catch (error) {
      console.error("Delete SD descriptions error:", error);
      showToast("Failed to delete SD descriptions", "error");
    } finally {
      setSaving(false);
    }
  };

  // ==============================
  // Sheet Titles handlers (unchanged)
  // ==============================
  const handleSelectSheetDept = (dept) => {
    setSelectedSheetDept(dept);
    setEditingSheets({ department: dept, sheets: sheetTitles[dept] || [] });
    showToast(`Loaded sheets for ${dept}`, "info");
  };

  const handleAddSheet = () => {
    if (!newSheet.title.trim()) {
      showToast("Sheet title is required", "error");
      return;
    }
    const abbr = newSheet.abbr.trim() || getInitialsFromTitle(newSheet.title);
    setEditingSheets(prev => ({
      ...prev,
      sheets: [...prev.sheets, { title: newSheet.title.trim(), abbr }],
    }));
    setNewSheet({ title: "", abbr: "" });
    showToast("Sheet added", "success");
  };

  const handleRemoveSheet = (index) => {
    setEditingSheets(prev => ({
      ...prev,
      sheets: prev.sheets.filter((_, i) => i !== index),
    }));
    showToast("Sheet removed", "info");
  };

  const handleUpdateSheetTitle = (index, newTitle) => {
    setEditingSheets(prev => {
      const updated = [...prev.sheets];
      updated[index] = { ...updated[index], title: newTitle };
      return { ...prev, sheets: updated };
    });
  };

  const handleUpdateSheetAbbr = (index, newAbbr) => {
    setEditingSheets(prev => {
      const updated = [...prev.sheets];
      updated[index] = { ...updated[index], abbr: newAbbr };
      return { ...prev, sheets: updated };
    });
  };

  const handleSaveSheets = async () => {
    if (!editingSheets.department) {
      showToast("Department is required", "error");
      return;
    }
    setSaving(true);
    try {
      const sheetsToSave = editingSheets.sheets
        .filter(s => s.title.trim() !== "")
        .map(s => ({ title: s.title.trim(), abbr: s.abbr.trim() || getInitialsFromTitle(s.title) }));

      const res = await fetch(`${API_URL}/admin/sheet-titles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department: editingSheets.department, sheets: sheetsToSave }),
      });
      if (res.ok) {
        showToast(`Sheet titles for ${editingSheets.department} saved`, "success");
        await loadAllSheetTitles();
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save sheets");
      }
    } catch (error) {
      console.error("Save sheets error:", error);
      showToast(`Failed to save sheets: ${error.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDepartmentSheets = async () => {
    if (!window.confirm(`Delete all sheets for "${editingSheets.department}"?\nThis cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/sheet-titles/${editingSheets.department}`, { method: "DELETE" });
      if (res.ok) {
        showToast(`Sheets for ${editingSheets.department} deleted`, "success");
        await loadAllSheetTitles();
        setEditingSheets(prev => ({ ...prev, sheets: [] }));
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || "Delete failed");
      }
    } catch (error) {
      console.error("Delete sheets error:", error);
      showToast(`Failed to delete sheets: ${error.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  // ==============================
  // Subject Titles handlers (unchanged)
  // ==============================
  const handleSelectSubjectDept = (dept) => {
    setSelectedSubjectDept(dept);
    setEditingSubjects({ department: dept, subjects: subjectTitles[dept] || [] });
    showToast(`Loaded subjects for ${dept}`, "info");
  };

  const handleAddSubject = () => {
    if (!newSubject.trim()) {
      showToast("Subject title is required", "error");
      return;
    }
    setEditingSubjects(prev => ({
      ...prev,
      subjects: [...prev.subjects, newSubject.trim()],
    }));
    setNewSubject("");
    showToast("Subject added", "success");
  };

  const handleRemoveSubject = (index) => {
    setEditingSubjects(prev => ({
      ...prev,
      subjects: prev.subjects.filter((_, i) => i !== index),
    }));
    showToast("Subject removed", "info");
  };

  const handleUpdateSubject = (index, newValue) => {
    setEditingSubjects(prev => {
      const updated = [...prev.subjects];
      updated[index] = newValue;
      return { ...prev, subjects: updated };
    });
  };

  const handleSaveSubjects = async () => {
    if (!editingSubjects.department) {
      showToast("Department is required", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/subject-titles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: editingSubjects.department,
          subjects: editingSubjects.subjects.filter(s => s.trim() !== ""),
        }),
      });
      if (res.ok) {
        showToast(`Subject titles for ${editingSubjects.department} saved`, "success");
        await loadAllSubjectTitles();
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save subjects");
      }
    } catch (error) {
      console.error("Save subjects error:", error);
      showToast("Failed to save subjects", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDepartmentSubjects = async () => {
    if (!window.confirm(`Delete all subjects for "${editingSubjects.department}"?\nThis cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/subject-titles/${editingSubjects.department}`, { method: "DELETE" });
      if (res.ok) {
        showToast(`Subjects for ${editingSubjects.department} deleted`, "success");
        setEditingSubjects(prev => ({ ...prev, subjects: [] }));
        await loadAllSubjectTitles();
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete subjects");
      }
    } catch (error) {
      console.error("Delete subjects error:", error);
      showToast("Failed to delete subjects", "error");
    } finally {
      setSaving(false);
    }
  };

  // Statistics for quick view
  const stats = useMemo(() => ({
    projectsWithRules: Object.keys(locationRules).length,
    IRDepts: Object.keys(generalDescriptions).length,
    sdDepts: Object.keys(sdDescriptions).length,
    sheetDepts: Object.keys(sheetTitles).length,
    totalProjects: Object.keys(projects).length,
  }), [locationRules, generalDescriptions, sdDescriptions, sheetTitles, projects]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
          <p className="text-gray-600 font-medium">Loading data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-5 right-5 z-50 px-6 py-3 rounded-lg shadow-lg text-white font-medium ${
          toast.type === "error" ? "bg-red-600" : toast.type === "warning" ? "bg-amber-600" : "bg-green-600"
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === "error" ? "❌" : toast.type === "warning" ? "⚠️" : "✅"} {toast.message}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">🗃️ Data Management</h2>
        <p className="text-gray-600">Manage location rules, general descriptions, sheet titles, and subject titles</p>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {["location_rules", "descriptions", "subjects", "sheets"].map(section => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`px-4 py-2 font-medium text-sm whitespace-nowrap transition-colors ${
              activeSection === section
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            {section === "location_rules" && "📍 Location Rules"}
            {section === "descriptions" && "📝 General Descriptions"}
            {section === "subjects" && "📌 SD Submittal Subject"}
            {section === "sheets" && "📄 Drawing List"}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {/* ===== LOCATION RULES SECTION ===== */}
        {activeSection === "location_rules" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800">📋 Available Projects</h3>
                <span className="text-sm text-gray-500">{stats.projectsWithRules} projects with rules</span>
              </div>
              {Object.keys(projects).length === 0 ? (
                <div className="text-center py-8 text-gray-500">No projects</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(projects).map(([projectName, projectData]) => {
                    const rules = locationRules[projectName]?.rules || [];
                    const hasRules = rules.length > 0;
                    return (
                      <div
                        key={projectName}
                        className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
                          editingProjectRules.project === projectName ? "border-blue-500 bg-blue-50" : "border-gray-200"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-bold text-gray-800">{projectName}</h4>
                            {projectData.description && (
                              <p className="text-sm text-gray-600 mt-1">{projectData.description}</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditProjectRules(projectName)}
                              className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded"
                              title="Edit rules"
                            >✏️</button>
                            {hasRules && (
                              <button
                                onClick={() => handleDeleteProjectRules(projectName)}
                                className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded"
                                title="Delete all rules"
                              >🗑️</button>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-gray-600">Rules: {rules.length}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {editingProjectRules.project && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-gray-800">✏️ Edit rules for: {editingProjectRules.project}</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingProjectRules({ project: "", rules: [] })}
                      className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
                    >Cancel</button>
                    <button
                      onClick={handleSaveProjectRules}
                      disabled={saving}
                      className="px-4 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
                    >{saving ? "Saving..." : "💾 Save"}</button>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h4 className="font-medium text-gray-700 mb-3">➕ Add New Rule</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={newRule.pattern}
                      onChange={(e) => setNewRule(p => ({ ...p, pattern: e.target.value }))}
                      className="px-3 py-2 border rounded-lg"
                      placeholder="Pattern (e.g., A2-02-01)"
                    />
                    <input
                      type="text"
                      value={newRule.type}
                      onChange={(e) => setNewRule(p => ({ ...p, type: e.target.value }))}
                      className="px-3 py-2 border rounded-lg"
                      placeholder="Type (e.g., Park-D)"
                    />
                    <button onClick={handleAddNewRule} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">
                      Add Rule
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">You can add floors later by editing the rule.</p>
                </div>

                <div>
                  <h4 className="font-medium text-gray-700 mb-3">📋 Rules ({editingProjectRules.rules.length})</h4>
                  {editingProjectRules.rules.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                      No rules yet
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {editingProjectRules.rules.map((rule, index) => (
                        <div key={index} className="border rounded-lg p-4 hover:bg-gray-50">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                              <input
                                type="text"
                                value={rule.pattern}
                                onChange={(e) => handleUpdateRule(index, "pattern", e.target.value)}
                                className="px-3 py-2 border rounded-lg"
                              />
                              <input
                                type="text"
                                value={rule.type}
                                onChange={(e) => handleUpdateRule(index, "type", e.target.value)}
                                className="px-3 py-2 border rounded-lg"
                              />
                            </div>
                            <button onClick={() => handleRemoveRule(index)} className="ml-3 p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded">
                              🗑️
                            </button>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Floors (comma separated)</label>
                            <input
                              type="text"
                              value={rule.floors?.join(", ") || ""}
                              onChange={(e) => handleUpdateRule(index, "floors", e.target.value.split(",").map(f => f.trim()))}
                              className="w-full px-3 py-2 border rounded-lg"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== DESCRIPTIONS SECTION ===== */}
        {activeSection === "descriptions" && (
          <div className="space-y-6">
            {/* Type selector */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-lg font-bold text-gray-800 mb-4">📝 Description Type</h3>
              <div className="flex flex-wrap gap-2">
                {/* IR Button */}
                <button
                  onClick={() => {
                    setDescriptionType("IR");
                    // Load current department's IR data
                    handleSelectDepartment(selectedDepartment, "IR");
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    descriptionType === "IR" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  IR Descriptions
                </button>
                {/* CPR Button - loads data from general_descriptions_cpr/Civil */}
                <button
                  onClick={() => {
                    setDescriptionType("cpr");
                    const cprData = cprDescriptions.Civil || { base: [], floors: [] };
                    setEditingDescriptions({
                      department: "Civil",
                      base: cprData.base || [],
                      floors: cprData.floors || [],
                      type: "cpr",
                    });
                    setSelectedDepartment("Civil");
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    descriptionType === "cpr" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  CPR Descriptions
                </button>
                <button
                  onClick={() => handleSelectDepartment(selectedDepartment === "Civil" ? "Civil" : selectedDepartment, "tr")}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    descriptionType === "tr" ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  TR Descriptions
                </button>
              </div>
            </div>

            {/* Department selector and editor for IR / TR */}
            {["IR", "tr"].includes(descriptionType) && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-lg font-bold text-gray-800 mb-4">🏗️ Select Department ({descriptionType.toUpperCase()})</h3>
                <div className="flex flex-wrap gap-2 mb-6">
                  {DEPARTMENTS.map(dept => (
                    <button
                      key={dept.value}
                      onClick={() => handleSelectDepartment(dept.value, descriptionType)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                        selectedDepartment === dept.value
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    ><span>{dept.icon}</span> {dept.label}</button>
                  ))}
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-600">Department: <span className="font-medium">{selectedDepartment}</span></p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteDepartmentDescriptions}
                      disabled={saving || (editingDescriptions.base.length === 0 && editingDescriptions.floors.length === 0)}
                      className="px-4 py-2 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg disabled:opacity-50"
                    >🗑️ Delete All</button>
                    <button
                      onClick={handleSaveDescriptions}
                      disabled={saving}
                      className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                    >{saving ? "Saving..." : "💾 Save"}</button>
                  </div>
                </div>
              </div>
            )}

            {/* CPR Section - fixed to Civil department */}
            {descriptionType === "cpr" && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-lg font-bold text-gray-800 mb-4">🏗️ CPR Descriptions (Civil only)</h3>
                <div className="flex justify-between items-center mb-6">
                  <p className="text-sm text-gray-600">Department: <span className="font-medium">Civil</span></p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteDepartmentDescriptions}
                      disabled={saving || (editingDescriptions.base.length === 0 && editingDescriptions.floors.length === 0)}
                      className="px-4 py-2 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg disabled:opacity-50"
                    >🗑️ Delete All</button>
                    <button
                      onClick={handleSaveDescriptions}
                      disabled={saving}
                      className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                    >{saving ? "Saving..." : "💾 Save"}</button>
                  </div>
                </div>
              </div>
            )}

            {/* SD Section - (unchanged) */}
            {descriptionType === "sd" && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-lg font-bold text-gray-800 mb-4">📐 Select Department (SD)</h3>
                <div className="flex flex-wrap gap-2 mb-6">
                  {DEPARTMENTS.map(dept => (
                    <button
                      key={dept.value}
                      onClick={() => handleSelectSDDepartment(dept.value)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                        editingSDDescriptions.department === dept.value && descriptionType === "sd"
                          ? "bg-purple-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    ><span>{dept.icon}</span> {dept.label}</button>
                  ))}
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-600">Department: <span className="font-medium">{editingSDDescriptions.department}</span></p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteSDDepartment}
                      disabled={saving || (editingSDDescriptions.base.length === 0 && editingSDDescriptions.elements.length === 0)}
                      className="px-4 py-2 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg disabled:opacity-50"
                    >🗑️ Delete All</button>
                    <button
                      onClick={handleSaveSDDescriptions}
                      disabled={saving}
                      className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                    >{saving ? "Saving..." : "💾 Save"}</button>
                  </div>
                </div>
              </div>
            )}

            {/* Add a base description or a floor. Floor entries do not have description text. */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="font-medium text-gray-700 mb-4">
                ➕ {descriptionType !== "sd" && newDescription.type === "floor" ? "Add Floor" : "Add New Description"}
              </h4>
              {descriptionType === "sd" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select
                    value={newDescription.type}
                    onChange={(e) => setNewDescription(p => ({ ...p, type: e.target.value }))}
                    className="px-3 py-2 border rounded-lg"
                  >
                    <option value="base">Base Description</option>
                    <option value="element">Element</option>
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDescription.text}
                      onChange={(e) => setNewDescription(p => ({ ...p, text: e.target.value }))}
                      className="flex-1 px-3 py-2 border rounded-lg"
                      placeholder="Enter description text"
                    />
                    <button
                      onClick={handleAddSDDescription}
                      disabled={!newDescription.text.trim()}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                    >Add</button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select
                    value={newDescription.type}
                    onChange={(e) => setNewDescription({ text: "", type: e.target.value, floor: "" })}
                    className="px-3 py-2 border rounded-lg"
                  >
                    <option value="base">General (Base)</option>
                    <option value="floor">Floor</option>
                  </select>
                  {newDescription.type === "floor" && (
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                      <label className="block min-w-0 text-sm font-medium text-gray-700">
                        Select an existing floor
                        <select
                          value={newDescription.floor}
                          onChange={(e) => {
                            setNewDescription(p => ({ ...p, floor: e.target.value }));
                            setCustomFloor("");
                          }}
                          className="mt-1 w-full px-3 py-2 border rounded-lg"
                        >
                          <option value="">Select floor</option>
                          {COMMON_FLOORS.map(floor => <option key={floor} value={floor}>{floor}</option>)}
                          {editingDescriptions.floors.filter(floor => !COMMON_FLOORS.includes(floor)).map(floor => <option key={floor} value={floor}>{floor}</option>)}
                        </select>
                      </label>
                      <label className="block min-w-0 text-sm font-medium text-gray-700">
                        Or enter a new floor
                        <input
                          type="text"
                          value={customFloor}
                          onChange={(e) => {
                            setCustomFloor(e.target.value);
                            setNewDescription(p => ({ ...p, floor: "" }));
                          }}
                          className="mt-1 w-full px-3 py-2 border rounded-lg"
                          placeholder="Type any new floor name"
                          maxLength={100}
                        />
                      </label>
                      <button
                        onClick={handleAddDescription}
                        disabled={saving || (!newDescription.floor && !customFloor.trim())}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                      >{saving ? "Saving..." : "Add & Save Floor"}</button>
                      <p className="md:col-span-3 text-xs text-gray-500">New floors are saved immediately for the selected department and request type.</p>
                    </div>
                  )}
                  {newDescription.type === "base" && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newDescription.text}
                        onChange={(e) => setNewDescription(p => ({ ...p, text: e.target.value }))}
                        className="flex-1 px-3 py-2 border rounded-lg"
                        placeholder="Description text"
                      />
                      <button
                        onClick={handleAddDescription}
                        disabled={!newDescription.text.trim()}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                      >Add</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Display lists for IR/CPR */}
            {descriptionType !== "sd" ? (
              <>
                {/* Base Descriptions */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h4 className="font-medium text-gray-700 mb-4">📝 General Descriptions ({editingDescriptions.base.length})</h4>
                  {editingDescriptions.base.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                      No descriptions
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {editingDescriptions.base.map((desc, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                          <span className="text-gray-500">{index + 1}.</span>
                          <input
                            type="text"
                            value={desc}
                            onChange={(e) => handleUpdateBaseDescription(index, e.target.value)}
                            className="flex-1 px-3 py-1 border rounded"
                          />
                          <button onClick={() => handleRemoveBaseDescription(index)} className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded">
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Floors */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h4 className="font-medium text-gray-700 mb-4">🏢 Floors ({editingDescriptions.floors.length})</h4>
                  {editingDescriptions.floors.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                      No floors
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {editingDescriptions.floors.map((floor, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                          <span className="text-gray-500">🏢</span>
                          <input
                            type="text"
                            value={floor}
                            onChange={(e) => handleUpdateFloor(index, e.target.value)}
                            className="flex-1 px-3 py-1 border rounded"
                          />
                          <button onClick={() => handleRemoveFloor(index)} className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded">
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* SD Base Descriptions */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h4 className="font-medium text-gray-700 mb-4">📝 Base Descriptions ({editingSDDescriptions.base.length})</h4>
                  {editingSDDescriptions.base.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                      No base descriptions
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {editingSDDescriptions.base.map((desc, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                          <span className="text-gray-500">{index + 1}.</span>
                          <input
                            type="text"
                            value={desc}
                            onChange={(e) => handleUpdateSDBase(index, e.target.value)}
                            className="flex-1 px-3 py-1 border rounded"
                          />
                          <button onClick={() => handleRemoveSDBase(index)} className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded">
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SD Elements */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h4 className="font-medium text-gray-700 mb-4">🔧 Elements ({editingSDDescriptions.elements.length})</h4>
                  {editingSDDescriptions.elements.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                      No elements
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {editingSDDescriptions.elements.map((elem, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                          <span className="text-gray-500">{index + 1}.</span>
                          <input
                            type="text"
                            value={elem}
                            onChange={(e) => handleUpdateSDElement(index, e.target.value)}
                            className="flex-1 px-3 py-1 border rounded"
                          />
                          <button onClick={() => handleRemoveSDElement(index)} className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded">
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ===== SUBJECT TITLES SECTION ===== */}
        {activeSection === "subjects" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-lg font-bold text-gray-800 mb-4">📌 Subject Titles for Shop Drawing</h3>
              <div className="flex flex-wrap gap-2 mb-6">
                {DEPARTMENTS.map(dept => (
                  <button
                    key={dept.value}
                    onClick={() => handleSelectSubjectDept(dept.value)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      selectedSubjectDept === dept.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  ><span>{dept.icon}</span> {dept.label}</button>
                ))}
              </div>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Department: <span className="font-medium">{selectedSubjectDept}</span></p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteDepartmentSubjects}
                    disabled={saving || editingSubjects.subjects.length === 0}
                    className="px-4 py-2 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg disabled:opacity-50"
                  >🗑️ Delete All</button>
                  <button
                    onClick={handleSaveSubjects}
                    disabled={saving}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                  >{saving ? "Saving..." : "💾 Save"}</button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="font-medium text-gray-700 mb-4">➕ Add New Subject</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg"
                  placeholder="Enter subject (e.g., SUN SCREEN FOR A6 PARK-D)"
                />
                <button
                  onClick={handleAddSubject}
                  disabled={!newSubject.trim()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                >Add</button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="font-medium text-gray-700 mb-4">📋 Subject Titles ({editingSubjects.subjects.length})</h4>
              {editingSubjects.subjects.length === 0 ? (
                <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                  No subjects
                </div>
              ) : (
                <div className="space-y-3">
                  {editingSubjects.subjects.map((subject, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                      <span className="text-gray-500">{index + 1}.</span>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => handleUpdateSubject(index, e.target.value)}
                        className="flex-1 px-3 py-1 border rounded"
                      />
                      <button onClick={() => handleRemoveSubject(index)} className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded">
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== SHEET TITLES SECTION ===== */}
        {activeSection === "sheets" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-lg font-bold text-gray-800 mb-4">📄 Sheet Titles for Shop Drawing</h3>
              <div className="flex flex-wrap gap-2 mb-6">
                {DEPARTMENTS.map(dept => (
                  <button
                    key={dept.value}
                    onClick={() => handleSelectSheetDept(dept.value)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      selectedSheetDept === dept.value ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  ><span>{dept.icon}</span> {dept.label}</button>
                ))}
              </div>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Department: <span className="font-medium">{selectedSheetDept}</span></p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteDepartmentSheets}
                    disabled={saving || editingSheets.sheets.length === 0}
                    className="px-4 py-2 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg disabled:opacity-50"
                  >🗑️ Delete All</button>
                  <button
                    onClick={handleSaveSheets}
                    disabled={saving}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                  >{saving ? "Saving..." : "💾 Save"}</button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="font-medium text-gray-700 mb-4">➕ Add New Sheet Title</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={newSheet.title}
                  onChange={(e) => setNewSheet(p => ({ ...p, title: e.target.value }))}
                  className="px-3 py-2 border rounded-lg"
                  placeholder="Sheet title (e.g., SUNSCREEN ELEVATION 1)"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSheet.abbr}
                    onChange={(e) => setNewSheet(p => ({ ...p, abbr: e.target.value }))}
                    className="flex-1 px-3 py-2 border rounded-lg"
                    placeholder="Abbreviation (e.g., SE)"
                  />
                  <button
                    onClick={handleAddSheet}
                    disabled={!newSheet.title.trim()}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                  >Add</button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">If abbreviation is left empty, it will be auto-generated from the title.</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="font-medium text-gray-700 mb-4">📋 Sheet Titles ({editingSheets.sheets.length})</h4>
              {editingSheets.sheets.length === 0 ? (
                <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                  No sheet titles
                </div>
              ) : (
                <div className="space-y-3">
                  {editingSheets.sheets.map((sheet, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                      <span className="text-gray-500">{index + 1}.</span>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={sheet.title}
                          onChange={(e) => handleUpdateSheetTitle(index, e.target.value)}
                          className="px-3 py-1 border rounded"
                          placeholder="Title"
                        />
                        <input
                          type="text"
                          value={sheet.abbr}
                          onChange={(e) => handleUpdateSheetAbbr(index, e.target.value)}
                          className="px-3 py-1 border rounded"
                          placeholder="Abbreviation"
                        />
                      </div>
                      <button onClick={() => handleRemoveSheet(index)} className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded">
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
