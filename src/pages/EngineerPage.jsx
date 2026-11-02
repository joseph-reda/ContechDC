// src/pages/EngineerPage.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import SearchableInput from "../components/SearchableInput";
import ReferenceDrawingsInput from "../components/ReferenceDrawingsInput";
import { LoadingIndicator, useNotifications } from "../components/Feedback";
import { API_URL } from "../config";
import {
  checklistDepartmentDiagnostic,
  normalizeChecklistDepartment,
} from "../utils/checklistDepartments";

const FALLBACK_FLOORS = [
  "SOG", "Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor",
  "Penthouse Floor", "Upper Roof", "Roof", "Common Area", "Stairs", "Elevation",
];

const FALLBACK_DESCRIPTIONS = {
  ir: ["Inspection Works", "Concrete Works", "Steel Reinforcement", "Formwork", "Installation Works"],
  cpr: ["Slab", "Column", "Beam", "Wall", "Foundation", "Raft", "Stair"],
  ppir: ["Post-Pour Concrete Inspection", "Dimensions and Levels Verification", "Surface Finish", "Honeycombing and Defects", "Curing Inspection"],
  tr: ["Concrete Cube Test", "Soil Compaction Test", "Material Test", "Pressure Test", "Functional Test"],
};

export default function EngineerPage({ fixedRequestType = "" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { notify: showToastMessage } = useNotifications();

  const requestedType = fixedRequestType.toLowerCase() || searchParams.get("type")?.toLowerCase() || "ir";
  const requestType = ["ppir", "tr"].includes(requestedType) ? "ir" : requestedType;

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const storedDepartment = String(user?.department || "").trim().replace(/\s+/g, " ");
  const checklistDepartment = normalizeChecklistDepartment(storedDepartment);
  const department = checklistDepartment === "ST" ? "Civil" : storedDepartment;
  const allowedTypes = Array.isArray(user?.allowedRequestTypes)
    ? user.allowedRequestTypes.map((type) => String(type).toLowerCase()).filter((type) => !["ppir", "tr"].includes(type))
    : ["ir"];

  useEffect(() => {
    if (!fixedRequestType && (["ppir", "tr"].includes(requestedType) || (!allowedTypes.includes(requestType) && allowedTypes.length > 0))) {
      setSearchParams({ type: allowedTypes[0] || "ir" }, { replace: true });
    }
  }, [fixedRequestType, requestedType, requestType, allowedTypes, setSearchParams]);

  const isCivilEngineer = checklistDepartment === "ST";

  // حقول IR/CPR
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedFloor, setSelectedFloor] = useState("");
  const [floorInput, setFloorInput] = useState("");
  const [generalDesc, setGeneralDesc] = useState("");
  const [finalDescription, setFinalDescription] = useState("");
  const [isEditingFinalDesc, setIsEditingFinalDesc] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [hasEditedFinalDesc, setHasEditedFinalDesc] = useState(false);
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [refDrawings, setRefDrawings] = useState([]);
  const [refMethod, setRefMethod] = useState("");

  // حقل Survey Level (يظهر فقط للمساحين)
  const [surveyInput, setSurveyInput] = useState("");
  const [surveyLevels, setSurveyLevels] = useState([]); // قائمة الخيارات من general_descriptions

  // حقول Shop Drawing
  const [sdSubject, setSdSubject] = useState("");
  const [protoTypes, setProtoTypes] = useState([]); // مصفوفة { type, level, levelOptions }
  const [sdTypeOptions, setSdTypeOptions] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [isRevision, setIsRevision] = useState(false);
  const [parentSdNo, setParentSdNo] = useState("");
  const [sheets, setSheets] = useState([
    { sheetTitle: "", sheetAbbr: "", sheetNumber: "", sheetRevision: "0", type: "", level: "" }
  ]);

  // بيانات القوائم
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [sheetTitleOptions, setSheetTitleOptions] = useState([]);
  const [sheetTitleAbbrMap, setSheetTitleAbbrMap] = useState({}); // { "title": "abbr" }
  const [loadingSdData, setLoadingSdData] = useState(false);
  const [checklistOptions, setChecklistOptions] = useState([]);
  const [selectedChecklistId, setSelectedChecklistId] = useState("");
  const [loadingChecklists, setLoadingChecklists] = useState(false);
  const [checklistLoadError, setChecklistLoadError] = useState("");

  // Tags
  const [irTags, setIrTags] = useState([]);
  const [irInput, setIrInput] = useState("");

  // حالات التحميل والحفظ
  const [saving, setSaving] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingDescriptions, setLoadingDescriptions] = useState(false);
  const [descriptionNotice, setDescriptionNotice] = useState("");

  // بيانات المشاريع والمواقع
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [typesMap, setTypesMap] = useState({});
  const [baseDescriptions, setBaseDescriptions] = useState([]);
  const [floors, setAvailableFloors] = useState([]);
  const [projectCounters, setProjectCounters] = useState({});
  const [numberPreview, setNumberPreview] = useState(null);
  const [loadingNumberPreview, setLoadingNumberPreview] = useState(false);
  const [numberPreviewError, setNumberPreviewError] = useState("");
  const [numberPreviewRefresh, setNumberPreviewRefresh] = useState(0);

  // نافذة إنشاء مراجعة
  const [showRevModal, setShowRevModal] = useState(false);
  const [revProject, setRevProject] = useState("");
  const [revParentId, setRevParentId] = useState("");
  const [revisionParents, setRevisionParents] = useState([]);
  const [loadingRevisionParents, setLoadingRevisionParents] = useState(false);
  const [revText, setRevText] = useState("");
  const [revNote, setRevNote] = useState("");
  const [revSaving, setRevSaving] = useState(false);
  const [revChecklistId, setRevChecklistId] = useState("");
  const saveLock = useRef(false);
  const revisionSaveLock = useRef(false);

  const REV_PARENT_SELECTION_ENABLED = false;

  const getDepartmentAbbr = useCallback((dept) => {
    if (!dept) return "ST";
    const d = dept.toUpperCase();
    if (d.includes("ARCH")) return "ARCH";
    if (d.includes("CIVIL") || d.includes("STRUCT")) return "ST";
    if (d.includes("ELECT")) return "ELECT";
    if (d.includes("MECH") || d.includes("MEP")) return "MECH";
    if (d.includes("SURV")) return "SURV";
    return "ST";
  }, []);

  // دالة لاستخراج أول حرف من أول كلمتين من النص (fallback)
  const getInitialsFromTitle = (title) => {
    if (!title) return "XX";
    const words = title.trim().split(/\s+/);
    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase();
    } else {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
  };

  // دالة لتوليد رقم الورقة باستخدام Type ومستوى الورقة نفسها والاختصار المحفوظ
  const generateSheetNumber = useCallback((sheetIndex, sheet) => {
    if (!selectedProject || !department) return "";
    const deptAbbr = getDepartmentAbbr(department);
    const cleanProject = selectedProject.replace(/\s+/g, "-").toUpperCase();
    const sheetAbbr = sheet.sheetAbbr || getInitialsFromTitle(sheet.sheetTitle);
    const sheetType = sheet.type || "";
    const sheetLevel = sheet.level || "";
    return `BA-CON-${cleanProject}-SD-${deptAbbr}-${sheetType}-${sheetLevel}-${sheetAbbr}-${(sheetIndex + 1).toString().padStart(3, "0")}`;
  }, [selectedProject, department, getDepartmentAbbr]);

  // تحديث أرقام الأوراق عند تغيير أي من البيانات المؤثرة
  useEffect(() => {
    if (requestType !== "sd") return;
    const updatedSheets = sheets.map((sheet, index) => ({
      ...sheet,
      sheetNumber: generateSheetNumber(index, sheet)
    }));
    setSheets(updatedSheets);
  }, [selectedProject, department, sheets.map(s => s.sheetTitle).join(','), sheets.map(s => s.sheetAbbr).join(','), sheets.map(s => s.type).join(','), sheets.map(s => s.level).join(','), requestType, generateSheetNumber]);

  // تحميل المشاريع
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch(`${API_URL}/projects`);
      const data = await res.json();
      const projectList = Object.keys(data.projects || {}).sort();
      const countersMap = {};
      Object.entries(data.projects || {}).forEach(([name, projData]) => {
        countersMap[name] = projData.counters || {};
      });
      setProjects(projectList);
      setProjectCounters(countersMap);
    } catch (err) {
      console.error("Projects load failed:", err);
      setProjects(["Project A", "Project B", "Project C", "Project D"]);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    if (!selectedProject || requestType === "sd") {
      setNumberPreview(null);
      setNumberPreviewError("");
      setLoadingNumberPreview(false);
      return () => controller.abort();
    }
    const loadNumberPreview = async () => {
      setLoadingNumberPreview(true);
      setNumberPreviewError("");
      try {
        const params = new URLSearchParams({
          project: selectedProject,
          requestType: requestType.toUpperCase(),
          department,
        });
        const response = await fetch(`${API_URL}/irs/next-number?${params}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load the next request number");
        setNumberPreview(data);
      } catch (error) {
        if (error.name !== "AbortError") {
          setNumberPreview(null);
          setNumberPreviewError(error.message || "Could not load the next request number");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingNumberPreview(false);
      }
    };
    loadNumberPreview();
    return () => controller.abort();
  }, [selectedProject, requestType, department, numberPreviewRefresh]);

  // تحميل المواقع (لـ IR/CPR)
  useEffect(() => {
    if (requestType === "sd") {
      setLocations([]);
      return;
    }
    if (!selectedProject) {
      setLocations([]);
      setTypesMap({});
      return;
    }
    const loadLocations = async () => {
      setLoadingData(true);
      try {
        const params = new URLSearchParams({ project: selectedProject });
        const res = await fetch(`${API_URL}/locations?${params}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        setLocations(data.locations || []);
        setTypesMap(data.types_map || {});
      } catch (err) {
        console.error("Locations load failed:", err);
        setLocations([`No locations configured for ${selectedProject}`]);
        setTypesMap({});
      } finally {
        setLoadingData(false);
      }
    };
    loadLocations();
  }, [selectedProject, requestType]);

  useEffect(() => {
    setSelectedLocation("");
    setGeneralDesc("");
    setSelectedFloor("");
    setFloorInput("");
    setFinalDescription("");
    setDescriptionDraft("");
    setIsEditingFinalDesc(false);
    setHasEditedFinalDesc(false);
  }, [selectedProject, requestType]);

  useEffect(() => {
    let cancelled = false;
    if (!["ir", "cpr"].includes(requestType) || !department) {
      setChecklistOptions([]);
      setSelectedChecklistId("");
      setChecklistLoadError("");
      return () => { cancelled = true; };
    }
    if (!checklistDepartment) {
      setChecklistOptions([]);
      setSelectedChecklistId("");
      setChecklistLoadError(checklistDepartmentDiagnostic(department));
      return () => { cancelled = true; };
    }
    const loadChecklists = async () => {
      setLoadingChecklists(true);
      try {
        const params = new URLSearchParams({
          requestType: requestType.toUpperCase(),
          department: checklistDepartment,
        });
        const response = await fetch(`${API_URL}/checklists/options?${params}`, { credentials: "include" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Checklist options could not be loaded");
        if (cancelled) return;
        const options = Array.isArray(data.options) ? data.options : [];
        setChecklistLoadError("");
        setChecklistOptions(options);
        setSelectedChecklistId((current) => options.some((option) => option.id === current) ? current : "");
      } catch (error) {
        if (!cancelled) {
          console.error("Checklist options load failed:", error);
          setChecklistOptions([]);
          setSelectedChecklistId("");
          setChecklistLoadError(error.message || "Checklist options could not be loaded");
        }
      } finally {
        if (!cancelled) setLoadingChecklists(false);
      }
    };
    loadChecklists();
    return () => { cancelled = true; };
  }, [requestType, department, checklistDepartment]);

  // تحميل الأوصاف العامة (IR/CPR)
  const loadDescriptions = useCallback(async () => {
    if (requestType === "sd") return;
    if (!selectedProject || !department) {
      setBaseDescriptions([]);
      setAvailableFloors([]);
      setSurveyLevels([]);
      setDescriptionNotice("");
      return;
    }
    setLoadingDescriptions(true);
    setDescriptionNotice("");
    try {
      const params = new URLSearchParams({
        project: selectedProject,
        dept: department,
        requestType: requestType.toUpperCase(),
      });
      const res = await fetch(`${API_URL}/general-descriptions?${params}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      const fallbackBase = FALLBACK_DESCRIPTIONS[requestType] || FALLBACK_DESCRIPTIONS.ir;
      const loadedBase = Array.isArray(data.base) ? data.base.filter(Boolean) : [];
      const loadedFloors = Array.isArray(data.floors) ? data.floors.filter(Boolean) : [];
      if (requestType === "cpr") {
        setBaseDescriptions(loadedBase.length ? loadedBase : fallbackBase);
        setAvailableFloors(loadedFloors.length ? loadedFloors : FALLBACK_FLOORS);
      } else {
        setBaseDescriptions(loadedBase.length ? loadedBase : fallbackBase);
        setAvailableFloors(loadedFloors.length ? loadedFloors : FALLBACK_FLOORS);
        // تخزين الـ levels الخاصة بـ Survey إذا كانت موجودة
        setSurveyLevels(Array.isArray(data.levels) ? data.levels.filter(Boolean) : []);
      }
    } catch (err) {
      console.error("Descriptions load failed:", err);
      setBaseDescriptions(FALLBACK_DESCRIPTIONS[requestType] || FALLBACK_DESCRIPTIONS.ir);
      setAvailableFloors(FALLBACK_FLOORS);
      setSurveyLevels([]);
      setDescriptionNotice("The saved catalog could not be loaded, so the built-in options are being shown.");
    } finally {
      setLoadingDescriptions(false);
    }
  }, [selectedProject, department, requestType]);

  useEffect(() => {
    loadDescriptions();
  }, [loadDescriptions]);

  // تحميل بيانات SD (subjects, sheets)
  useEffect(() => {
    if (requestType !== "sd" || !department) return;
    const loadSdData = async () => {
      setLoadingSdData(true);
      try {
        const deptMap = {
          ARCH: "Architectural",
          Civil: "Civil",
          ELECT: "Electrical",
          MECH: "Mechanical",
          SURV: "Survey",
        };
        const deptName = deptMap[department] || department;

        const subjectsRes = await fetch(`${API_URL}/subject-titles/${encodeURIComponent(deptName)}`);
        if (subjectsRes.ok) {
          const subjectsData = await subjectsRes.json();
          console.log("Subjects loaded:", subjectsData.subjects);
          setSubjectOptions(subjectsData.subjects || []);
        } else {
          setSubjectOptions([]);
        }

        const sheetsRes = await fetch(`${API_URL}/sheet-titles/${encodeURIComponent(deptName)}`);
        if (sheetsRes.ok) {
          const sheetsData = await sheetsRes.json();
          console.log("Sheets loaded:", sheetsData.sheets);
          const rawSheets = sheetsData.sheets || [];
          const titles = [];
          const abbrMap = {};
          rawSheets.forEach(item => {
            if (typeof item === 'string') {
              const title = item;
              const abbr = getInitialsFromTitle(title);
              titles.push(title);
              abbrMap[title] = abbr;
            } else if (item && typeof item === 'object' && item.title) {
              const title = item.title;
              const abbr = item.abbr || getInitialsFromTitle(title);
              titles.push(title);
              abbrMap[title] = abbr;
            }
          });
          setSheetTitleOptions(titles);
          setSheetTitleAbbrMap(abbrMap);
        } else {
          setSheetTitleOptions([]);
          setSheetTitleAbbrMap({});
        }
      } catch (err) {
        console.error("Error loading SD data:", err);
        setSubjectOptions([]);
        setSheetTitleOptions([]);
        setSheetTitleAbbrMap({});
      } finally {
        setLoadingSdData(false);
      }
    };
    loadSdData();
  }, [requestType, department]);

  // تحميل خيارات Type من `/sd-types?project=...`
  useEffect(() => {
    if (requestType !== "sd" || !selectedProject) {
      setSdTypeOptions([]);
      return;
    }
    const fetchTypes = async () => {
      setLoadingTypes(true);
      try {
        const res = await fetch(`${API_URL}/sd-types?project=${encodeURIComponent(selectedProject)}`);
        if (res.ok) {
          const data = await res.json();
          setSdTypeOptions(data.types || []);
        } else {
          setSdTypeOptions([]);
        }
      } catch (err) {
        console.error("Error loading types:", err);
        setSdTypeOptions([]);
      } finally {
        setLoadingTypes(false);
      }
    };
    fetchTypes();
  }, [requestType, selectedProject]);

  // دوال لإدارة protoTypes (اختيار متعدد)
  const handleAddProtoType = (newType) => {
    if (!newType) return;
    if (protoTypes.some(p => p.type === newType)) return;
    setProtoTypes(prev => [...prev, { type: newType, levels: [] }]);
    // نترك المستخدم يختار المستويات يدويًا (لأنه لم يعد هناك fetch للمستويات)
  };

  const handleAddLevel = (type, level) => {
    if (!level) return;
    setProtoTypes(prev => prev.map(p =>
      p.type === type
        ? { ...p, levels: [...p.levels, level] }
        : p
    ));
  };

  const handleRemoveLevel = (type, levelToRemove) => {
    setProtoTypes(prev => prev.map(p =>
      p.type === type
        ? { ...p, levels: p.levels.filter(l => l !== levelToRemove) }
        : p
    ));
  };

  const handleRemoveProtoType = (typeToRemove) => {
    setProtoTypes(prev => prev.filter(p => p.type !== typeToRemove));
  };

  // دوال لإدارة الأوراق
  const handleAddSheet = () => {
    setSheets(prev => [...prev, { sheetTitle: "", sheetAbbr: "", sheetNumber: "", sheetRevision: "0", type: "", level: "" }]);
  };

  const handleRemoveSheet = (index) => {
    if (sheets.length > 1) setSheets(prev => prev.filter((_, i) => i !== index));
  };

  const handleSheetChange = (index, field, value) => {
    const newSheets = [...sheets];
    newSheets[index][field] = value;
    if (field === 'sheetTitle') {
      const abbr = sheetTitleAbbrMap[value] || getInitialsFromTitle(value);
      newSheets[index].sheetAbbr = abbr;
    }
    setSheets(newSheets);
  };

  const handleSheetTypeChange = (index, newType) => {
    handleSheetChange(index, "type", newType);
    handleSheetChange(index, "level", ""); // clear level when type changes
  };

  // إدارة Tags
  const handleAddIrTag = () => {
    if (irInput.trim()) {
      setIrTags((prev) => [...prev, irInput.trim()]);
      setIrInput("");
    }
  };
  const handleKeyPress = (e, type) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (type === "engineer" && irInput.trim()) handleAddIrTag();
    }
  };
  const removeTag = (index, setTags) => {
    setTags((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setGeneralDesc("");
    setIrTags([]);
    setIrInput("");
    setSelectedLocation("");
    setSelectedFloor("");
    setFloorInput("");
    setFinalDescription("");
    setIsEditingFinalDesc(false);
    setDescriptionDraft("");
    setHasEditedFinalDesc(false);
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setRemarks("");
    setRefDrawings([]);
    setRefMethod("");
    setSelectedChecklistId("");
    setSurveyInput("");
    setSdSubject("");
    setProtoTypes([]);
    setIsRevision(false);
    setParentSdNo("");
    setSheets([{ sheetTitle: "", sheetAbbr: "", sheetNumber: "", sheetRevision: "0", type: "", level: "" }]);
  };

  // Generate the final description for IR, CPR, PPIR and TR.
  useEffect(() => {
    if (isEditingFinalDesc || hasEditedFinalDesc) return;
    if (requestType === "cpr") {
      const desc = generalDesc || "Concrete Pouring";
      const floor = floorInput.trim() ? ` For ${floorInput.trim()}` : "";
      const location = selectedLocation ? ` At ${selectedLocation}` : "";
      const finalDesc = `Concrete Pouring Request For ${desc}${floor}${location}`;
      setFinalDescription(finalDesc);
    } else if (requestType === "ppir") {
      const desc = generalDesc || "Post Pour Inspection";
      const floor = selectedFloor ? ` for ${selectedFloor}` : "";
      const location = selectedLocation ? ` at ${selectedLocation}` : "";
      const finalDesc = `Post Pour Inspection Report for ${desc}${floor}${location}`;
      setFinalDescription(finalDesc);
    } else if (requestType === "tr") {
      const desc = generalDesc || "Material Test";
      const location = selectedLocation ? ` at ${selectedLocation}` : "";
      const finalDesc = `Test Report for ${desc}${location}`;
      setFinalDescription(finalDesc);
    } else if (requestType !== "sd") {
      const desc = generalDesc || "Inspection";
      const floor = selectedFloor ? ` For ${selectedFloor}` : "";
      const location = selectedLocation ? ` At ${selectedLocation}` : "";
      const typeStr = typesMap[selectedLocation] ? ` (${typesMap[selectedLocation]})` : "";
      const survey = surveyInput ? ` ${surveyInput}` : "";
      const finalDesc = `${desc}${floor}${survey}${typeStr}${location}`.trim();
      setFinalDescription(finalDesc);
    }
  }, [generalDesc, selectedLocation, selectedFloor, floorInput, typesMap, requestType, isEditingFinalDesc, hasEditedFinalDesc, surveyInput]);

  // حفظ الطلب
  const handleSave = async () => {
    if (saveLock.current) return;
    const descriptionToSubmit = isEditingFinalDesc ? descriptionDraft : finalDescription;
    if (requestType === "sd") {
      if (!selectedProject) {
        showToastMessage("Please select a project", "error");
        return;
      }
      if (!sdSubject.trim()) {
        showToastMessage("Please enter a subject", "error");
        return;
      }
      if (isRevision && !parentSdNo.trim()) {
        showToastMessage("Please enter the original SD number", "error");
        return;
      }
      for (let i = 0; i < sheets.length; i++) {
        if (!sheets[i].sheetTitle.trim()) {
          showToastMessage(`Sheet ${i + 1}: Title is required`, "error");
          return;
        }
      }

      saveLock.current = true;
      setSaving(true);
      try {
        const payload = {
          project: selectedProject,
          department: department,
          user: user.username,
          subject: sdSubject,
          protoTypes: protoTypes.map(({ type, levels }) => ({ type, levels })),
          isRevision,
          parentSdNo: isRevision ? parentSdNo : undefined,
          sheets: sheets.map(({ sheetTitle, sheetAbbr, sheetNumber, sheetRevision, type, level }) => ({
            sheetTitle,
            sheetAbbr,
            sheetNumber,
            sheetRevision,
            type,
            level
          })),
        };
        const res = await fetch(`${API_URL}/shopdrawings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
          showToastMessage("Shop Drawing created successfully!", "success");
          resetForm();
          setSelectedProject("");
        } else {
          throw new Error(data.error || "Failed to create shop drawing");
        }
      } catch (err) {
        console.error("Save error:", err);
        showToastMessage(`Error: ${err.message}`, "error");
      } finally {
        setSaving(false);
        saveLock.current = false;
      }
    } else {
      // Save IR, CPR, PPIR or TR.
      if (!selectedProject) {
        showToastMessage("Please select a project", "error");
        return;
      }
      if (!selectedLocation) {
        showToastMessage("Please select a location", "error");
        return;
      }
      if (!generalDesc) {
        showToastMessage("Please select a work description", "error");
        return;
      }
      if (!descriptionToSubmit.trim()) {
        showToastMessage("Please enter a final description", "error");
        return;
      }
      if (["ppir", "tr"].includes(requestType) && !receivedDate) {
        showToastMessage("Please enter the received date", "error");
        return;
      }
      if (!numberPreview?.irNo || loadingNumberPreview) {
        showToastMessage("Wait until the server confirms the next request number", "error");
        return;
      }

      saveLock.current = true;
      setSaving(true);
      const payload = {
        project: selectedProject,
        location: selectedLocation,
        desc: descriptionToSubmit,
        user: user.username,
        department: department,
        requestType: requestType.toUpperCase(),
        category: generalDesc,
        tags: { engineer: irTags },
        ...(requestType !== "cpr" ? { refDrawings, refMethod: refMethod.trim() } : {}),
        isEdited: hasEditedFinalDesc || isEditingFinalDesc,
        surveyInput: surveyInput,
        receivedDate: ["ppir", "tr"].includes(requestType) ? receivedDate : undefined,
        remarks: remarks.trim() || undefined,
        expectedIrNo: numberPreview.irNo,
        ...(selectedChecklistId ? { checklistId: selectedChecklistId } : {}),
      };
      if (requestType !== "cpr" && selectedFloor) {
        payload.floor = selectedFloor;
      }
      if (requestType === "cpr") payload.floorInput = floorInput.trim();

      try {
        const res = await fetch(`${API_URL}/irs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
          const duplicates = data.duplicateSerialRequests || [];
          showToastMessage(duplicates.length
            ? `${data.item.irNo} created. Warning: serial ${data.item.serialNumber} is also used by ${duplicates.map((other) => other.irNo).join(", ")}.`
            : `${requestType.toUpperCase()} created successfully as ${data.item.irNo}.`, duplicates.length ? "warning" : "success");
          resetForm();
          await loadProjects();
          setNumberPreviewRefresh((value) => value + 1);
        } else {
          if (res.status === 409 && data.preview) setNumberPreview(data.preview);
          throw new Error(data.error || `Failed to create ${requestType}`);
        }
      } catch (err) {
        console.error("Save error:", err);
        showToastMessage(`Error: ${err.message}`, "error");
      } finally {
        setSaving(false);
        saveLock.current = false;
      }
    }
  };

  const handleSaveRev = async () => {
    if (revisionSaveLock.current) return;
    if (!revProject || !revText.trim() || (REV_PARENT_SELECTION_ENABLED && !revParentId)) {
      showToastMessage(REV_PARENT_SELECTION_ENABLED
        ? "Select a project, its parent request, and an IR Revision Number"
        : "Select a project and enter the IR Revision Number", "error");
      return;
    }
    let revisionType = "IR_REVISION";
    let parentRequestType = "IR";
    if (requestType === "cpr") {
      if (!isCivilEngineer) {
        showToastMessage("CPR revisions are only available for Civil engineers", "error");
        return;
      }
      revisionType = "CPR_REVISION";
      parentRequestType = "CPR";
    }

    revisionSaveLock.current = true;
    setRevSaving(true);
    try {
      const res = await fetch(`${API_URL}/revs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: revProject,
          ...(REV_PARENT_SELECTION_ENABLED && revParentId ? { parentDocumentId: revParentId } : {}),
          revText: revText.trim(),
          revNote: revNote.trim(),
          user: user.username,
          department: department,
          revisionType: revisionType,
          parentRequestType: parentRequestType,
          ...(revChecklistId ? { checklistId: revChecklistId } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const revTypeDisplay = revisionType === "CPR_REVISION" ? "CPR Revision" : "IR Revision";
        showToastMessage(`${revTypeDisplay} created!`, "success");
        setShowRevModal(false);
        setRevProject("");
        setRevParentId("");
        setRevText("");
        setRevNote("");
        setRevChecklistId("");
      } else {
        throw new Error(data.error || "Failed to create revision");
      }
    } catch (err) {
      console.error("Revision error:", err);
      showToastMessage(err.message, "error");
    } finally {
      setRevSaving(false);
      revisionSaveLock.current = false;
    }
  };

  const openRevisionDialog = async () => {
    setShowRevModal(true);
    setRevParentId("");
    setRevChecklistId("");
    if (!REV_PARENT_SELECTION_ENABLED) {
      setRevisionParents([]);
      setLoadingRevisionParents(false);
      return;
    }
    setLoadingRevisionParents(true);
    try {
      const response = await fetch(`${API_URL}/irs`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load parent requests");
      const parentType = requestType === "cpr" ? "CPR" : "IR";
      setRevisionParents((data.irs || []).filter((item) => String(item.requestType || "IR").toUpperCase() === parentType));
    } catch (error) {
      setRevisionParents([]);
      showToastMessage(error.message, "error");
    } finally {
      setLoadingRevisionParents(false);
    }
  };

  const switchRequestType = (type) => {
    if (type === "CPR" && !isCivilEngineer) {
      showToastMessage("CPR requests are only available for Civil engineers", "error");
      return;
    }
    if (fixedRequestType) navigate(`/engineer?type=${type.toLowerCase()}`);
    else setSearchParams({ type: type.toLowerCase() });
    resetForm();
    setSelectedProject("");
  };

  const getNextNumberPreview = () => {
    if (!selectedProject || !department) return "";
    const deptAbbr = getDepartmentAbbr(department);
    const counters = projectCounters[selectedProject] || {};
    if (requestType !== "sd") return numberPreview?.irNo || "";
    const counterKey = `SD_${deptAbbr}`;
    const currentCount = counters[counterKey] || 0;
    const nextCount = currentCount + 1;
    const cleanProject = selectedProject.replace(/\s+/g, "-").toUpperCase();

    const firstSheet = sheets[0] || {};
    const subjectInitials = sdSubject.trim() ? sdSubject.trim().substring(0, 2).toUpperCase() : "XX";
    const firstType = firstSheet.type || "";
    const firstLevel = firstSheet.level || "";
    return `BA-CON-${cleanProject}-SD-${deptAbbr}-${firstType}-${firstLevel}-${subjectInitials}-${nextCount.toString().padStart(3, "0")}`;
  };

  const NextNumberPreview = () => {
    const nextNumber = getNextNumberPreview();
    if (requestType !== "sd" && loadingNumberPreview) {
      return <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4"><LoadingIndicator label="Calculating the authoritative next number…" /></div>;
    }
    if (requestType !== "sd" && numberPreviewError) {
      return <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">Could not preview the next number: {numberPreviewError}</div>;
    }
    if (!nextNumber) return null;
    return (
      <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg shadow-sm">
        <p className="text-sm font-medium text-purple-700 mb-1 flex items-center gap-2">
          <span>🔢</span> Next number will be:
        </p>
        <p className="font-mono font-bold text-lg text-gray-800 break-all">
          {nextNumber}
        </p>
      </div>
    );
  };

  const isSurvey = department === "SURV" || department?.toLowerCase().includes("survey");

  if (fixedRequestType && !allowedTypes.includes(requestType)) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-16">
        <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">TR creation is not enabled for this account</h1>
          <p className="mt-3 text-sm text-slate-600">Ask an administrator to add TR to the engineer account's allowed request types.</p>
          <button onClick={() => navigate("/engineer")} className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Return to engineer workspace</button>
        </div>
      </div>
    );
  }

  // قائمة المستويات الثابتة
  const FLOOR_OPTIONS = ["GR", "1st", "2nd", "3rd", "4th", "Penthiuse"];

  return (
    <main className="engineer-workspace min-h-screen pb-10">
      <div className={`engineer-form-shell max-w-6xl mx-auto pt-8 px-4 ${requestType === "sd" ? "max-w-[1500px]" : ""}`}>
        {/* Header */}
        <header className="engineer-page-header flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className={`text-4xl font-bold ${
              requestType === "cpr" ? "text-green-600" :
              requestType === "sd" ? "text-purple-600" : "text-blue-600"
            }`}>
              {requestType === "cpr" ? "🏗️ Concrete Pouring Request (CPR)" :
               requestType === "sd" ? "📐 Shop Drawing" :
               requestType === "ppir" ? "🧱 Post Pour Inspection Report (PPIR)" :
               requestType === "tr" ? "🧪 Test Report (TR)" : "📋 Inspection Request (IR)"}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-gray-600">Logged in as:</span>
              <span className={`font-bold text-lg px-3 py-1 rounded-full ${
                requestType === "cpr" ? "bg-green-100 text-green-800" :
                requestType === "sd" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
              }`}>
                {user.username}
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600">{department}</span>
            </div>
          </div>

          <div className="engineer-type-switcher bg-white rounded-xl shadow-sm border p-1 flex flex-wrap">
            {allowedTypes.includes("ir") && (
              <button onClick={() => switchRequestType("IR")}
                className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                  requestType === "ir" ? "bg-blue-600 text-white shadow-md" : "hover:bg-gray-100 text-gray-600"
                }`}>📝 IR</button>
            )}
            {isCivilEngineer && allowedTypes.includes("cpr") && (
              <button onClick={() => switchRequestType("CPR")}
                className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                  requestType === "cpr" ? "bg-green-600 text-white shadow-md" : "hover:bg-gray-100 text-gray-600"
                }`}>🏗️ CPR</button>
            )}
            {allowedTypes.includes("sd") && (
              <button onClick={() => switchRequestType("SD")}
                className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                  requestType === "sd" ? "bg-purple-600 text-white shadow-md" : "hover:bg-gray-100 text-gray-600"
                }`}>📐 Shop Drawing</button>
            )}
          </div>

          <button type="button" onClick={() => navigate("/engineer/reports")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 font-semibold text-blue-800 transition-colors hover:bg-blue-100">
            <span aria-hidden="true">▥</span> Reports &amp; Charts
          </button>

          {["ir", "cpr"].includes(requestType) && (
            <button onClick={openRevisionDialog}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-md transition-all hover:-translate-y-0.5">
              + Create Revision (REV)
            </button>
          )}
        </header>

        {requestType === "sd" ? (
          /* نموذج Shop Drawing */
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-purple-600 mb-6 flex items-center gap-2">
                <span className="w-1.5 h-8 bg-purple-600 rounded-full"></span>
                📐 Shop Drawing Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SearchableInput
                  label="Project *"
                  options={projects}
                  value={selectedProject}
                  onChange={setSelectedProject}
                  placeholder="Select project..."
                  loading={loadingProjects}
                  disabled={loadingProjects}
                />
                <SearchableInput
                  label="Subject *"
                  options={subjectOptions}
                  value={sdSubject}
                  onChange={setSdSubject}
                  placeholder={loadingSdData ? "Loading subjects..." : subjectOptions.length === 0 ? "No subjects available" : "Select or type subject..."}
                  disabled={loadingSdData || subjectOptions.length === 0}
                  loading={loadingSdData}
                />
              </div>

              {/* حقل اختيار الأنواع المتعددة (Proto-types) */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Proto-types (select multiple)
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {sdTypeOptions.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleAddProtoType(type)}
                      className={`px-3 py-1 rounded-full text-sm ${
                        protoTypes.some(p => p.type === type)
                          ? "bg-purple-600 text-white"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                {protoTypes.length > 0 && (
                  <div className="space-y-4 mt-2">
                    {protoTypes.map((item) => (
                      <div key={item.type} className="p-3 border rounded bg-gray-50">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-purple-700">{item.type}</span>
                          <button onClick={() => handleRemoveProtoType(item.type)} className="text-red-600 hover:text-red-800 text-sm">✕ Remove Type</button>
                        </div>
                        <div className="mb-2">
                          <label className="block text-sm text-gray-600 mb-1">Selected Levels:</label>
                          <div className="flex flex-wrap gap-2">
                            {item.levels.map(level => (
                              <span key={level} className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                                {level}
                                <button onClick={() => handleRemoveLevel(item.type, level)} className="text-purple-600 hover:text-purple-800">×</button>
                              </span>
                            ))}
                            {item.levels.length === 0 && <span className="text-sm text-gray-400 italic">No levels selected</span>}
                          </div>
                        </div>
                        <div>
                          <SearchableInput
                            options={FLOOR_OPTIONS} // استخدام القائمة الثابتة
                            value="" // لا قيمة محددة، سنستخدم onChange للإضافة
                            onChange={(value) => handleAddLevel(item.type, value)}
                            placeholder="Add level..."
                            disabled={!item.type}
                            creatable={true}
                            className="w-full"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* خيار Revision */}
              <div className="mt-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={isRevision} onChange={(e) => setIsRevision(e.target.checked)} className="rounded border-gray-300" />
                  <span className="text-sm text-gray-700">This is a revision of an existing shop drawing</span>
                </label>
              </div>

              {isRevision && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Original Shop Drawing Number *</label>
                  <input type="text" value={parentSdNo} onChange={(e) => setParentSdNo(e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="e.g., BA-CON-A6-SD-ARCH-Prototype-A1-SU-001" />
                </div>
              )}

              {/* جدول الأوراق */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Sheets</h3>
                  <button type="button" onClick={handleAddSheet} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm">+ Add Sheet</button>
                </div>
                <div className="overflow-x-auto" style={{ overflow: 'visible' }}>
                  <table className="w-full border">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left text-sm">Title</th>
                        <th className="p-2 text-left text-sm">Type</th>
                        <th className="p-2 text-left text-sm">Level</th>
                        <th className="p-2 text-left text-sm">Number</th>
                        <th className="p-2 text-left text-sm">Revision</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheets.map((sheet, index) => (
                        <tr key={index} className="border-t">
                          <td className="p-2" style={{ position: 'relative', zIndex: 1000 + index }}>
                            <SearchableInput
                              options={sheetTitleOptions}
                              value={sheet.sheetTitle}
                              onChange={(value) => handleSheetChange(index, "sheetTitle", value)}
                              placeholder={loadingSdData ? "Loading titles..." : sheetTitleOptions.length === 0 ? "No titles available" : "Select or type title..."}
                              disabled={loadingSdData || sheetTitleOptions.length === 0}
                              loading={loadingSdData}
                              dropdownClassName="searchable-input-dropdown"
                            />
                          </td>
                          <td className="p-2" style={{ position: 'relative', zIndex: 1000 + index }}>
                            <SearchableInput
                              options={sdTypeOptions}
                              value={sheet.type}
                              onChange={(value) => handleSheetTypeChange(index, value)}
                              placeholder={loadingTypes ? "Loading types..." : sdTypeOptions.length === 0 ? "No types" : "Select type (optional)"}
                              disabled={!selectedProject || loadingTypes}
                              loading={loadingTypes}
                              creatable={true}
                              dropdownClassName="searchable-input-dropdown"
                            />
                          </td>
                          <td className="p-2" style={{ position: 'relative', zIndex: 1000 + index }}>
                            <SearchableInput
                              options={FLOOR_OPTIONS} // القائمة الثابتة
                              value={sheet.level}
                              onChange={(value) => handleSheetChange(index, "level", value)}
                              placeholder="Select level (optional)..."
                              creatable={true}
                              dropdownClassName="searchable-input-dropdown"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={sheet.sheetNumber}
                              onChange={(e) => handleSheetChange(index, "sheetNumber", e.target.value)}
                              className="w-full p-2 border rounded bg-gray-50"
                              placeholder="Auto-generated"
                              readOnly
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={sheet.sheetRevision}
                              onChange={(e) => handleSheetChange(index, "sheetRevision", e.target.value)}
                              className="w-full p-2 border rounded"
                            >
                              <option value="0">0</option>
                              <option value="1">1</option>
                              <option value="2">2</option>
                              <option value="3">3</option>
                            </select>
                          </td>
                          <td className="p-2">
                            {sheets.length > 1 && (
                              <button onClick={() => handleRemoveSheet(index)} className="text-red-600 hover:text-red-800">✕</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedProject && <NextNumberPreview />}
            </div>

            <button onClick={handleSave} disabled={saving || !selectedProject || !sdSubject}
              className={`w-full py-5 rounded-xl text-white font-bold text-lg shadow-xl transition-all transform hover:-translate-y-1 ${
                saving || !selectedProject || !sdSubject ? "bg-gray-400 cursor-not-allowed" : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
              }`}>
              {saving ? <LoadingIndicator label="Submitting shop drawing…" compact inverse /> : "📐 Submit Shop Drawing"}
            </button>
          </div>
        ) : (
          /* نموذج IR/CPR */
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <h2 className={`text-xl font-bold mb-6 flex items-center gap-2 ${requestType === "cpr" ? "text-green-600" : "text-blue-600"}`}>
                <span className={`w-1.5 h-8 rounded-full ${requestType === "cpr" ? "bg-green-600" : "bg-blue-600"}`}></span>
                {requestType === "cpr" ? "🏗️ Concrete Pouring Details" :
                 requestType === "ppir" ? "🧱 Post Pour Inspection Details" :
                 requestType === "tr" ? "🧪 Test Report Details" : "📍 Inspection Details"}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SearchableInput label="Project *" options={projects} value={selectedProject} onChange={setSelectedProject} placeholder="Select project..." loading={loadingProjects} disabled={loadingProjects} />
                <SearchableInput label="Location *" options={locations} value={selectedLocation} onChange={setSelectedLocation} placeholder={selectedProject ? "Select location..." : "Select project first"} disabled={!selectedProject || locations.length === 0} noOptionsMessage={selectedProject && locations.length === 0 ? "No locations found" : ""} />
                {requestType === "cpr" ? (
                  <>
                    <SearchableInput label="Pouring Element *" options={baseDescriptions} value={generalDesc} onChange={setGeneralDesc} placeholder="Select pouring element..." loading={loadingDescriptions} disabled={!selectedProject || loadingDescriptions} noOptionsMessage="No pouring elements configured" />
                    <label className="block text-sm font-medium text-gray-700" htmlFor="floorInput">Floor (optional)
                      <input id="floorInput" name="floorInput" list="cpr-floor-options" value={floorInput} onChange={(event) => setFloorInput(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-3" placeholder="Enter or select a floor" />
                      <datalist id="cpr-floor-options">{floors.map((floor) => <option key={floor} value={floor} />)}</datalist>
                    </label>
                  </>
                ) : (
                  <>
                    <SearchableInput label="Work Description *" options={baseDescriptions} value={generalDesc} onChange={setGeneralDesc} placeholder="Select work description..." loading={loadingDescriptions} disabled={!selectedProject || loadingDescriptions} noOptionsMessage="No work descriptions configured" />
                    <SearchableInput label="Floor (optional)" options={floors} value={selectedFloor} onChange={setSelectedFloor} placeholder="Select floor (optional)..." loading={loadingDescriptions} disabled={!selectedProject || loadingDescriptions} noOptionsMessage="No floors configured" />
                  </>
                )}
              </div>

              {descriptionNotice && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  ⚠️ {descriptionNotice}
                </div>
              )}

              {["ppir", "tr"].includes(requestType) && (
                <div className="engineer-form-panel mt-6 grid grid-cols-1 gap-6 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Received Date *
                    <input
                      type="date"
                      value={receivedDate}
                      onChange={(event) => setReceivedDate(event.target.value)}
                      className="mt-1 w-full rounded-lg border bg-white p-3 focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    Remarks <span className="font-normal text-gray-400">(optional)</span>
                    <textarea
                      value={remarks}
                      onChange={(event) => setRemarks(event.target.value)}
                      className="mt-1 w-full rounded-lg border bg-white p-3 focus:ring-2 focus:ring-blue-500"
                      placeholder="Add any supporting notes"
                      rows={2}
                      maxLength={500}
                    />
                  </label>
                </div>
              )}

              {/* حقل Survey Level (يظهر فقط للمساحين) */}
              {isSurvey && (
                <div className="mt-4">
                  <SearchableInput
                    label="Survey Level"
                    options={surveyLevels}
                    value={surveyInput}
                    onChange={setSurveyInput}
                    placeholder="Select or type level..."
                    creatable={true}
                  />
                </div>
              )}

              {requestType === "cpr" && !isCivilEngineer && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg"><p className="text-red-700 font-medium flex items-center gap-2"><span>⚠️</span>CPR requests are only available for Civil engineers.</p></div>
              )}
              {loadingData && (
                <div className="mt-4 flex items-center justify-center p-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div><span className="ml-2 text-sm text-gray-600">Loading data...</span></div>
              )}
              {selectedProject && <NextNumberPreview />}
            </div>

            {/* Tags Section */}
            <div className="engineer-form-panel bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2"><span className="w-1.5 h-8 bg-purple-600 rounded-full"></span>Attachments & References</h2>
              <p className="mb-6 text-sm text-slate-500">Keep general IR attachments separate from controlled drawing references used in the document.</p>
              <div className={`grid grid-cols-1 gap-6 ${requestType === "cpr" ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">IR Attachments</label>
                  <div className="flex gap-2">
                    <input type="text" value={irInput} onChange={(e) => setIrInput(e.target.value)} onKeyPress={(e) => handleKeyPress(e, "engineer")} className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Add IR attachment..." />
                    <button onClick={handleAddIrTag} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-gray-50 rounded-lg">
                    {irTags.length === 0 ? <span className="text-sm text-gray-400 italic">No IR attachments added</span> : irTags.map((tag, idx) => (
                      <span key={idx} className="bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full text-sm flex items-center gap-1 shadow-sm">📎 {tag}<button onClick={() => removeTag(idx, setIrTags)} className="text-blue-600 hover:text-blue-800 ml-1 font-bold">×</button></span>
                    ))}
                  </div>
                </div>
                {["ir", "cpr"].includes(requestType) && (
                  <label className="block text-sm font-medium text-gray-700">
                    Checklist <span className="font-normal text-gray-400">(optional)</span>
                    {loadingChecklists && <span className="mt-3 block"><LoadingIndicator label="Loading department checklists…" compact /></span>}
                    <select
                      value={selectedChecklistId}
                      onChange={(event) => setSelectedChecklistId(event.target.value)}
                      disabled={loadingChecklists || checklistOptions.length === 0}
                      className="mt-1 w-full rounded-lg border bg-white p-3 disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      <option value="">{loadingChecklists ? "Loading checklists..." : checklistOptions.length ? "No checklist selected" : checklistLoadError ? "Checklist department is not recognized" : "No checklist assigned to your department"}</option>
                      {checklistOptions.map((option) => <option key={option.id} value={option.id}>{option.number} — {option.name}</option>)}
                    </select>
                    <span className="mt-1 block text-xs font-normal text-gray-500">
                      {checklistLoadError || (checklistOptions.length
                        ? `${checklistOptions.length} checklist${checklistOptions.length === 1 ? "" : "s"} linked to your department. Choose by number and name.`
                        : "No checklist templates are assigned to your department.")}
                    </span>
                  </label>
                )}
                {requestType !== "cpr" && <ReferenceDrawingsInput value={refDrawings} onChange={setRefDrawings} />}
              </div>
              {requestType !== "cpr" && <div className="mt-6 border-t border-gray-100 pt-6">
                <label className="block max-w-2xl text-sm font-medium text-gray-700">
                  Reference Method <span className="font-normal text-gray-400">(Word: RefMethod)</span>
                  <input
                    type="text"
                    value={refMethod}
                    onChange={(event) => setRefMethod(event.target.value)}
                    className="mt-1 w-full rounded-lg border bg-white p-3 focus:ring-2 focus:ring-green-500"
                    placeholder="Method statement or reference method"
                    maxLength={500}
                  />
                </label>
              </div>}
            </div>

            {/* Final Description */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className={`text-xl font-bold flex items-center gap-2 ${requestType === "cpr" ? "text-green-600" : "text-blue-600"}`}>
                  <span className={`w-1.5 h-8 rounded-full ${requestType === "cpr" ? "bg-green-600" : "bg-blue-600"}`}></span>📝 Final Description
                </h2>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${requestType === "cpr" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>{requestType.toUpperCase()}</span>
                  {!isEditingFinalDesc ? (
                    <button onClick={() => { setDescriptionDraft(finalDescription); setIsEditingFinalDesc(true); }} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition">✏️ Edit</button>
                  ) : (
                    <div className="flex gap-1">
                      <button onClick={() => { setFinalDescription(descriptionDraft); setHasEditedFinalDesc(true); setIsEditingFinalDesc(false); }} disabled={!descriptionDraft.trim()} className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50">💾 Save</button>
                      <button onClick={() => setIsEditingFinalDesc(false)} className="px-4 py-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition">❌ Cancel</button>
                    </div>
                  )}
                </div>
              </div>
              {isEditingFinalDesc ? (
                <textarea className="w-full p-4 border-2 border-blue-300 rounded-xl" rows={4} value={descriptionDraft} onChange={(e) => setDescriptionDraft(e.target.value)} />
              ) : (
                <div className="w-full p-4 bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-xl">
                  {finalDescription || "Description will be generated automatically..."}
                </div>
              )}
            </div>

            <button onClick={handleSave} disabled={saving || loadingNumberPreview || !numberPreview?.irNo || !selectedProject || !selectedLocation || !generalDesc || !(isEditingFinalDesc ? descriptionDraft : finalDescription).trim()}
              className={`w-full py-5 rounded-xl text-white font-bold text-lg shadow-xl transition-all transform hover:-translate-y-1 ${
                saving || loadingNumberPreview || !numberPreview?.irNo || !selectedProject || !selectedLocation || !generalDesc || !(isEditingFinalDesc ? descriptionDraft : finalDescription).trim() ? "bg-gray-400 cursor-not-allowed" :
                requestType === "cpr" ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700" :
                requestType === "ppir" ? "bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700" :
                requestType === "tr" ? "bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700" :
                "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              }`}>
              {saving ? <LoadingIndicator label="Submitting request…" compact inverse /> : requestType === "cpr" ? "🏗️ Submit CPR Request" :
               requestType === "ppir" ? "🧱 Submit PPIR" :
               requestType === "tr" ? "🧪 Submit Test Report" : "📋 Submit Inspection Request"}
            </button>
          </div>
        )}

        {/* نافذة إنشاء مراجعة */}
        {showRevModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-5 text-white">
                <div className="flex justify-between items-center">
                  <div><h2 className="text-xl font-bold">Create New Revision</h2><p className="text-amber-100 text-sm mt-1">Create a revision with its department checklist</p></div>
                  <button onClick={() => setShowRevModal(false)} className="text-2xl hover:opacity-70">&times;</button>
                </div>
              </div>
              <div className="p-6 space-y-5">
                <SearchableInput label="Select Project *" options={projects} value={revProject} onChange={setRevProject} placeholder="Choose project..." />
                <label className="block font-medium text-gray-700">
                  Parent {requestType === "cpr" ? "CPR" : "IR"} <span className="text-xs font-normal text-amber-700">(temporarily disabled)</span>
                  <select value={revParentId} onChange={(event) => setRevParentId(event.target.value)} disabled={!REV_PARENT_SELECTION_ENABLED || !revProject || loadingRevisionParents} className="mt-2 w-full border-2 border-gray-200 rounded-xl p-3 disabled:bg-gray-100">
                    <option value="">{!REV_PARENT_SELECTION_ENABLED ? "Parent selection is temporarily disabled" : loadingRevisionParents ? "Loading parent requests..." : revProject ? "Choose the request being revised" : "Select a project first"}</option>
                    {revisionParents.filter((item) => item.project === revProject).map((item) => (
                      <option key={item.id || item.uniqueId} value={item.id || item.uniqueId}>{item.irNo} — {item.desc || item.location || "No description"}</option>
                    ))}
                  </select>
                </label>
                <div>
                  <label className="block font-medium text-gray-700 mb-2">IR Revision Number *</label>
                  <input type="text" value={revText} onChange={(e) => setRevText(e.target.value)} className="w-full border-2 border-gray-200 rounded-xl p-3" placeholder="e.g., REV-001" />
                </div>
                <label className="block font-medium text-gray-700">
                  Checklist <span className="text-sm font-normal text-gray-400">(optional)</span>
                  {loadingChecklists && <span className="mt-2 block"><LoadingIndicator label="Loading department checklists…" compact /></span>}
                  <select value={revChecklistId} onChange={(event) => setRevChecklistId(event.target.value)} disabled={loadingChecklists || checklistOptions.length === 0} className="mt-2 w-full border-2 border-gray-200 rounded-xl p-3 disabled:bg-gray-100">
                    <option value="">{loadingChecklists ? "Loading checklists..." : checklistOptions.length ? "No checklist selected" : checklistLoadError || "No checklist assigned to your department"}</option>
                    {checklistOptions.map((option) => <option key={option.id} value={option.id}>{option.number} — {option.name}</option>)}
                  </select>
                </label>
                <div><label className="block font-medium text-gray-700 mb-2">Notes (Optional)</label><textarea value={revNote} onChange={(e) => setRevNote(e.target.value)} className="w-full border-2 border-gray-200 rounded-xl p-3" rows={3} placeholder="Describe what changed..." /></div>
                <button onClick={handleSaveRev} disabled={revSaving || !revProject || (REV_PARENT_SELECTION_ENABLED && !revParentId) || !revText.trim()} className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-xl transition-all disabled:opacity-50">{revSaving ? <LoadingIndicator label="Creating revision…" compact inverse /> : "Submit Revision"}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* أنماط إضافية لضمان ظهور القائمة المنسدلة */}
      <style>{`
        .searchable-input-dropdown {
          z-index: 9999 !important;
          position: absolute !important;
          background: white;
          border: 1px solid #ccc;
          max-height: 200px;
          overflow-y: auto;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        td {
          position: relative;
        }
        .overflow-x-auto {
          overflow: visible !important;
        }
      `}</style>
    </main>
  );
}
