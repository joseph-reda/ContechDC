import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import DashboardTab from "../components/admin/DashboardTab";
import UsersManagementTab from "../components/admin/UsersManagementTab";
import ProjectsManagementTab from "../components/admin/ProjectsManagementTab";
import DataManagementTab from "../components/admin/DataManagementTab";
import DCModeTab from "../components/admin/DCModeTab";
import { API_URL } from "../config";

const TABS = [
  { id: "dashboard", label: "Dashboard", description: "Priority work and operational status", component: DashboardTab },
  { id: "users", label: "Users", description: "Accounts, roles, and access", component: UsersManagementTab },
  { id: "projects", label: "Projects", description: "Project definitions and counters", component: ProjectsManagementTab },
  { id: "data", label: "Data Setup", description: "Locations, templates, and drawing data", component: DataManagementTab },
  { id: "dc", label: "DC Workspace", description: "Document-control operations", component: DCModeTab },
];

function Toast({ toast, onClose }) {
  if (!toast.show) return null;
  const colors = toast.type === "error"
    ? "border-red-200 bg-red-50 text-red-800"
    : toast.type === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className={`fixed right-5 top-5 z-50 flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3 shadow-xl ${colors}`}
    >
      <span>{toast.type === "error" ? "!" : "✓"}</span>
      <span className="text-sm font-semibold">{toast.message}</span>
      <button type="button" onClick={onClose} className="ml-auto opacity-60 hover:opacity-100" aria-label="Close notification">×</button>
    </div>
  );
}

export default function SuperAdminPanel({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedTab = location.hash.replace("#", "");
  const activeTab = TABS.some((tab) => tab.id === requestedTab) ? requestedTab : "dashboard";
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [systemInfo, setSystemInfo] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "" });

  const activeItem = useMemo(() => TABS.find((tab) => tab.id === activeTab) || TABS[0], [activeTab]);
  const ActiveComponent = activeItem.component;

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user") || "null");
    if (!storedUser) {
      navigate("/login");
      return;
    }
    if (storedUser.role !== "admin") {
      navigate(storedUser.role === "dc" ? "/dc/all" : "/engineer");
      return;
    }
    setUser(storedUser);

    fetch(`${API_URL}/admin/system-info`, { credentials: "include" })
      .then(async (response) => {
        if (response.status === 401) {
          localStorage.removeItem("user");
          onLogout?.();
          navigate("/login");
          return null;
        }
        if (!response.ok) throw new Error("Failed to load system information");
        return response.json();
      })
      .then((data) => data && setSystemInfo(data))
      .catch((error) => setToast({ show: true, message: error.message, type: "error" }))
      .finally(() => setLoading(false));
  }, [navigate]);

  const selectTab = (tabId) => navigate({ pathname: "/admin", hash: `#${tabId}` });

  async function handleLogout() {
    if (!window.confirm("Are you sure you want to log out?")) return;
    if (onLogout) onLogout();
    else {
      await fetch(`${API_URL}/logout`, { method: "POST", credentials: "include" }).catch(() => {});
      localStorage.removeItem("user");
    }
    navigate("/login");
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
          <p className="text-sm font-medium text-slate-300">Preparing the admin workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen bg-slate-100 text-slate-900">
      <Toast toast={toast} onClose={() => setToast({ show: false, message: "", type: "" })} />

      <header className="admin-topbar sticky top-0 z-30 border-b border-slate-800 bg-slate-950 text-white shadow-lg">
        <div className="admin-topbar__inner mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3 sm:px-6">
          <div className="admin-brandmark grid h-10 w-10 place-items-center rounded-xl bg-cyan-400 font-black text-slate-950">C</div>
          <div className="admin-topbar__title min-w-0">
            <p className="truncate font-bold tracking-tight">Contech Control Center</p>
            <p className="text-xs text-slate-400">Administration workspace</p>
          </div>
          <div className="ml-auto hidden items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            SQLite connected
          </div>
          <div className="hidden text-right md:block">
            <p className="text-sm font-semibold">{user?.username}</p>
            <p className="text-xs text-slate-400">Administrator</p>
          </div>
          <button type="button" onClick={() => navigate("/dc/all")} className="admin-dc-view rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-800" aria-label="Open DC view">
            <span className="admin-dc-view__compact" aria-hidden="true">DC</span>
            <span className="admin-dc-view__full" aria-hidden="true">DC view</span>
          </button>
          <button type="button" onClick={handleLogout} className="admin-logout rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200">
            Log out
          </button>
        </div>
      </header>

      <div className="admin-layout mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="hidden self-start lg:sticky lg:top-24 lg:block">
          <nav className="admin-nav rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Admin sections">
            <p className="px-3 pb-2 pt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
            <div className="space-y-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                    activeTab === tab.id ? "bg-slate-950 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{tab.label}</span>
                    <span className="block truncate text-xs text-slate-400">{tab.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </nav>

          <div className="admin-system-status mt-4 rounded-2xl p-4">
            <p className="text-sm font-semibold">System status</p>
            <p className="mt-2 text-xl font-bold">v{systemInfo?.version || "2.0.0"}</p>
            <p className="mt-1 text-xs">{systemInfo?.environment || "development"} environment</p>
          </div>
        </aside>

        <main className="admin-main min-w-0">
          <nav className="admin-mobile-nav mb-4 flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm lg:hidden" aria-label="Admin sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === tab.id ? "bg-slate-950 text-white" : "text-slate-600"}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="admin-page-heading mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{activeItem.label}</h1>
              <p className="mt-1 text-sm text-slate-500">{activeItem.description}</p>
            </div>
            <p className="text-xs text-slate-400">Secure admin session · {systemInfo?.database || "SQLite"}</p>
          </div>

          <section className="admin-content rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <ActiveComponent />
          </section>
        </main>
      </div>
    </div>
  );
}
