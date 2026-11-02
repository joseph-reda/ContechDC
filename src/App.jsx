import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { API_URL } from "./config.js";

// Components
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { FeedbackProvider } from "./components/Feedback.jsx";

// Pages
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const EngineerPage = lazy(() => import("./pages/EngineerPage.jsx"));
const EngineerReportsPage = lazy(() => import("./pages/EngineerReportsPage.jsx"));
const EngineerRecords = lazy(() => import("./pages/EngineerRecords.jsx"));
const DcIrPage = lazy(() => import("./pages/DcIrPage.jsx"));
const DcAllPage = lazy(() => import("./pages/DcAllPage.jsx"));
const DcArchive = lazy(() => import("./pages/DcArchive.jsx"));
const DcReportsPage = lazy(() => import("./pages/DcReportsPage.jsx"));
const DCShopDrawingsPage = lazy(() => import("./pages/DCShopDrawingsPage.jsx"));
const DcCprPage = lazy(() => import("./pages/DcCprPage.jsx"));
const DcTrPage = lazy(() => import("./pages/DcTrPage.jsx"));

// NEW: Super Admin Panel (Replaces old admin pages)
const SuperAdminPanel = lazy(() => import("./pages/SuperAdminPanel.jsx"));

// OLD ADMIN PAGES (Kept for reference/backup - remove from imports if not needed)
// import AdminDashboard from "./pages/AdminDashboard.jsx";
// import ProjectsAdmin from "./pages/ProjectsAdmin.jsx";
// import UsersAdminPage from "./pages/UsersAdminPage.jsx";
// import AdminSettings from "./pages/AdminSettings.jsx";

// Components
import Navbar from "./components/Navbar.jsx";

function AppLoading() {
    return (
        <div className="app-loading-screen">
            <div className="app-loading-card" role="status" aria-live="polite">
                <span className="app-loading-mark" aria-hidden="true">C</span>
                <div>
                    <p>Preparing your workspace</p>
                    <span>Checking your secure local session…</span>
                </div>
            </div>
        </div>
    );
}

export default function App() {
    const location = useLocation();
    const [user, setUser] = useState(undefined);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!localStorage.getItem("system_start_time")) {
            localStorage.setItem("system_start_time", Date.now().toString());
        }
        const saved = JSON.parse(localStorage.getItem("user") || "null");
        if (!saved) {
            setUser(null);
            setLoading(false);
            return;
        }

        fetch(`${API_URL}/session`, { credentials: "include" })
            .then(async (response) => {
                if (!response.ok) throw new Error("Session expired");
                const data = await response.json();
                localStorage.setItem("user", JSON.stringify(data.user));
                setUser(data.user);
            })
            .catch(() => {
                localStorage.removeItem("user");
                setUser(null);
            })
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <AppLoading />;
    }

    // Handle logout
    const handleLogout = () => {
        fetch(`${API_URL}/logout`, { method: "POST", credentials: "include" }).catch(() => {});
        localStorage.removeItem("user");
        setUser(null);
    };

    // Handle login
    const handleLogin = (userData) => {
        localStorage.setItem("user", JSON.stringify(userData));
        setUser(userData);
    };

    return (
        <FeedbackProvider>
            {/* Navbar - Show only when user is logged in and not on login page */}
            {user && !["/admin", "/login"].includes(location.pathname) && <Navbar user={user} onLogout={handleLogout} />}

            <Suspense fallback={<AppLoading />}>
            <Routes>
                {/* ============================
                    LOGIN ROUTE - PUBLIC
                ============================= */}
                <Route
                    path="/login"
                    element={<LoginPage setUser={handleLogin} />}
                />

                {/* ============================
                    SUPER ADMIN PANEL - NEW SYSTEM (Replaces all old admin routes)
                ============================= */}
                <Route
                    path="/admin"
                    element={
                        <ProtectedRoute allowedRoles={["admin"]}>
                            <SuperAdminPanel onLogout={handleLogout} />
                        </ProtectedRoute>
                    }
                />

                {/* ============================
                    OLD ADMIN ROUTES - REDIRECTED TO SUPER ADMIN PANEL
                    (Comment out or remove these if you want to redirect all admin traffic)
                ============================= */}
                {/* 
                <Route
                    path="/admin-old"  // Changed from /admin to /admin-old for backup
                    element={
                        <ProtectedRoute allowedRoles={["admin"]}>
                            <AdminDashboard />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/admin-old/users"  // Changed from /admin/users
                    element={
                        <ProtectedRoute allowedRoles={["admin"]}>
                            <UsersAdminPage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/admin-old/projects"  // Changed from /admin/projects
                    element={
                        <ProtectedRoute allowedRoles={["admin"]}>
                            <ProjectsAdmin />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/admin-old/settings"  // Changed from /admin/settings
                    element={
                        <ProtectedRoute allowedRoles={["admin"]}>
                            <AdminSettings />
                        </ProtectedRoute>
                    }
                />
                */}

                {/* ============================
                    ENGINEER ROUTES
                ============================= */}
                <Route
                    path="/engineer"
                    element={
                        <ProtectedRoute allowedRoles={["engineer", "head"]}>
                            <EngineerPage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/engineer/tr"
                    element={
                        <ProtectedRoute allowedRoles={["engineer", "head"]}>
                            <Navigate to="/engineer-records" replace />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/engineer-records"
                    element={
                        <ProtectedRoute allowedRoles={["engineer", "head"]}>
                            <EngineerRecords />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/engineer/reports"
                    element={
                        <ProtectedRoute allowedRoles={["engineer", "head"]}>
                            <EngineerReportsPage />
                        </ProtectedRoute>
                    }
                />

                {/* ============================
                    DC ROUTES
                ============================= */}
                <Route
                    path="/dc"
                    element={
                        <ProtectedRoute allowedRoles={["dc", "admin"]}>
                            <Navigate to="/dc/all" replace />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/dc/shopdrawings" // ✅ مسار جديد لصفحة Shop Drawings الخاصة بالـ DC
                    element={
                        <ProtectedRoute allowedRoles={["dc", "admin"]}>
                            <DCShopDrawingsPage />
                        </ProtectedRoute>
                    }
                />

                <Route path="/dc/ir" element={<ProtectedRoute allowedRoles={["dc", "admin"]}><DcIrPage /></ProtectedRoute>} />
                <Route path="/dc/all" element={<ProtectedRoute allowedRoles={["dc", "admin"]}><DcAllPage /></ProtectedRoute>} />

                <Route
                    path="/dc/cpr"
                    element={
                        <ProtectedRoute allowedRoles={["dc", "admin"]}>
                            <DcCprPage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/dc/tr"
                    element={
                        <ProtectedRoute allowedRoles={["dc", "admin"]}>
                            <DcTrPage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/dc/reports"
                    element={
                        <ProtectedRoute allowedRoles={["dc", "admin"]}>
                            <DcReportsPage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/dc-archive"
                    element={
                        <ProtectedRoute allowedRoles={["dc", "admin"]}>
                            <DcArchive />
                        </ProtectedRoute>
                    }
                />

                {/* ============================
                    DEFAULT ROUTE - Redirect based on role
                    All admins now go to SuperAdminPanel
                ============================= */}
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            {user ? (
                                user.role === "admin" ? (
                                    <SuperAdminPanel /> // New admin panel
                                ) :
                                user.role === "dc" ? <Navigate to="/dc/all" replace /> :
                                user.role === "engineer" || user.role === "head" ? <EngineerPage /> :
                                <LoginPage setUser={handleLogin} />
                            ) : (
                                <LoginPage setUser={handleLogin} />
                            )}
                        </ProtectedRoute>
                    }
                />

                {/* ============================
                    404 Route - Redirect to appropriate dashboard
                    All admins now go to SuperAdminPanel
                ============================= */}
                <Route
                    path="*"
                    element={
                        <ProtectedRoute>
                            {user ? (
                                user.role === "admin" ? (
                                    <SuperAdminPanel /> // New admin panel for all admin 404s
                                ) :
                                user.role === "dc" ? <Navigate to="/dc/all" replace /> :
                                user.role === "engineer" || user.role === "head" ? <EngineerPage /> :
                                <LoginPage setUser={handleLogin} />
                            ) : (
                                <LoginPage setUser={handleLogin} />
                            )}
                        </ProtectedRoute>
                    }
                />
            </Routes>
            </Suspense>
        </FeedbackProvider>
    );
}
