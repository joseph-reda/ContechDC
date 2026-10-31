import { useState, useEffect } from "react";
import { API_URL } from "../config";

export default function SidebarComponent({ 
    onFilterChange, 
    initialFilters = {},
    showQuickActions = true,
    showProjectStats = true,
    showDeptStats = true 
}) {
    const [projects, setProjects] = useState([]);
    const [stats, setStats] = useState({
        total: 0,
        ir: 0,
        cpr: 0,
        revisions: 0,
        ppir: 0,
        tr: 0,
        pending: 0,
        completed: 0
    });
    const [loading, setLoading] = useState(true);
    
    // الفلاتر المحلية
    const [filters, setFilters] = useState({
        project: initialFilters.project || "all",
        department: initialFilters.department || "all",
        type: initialFilters.type || "all",
        status: initialFilters.status || "all"
    });
    
    // قائمة الأقسام المحددة
    const departments = [
        { id: "all", name: "All Departments", color: "bg-gray-100", text: "text-gray-800" },
        { id: "Civil", name: "Civil", color: "bg-green-100", text: "text-green-800" },
        { id: "ARCH", name: "Architectural", color: "bg-blue-100", text: "text-blue-800" },
        { id: "ELECT", name: "Electrical", color: "bg-purple-100", text: "text-purple-800" },
        { id: "MEP", name: "Mechanical/MEP", color: "bg-amber-100", text: "text-amber-800" },
        { id: "SURV", name: "Survey", color: "bg-indigo-100", text: "text-indigo-800" }
    ];
    
    // أنواع الطلبات
    const requestTypes = [
        { id: "all", name: "All Types", icon: "📋" },
        { id: "ir", name: "IR Only", icon: "🔍" },
        { id: "cpr", name: "CPR Only", icon: "🏗️" },
        { id: "tr", name: "TR Only", icon: "🧪" },
        { id: "revision", name: "Revisions", icon: "🔄" }
    ];
    
    // حالات الطلبات
    const statusTypes = [
        { id: "all", name: "All Status", icon: "📊" },
        { id: "pending", name: "Pending", icon: "⏳" },
        { id: "completed", name: "Completed", icon: "✅" }
    ];
    
    // تحميل المشاريع والإحصاءات
    useEffect(() => {
        loadData();
    }, []);
    
    async function loadData() {
        try {
            // تحميل المشاريع
            const projectsRes = await fetch(`${API_URL}/projects`);
            const projectsData = await projectsRes.json();
            const projectList = Object.keys(projectsData.projects || {}).sort();
            setProjects(projectList);
            
            // تحميل الإحصاءات (يمكنك تعديل هذا بناءً على احتياجاتك)
            await loadStats();
            
        } catch (error) {
            console.error("Error loading sidebar data:", error);
        } finally {
            setLoading(false);
        }
    }
    
    async function loadStats() {
        try {
            // هذا مثال - يمكنك استبداله بالإحصاءات الفعلية
            // يمكنك جلب IRs و Revisions وحساب الإحصاءات
            const [irsRes, revsRes] = await Promise.all([
                fetch(`${API_URL}/irs`),
                fetch(`${API_URL}/revs`)
            ]);
            
            const irsData = await irsRes.json();
            const revsData = await revsRes.json();
            
            const allIRs = irsData.irs || [];
            const allRevs = revsData.revs || [];
            
            const total = allIRs.length + allRevs.length;
            const ir = allIRs.filter(item => !item.isRevision && String(item.requestType || "IR").toUpperCase() === "IR").length;
            const cpr = allIRs.filter(item => !item.isRevision && item.requestType === "CPR").length;
            const ppir = allIRs.filter(item => !item.isRevision && item.requestType === "PPIR").length;
            const tr = allIRs.filter(item => !item.isRevision && item.requestType === "TR").length;
            const revisions = allRevs.length;
            const pending = allIRs.filter(item => !item.isDone).length;
            const completed = allIRs.filter(item => item.isDone).length;
            
            setStats({ total, ir, cpr, ppir, tr, revisions, pending, completed });
            
        } catch (error) {
            console.warn("Could not load detailed stats, using defaults");
        }
    }
    
    // تحديث الفلاتر وإرسال التغييرات للوالد
    const updateFilter = (key, value) => {
        const newFilters = { ...filters, [key]: value };
        setFilters(newFilters);
        
        if (onFilterChange) {
            onFilterChange(newFilters);
        }
    };
    
    // إعادة تعيين جميع الفلاتر
    const resetFilters = () => {
        const reset = {
            project: "all",
            department: "all",
            type: "all",
            status: "all"
        };
        setFilters(reset);
        
        if (onFilterChange) {
            onFilterChange(reset);
        }
    };
    
    if (loading) {
        return (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded"></div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 h-fit sticky top-24">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white p-4 rounded-t-xl">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <span>🔍</span> Quick Filters
                </h3>
                <p className="text-blue-200 text-sm mt-1">Filter and navigate easily</p>
            </div>
            
            {/* Projects Section */}
            {showProjectStats && projects.length > 0 && (
                <div className="p-4 border-b">
                    <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <span className="text-blue-500">📌</span> Projects ({projects.length})
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        <button
                            onClick={() => updateFilter("project", "all")}
                            className={`w-full text-left p-2 rounded-lg transition ${filters.project === "all" ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50"}`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="text-sm">All Projects</span>
                                <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">
                                    {stats.total}
                                </span>
                            </div>
                        </button>
                        
                        {projects.map((project) => (
                            <button
                                key={project}
                                onClick={() => updateFilter("project", project)}
                                className={`w-full text-left p-2 rounded-lg transition ${filters.project === project ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50"}`}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="text-sm truncate">{project}</span>
                                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">
                                        ?
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Departments Section */}
            {showDeptStats && (
                <div className="p-4 border-b">
                    <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <span className="text-purple-500">🏢</span> Departments
                    </h4>
                    <div className="space-y-2">
                        {departments.map((dept) => (
                            <button
                                key={dept.id}
                                onClick={() => updateFilter("department", dept.id)}
                                className={`w-full text-left p-2 rounded-lg transition ${filters.department === dept.id ? `${dept.color} ${dept.text} font-medium` : "hover:bg-gray-50"}`}
                            >
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-3 h-3 rounded-full ${dept.color.replace("100", "500")}`}></span>
                                        <span className="text-sm">{dept.name}</span>
                                    </div>
                                    {dept.id !== "all" && (
                                        <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">
                                            ?
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Type Filter */}
            <div className="p-4 border-b">
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span className="text-green-500">📄</span> Request Type
                </h4>
                <div className="grid grid-cols-2 gap-2">
                    {requestTypes.map((type) => (
                        <button
                            key={type.id}
                            onClick={() => updateFilter("type", type.id)}
                            className={`p-2 rounded-lg transition text-sm flex items-center justify-center gap-1 ${filters.type === type.id ? "bg-blue-100 text-blue-700 border border-blue-300" : "bg-gray-100 hover:bg-gray-200"}`}
                        >
                            <span>{type.icon}</span>
                            <span>{type.name}</span>
                        </button>
                    ))}
                </div>
            </div>
            
            {/* Status Filter */}
            <div className="p-4 border-b">
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span className="text-amber-500">📊</span> Status
                </h4>
                <div className="grid grid-cols-2 gap-2">
                    {statusTypes.map((status) => (
                        <button
                            key={status.id}
                            onClick={() => updateFilter("status", status.id)}
                            className={`p-2 rounded-lg transition text-sm flex items-center justify-center gap-1 ${filters.status === status.id ? "bg-blue-100 text-blue-700 border border-blue-300" : "bg-gray-100 hover:bg-gray-200"}`}
                        >
                            <span>{status.icon}</span>
                            <span>{status.name}</span>
                        </button>
                    ))}
                </div>
            </div>
            
            {/* Quick Stats */}
            <div className="p-4 border-b">
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span className="text-indigo-500">📈</span> Quick Stats
                </h4>
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total</span>
                        <span className="font-bold text-gray-800">{stats.total}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">IR</span>
                        <span className="font-bold text-blue-600">{stats.ir}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">CPR</span>
                        <span className="font-bold text-green-600">{stats.cpr}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">TR</span>
                        <span className="font-bold text-teal-600">{stats.tr}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Revisions</span>
                        <span className="font-bold text-amber-600">{stats.revisions}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Pending</span>
                        <span className="font-bold text-yellow-600">{stats.pending}</span>
                    </div>
                </div>
            </div>
            
            {/* Quick Actions */}
            {showQuickActions && (
                <div className="p-4 bg-gray-50 rounded-b-xl">
                    <h4 className="font-semibold text-gray-700 mb-2">Quick Actions</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={resetFilters}
                            className="p-2 bg-white border rounded-lg text-sm hover:bg-gray-50 transition flex items-center justify-center gap-1"
                        >
                            <span>🔄</span> Reset All
                        </button>
                        <button
                            onClick={() => updateFilter("type", filters.type === "cpr" ? "all" : "cpr")}
                            className={`p-2 border rounded-lg text-sm transition flex items-center justify-center gap-1 ${filters.type === "cpr" ? "bg-green-100 text-green-700 border-green-300" : "bg-white hover:bg-gray-50"}`}
                        >
                            <span>🏗️</span> {filters.type === "cpr" ? "Hide CPR" : "CPR Only"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
