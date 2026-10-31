// src/components/admin/UsersManagementTab.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API_URL } from "../../config";

// ==============================
// Constants
// ==============================
const DEPARTMENTS = [
  { value: "ARCH", label: "Architectural", color: "bg-blue-100 text-blue-800", icon: "🏛️" },
  { value: "Civil", label: "Civil", color: "bg-green-100 text-green-800", icon: "🏗️" },
  { value: "ELECT", label: "Electrical", color: "bg-purple-100 text-purple-800", icon: "⚡" },
  { value: "MECH", label: "Mechanical", color: "bg-amber-100 text-amber-800", icon: "🔧" },
  { value: "SURV", label: "Survey", color: "bg-indigo-100 text-indigo-800", icon: "📐" },
];

const ROLES = [
  { value: "engineer", label: "Engineer", icon: "👷", color: "bg-blue-50 text-blue-700" },
  { value: "head", label: "Head of Department", icon: "🧭", color: "bg-purple-50 text-purple-700" },
  { value: "dc", label: "Document Controller", icon: "📋", color: "bg-amber-50 text-amber-700" },
  { value: "admin", label: "Administrator", icon: "🛡️", color: "bg-red-50 text-red-700" },
];

const REQUEST_TYPE_OPTIONS = [
  { value: "ir", label: "IR (Inspection Request)", icon: "📝" },
  { value: "cpr", label: "CPR (Concrete Pouring Request)", icon: "🏗️" },
  { value: "sd", label: "Shop Drawing", icon: "📐" },
];

// ==============================
// Helper functions
// ==============================
const getRoleInfo = (role) => ROLES.find((r) => r.value === role) || { label: role, icon: "👤", color: "bg-gray-50 text-gray-700" };
const getDeptInfo = (dept) => DEPARTMENTS.find((d) => d.value === dept) || { label: dept, color: "bg-gray-100 text-gray-800", icon: "👤" };

// ==============================
// Main Component
// ==============================
const UsersManagementTab = () => {
  // State
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({
    username: "",
    phone: "",
    password: "",
    confirmPassword: "",
    department: "Civil",
    role: "",
    allowedRequestTypes: ["ir"],
  });

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  // Show toast notification
  const showToast = useCallback((message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
  }, []);

  // Fetch users from API
  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/users`);
      if (!response.ok) throw new Error("Failed to load users");
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error("Error loading users:", error);
      showToast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  };

  // Reset form to initial state
  const resetForm = useCallback(() => {
    setUserForm({
      username: "",
      phone: "",
      password: "",
      confirmPassword: "",
      department: "Civil",
      role: "",
      allowedRequestTypes: ["ir"],
    });
    setEditingUser(null);
  }, []);

  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setUserForm((prev) => {
      if (name !== "role") return { ...prev, [name]: value };
      return {
        ...prev,
        role: value,
        department: value === "engineer" ? (prev.department || "Civil") : "",
        allowedRequestTypes: value === "engineer"
          ? (prev.allowedRequestTypes.length ? prev.allowedRequestTypes : ["ir"])
          : [],
      };
    });
  };

  // Handle allowed request type checkbox
  const handleAllowedTypeChange = (type) => {
    setUserForm((prev) => {
      const newTypes = prev.allowedRequestTypes.includes(type)
        ? prev.allowedRequestTypes.filter((t) => t !== type)
        : [...prev.allowedRequestTypes, type];
      return { ...prev, allowedRequestTypes: newTypes };
    });
  };

  // Validate form before submit
  const validateForm = () => {
    if (!userForm.role) {
      showToast("Select the account role first", "error");
      return false;
    }
    if (!userForm.username.trim()) {
      showToast("Username is required", "error");
      return false;
    }
    if (!editingUser && !userForm.password) {
      showToast("Password is required for new users", "error");
      return false;
    }
    if (userForm.password && userForm.password.length < 6) {
      showToast("Password must be at least 6 characters", "error");
      return false;
    }
    if (userForm.password && userForm.password !== userForm.confirmPassword) {
      showToast("Passwords do not match", "error");
      return false;
    }
    if (userForm.role === "engineer" && !userForm.department) {
      showToast("Department is required for engineers", "error");
      return false;
    }
    if (userForm.role === "engineer" && userForm.allowedRequestTypes.length === 0) {
      showToast("At least one request type must be selected", "error");
      return false;
    }
    return true;
  };

  // Save user (create or update)
  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const userData = {
        username: userForm.username.toLowerCase().trim(),
        phone: userForm.phone.trim(),
        role: userForm.role,
        department: userForm.role === "engineer" ? userForm.department : undefined,
        allowedRequestTypes: userForm.role === "engineer" ? userForm.allowedRequestTypes : [],
      };
      if (userForm.password.trim()) {
        userData.password = userForm.password;
      }

      const response = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Operation failed");
      }

      showToast(editingUser ? "User updated successfully" : "User created successfully");
      await loadUsers();
      resetForm();
    } catch (error) {
      console.error("User operation error:", error);
      showToast(`Error: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Start editing a user
  const startEditUser = (user) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      phone: user.phone || "",
      password: "",
      confirmPassword: "",
      department: user.role === "engineer" ? (user.department === "ST" ? "Civil" : (user.department || "Civil")) : "",
      role: user.role || "engineer",
      allowedRequestTypes: user.role === "engineer" ? (user.allowedRequestTypes || ["ir"]).filter((type) => type !== "ppir") : [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast(`Editing user ${user.username}`, "info");
  };

  // Delete user
  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Are you sure you want to delete user "${user.username}"?\n\nThis action cannot be undone.`)) {
      return;
    }
    try {
      const response = await fetch(`${API_URL}/users/${user.username}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Delete failed");
      }
      showToast(`User "${user.username}" deleted successfully`);
      await loadUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      showToast(error.message, "error");
    }
  };

  // Reset user password
  const handleResetPassword = async (user) => {
    const newPassword = prompt(`Enter new password for user "${user.username}":`);
    if (!newPassword || newPassword.length < 6) {
      showToast("Password must be at least 6 characters", "error");
      return;
    }
    try {
      const response = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, password: newPassword }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Operation failed");
      }
      showToast(`Password reset for user ${user.username}`);
    } catch (error) {
      console.error("Error resetting password:", error);
      showToast(error.message, "error");
    }
  };

  // Filter users based on search and filters
  const filteredUsers = useMemo(() => {
    let filtered = [...users];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.username?.toLowerCase().includes(term) ||
          u.phone?.toLowerCase().includes(term) ||
          u.department?.toLowerCase().includes(term) ||
          u.role?.toLowerCase().includes(term) ||
          u.allowedRequestTypes?.some((type) => type.includes(term))
      );
    }
    if (roleFilter !== "all") filtered = filtered.filter((u) => u.role === roleFilter);
    if (deptFilter !== "all") filtered = filtered.filter((u) => u.department === deptFilter);
    return filtered;
  }, [users, searchTerm, roleFilter, deptFilter]);

  // Statistics
  const roleStats = useMemo(() => {
    return ROLES.map((role) => ({
      ...role,
      count: users.filter((u) => u.role === role.value).length,
    }));
  }, [users]);

  // Render allowed request types as badges
  const renderAllowedTypes = (types) => {
    const visibleTypes = (types || []).filter((type) => type !== "ppir");
    if (visibleTypes.length === 0) return <span className="text-gray-400">None</span>;
    return visibleTypes.map((type) => {
      const option = REQUEST_TYPE_OPTIONS.find((opt) => opt.value === type);
      return option ? (
        <span
          key={type}
          className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs ml-1"
          title={option.label}
        >
          {option.icon} {option.label.split(' ')[0]}
        </span>
      ) : (
        <span key={type} className="px-2 py-1 bg-gray-100 rounded text-xs ml-1">
          {type}
        </span>
      );
    });
  };

  if (loading && users.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
        <p className="text-gray-600 font-medium">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast.show && (
        <div
          className={`rounded-lg p-4 mb-4 ${
            toast.type === "error" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "error" ? "❌" : "✅"} {toast.message}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">👥 User Management</h2>
          <p className="text-gray-600">Manage user accounts, roles, and permissions</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadUsers}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition"
          >
            Refresh
          </button>
          <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-lg font-medium">
            {users.length} users
          </div>
        </div>
      </div>

      <div className="admin-guidance" role="note">
        <span className="admin-guidance__icon" aria-hidden="true">✦</span>
        <div>
          <strong>Admin-managed accounts</strong>
          <p>New accounts are created only here. The Welcome page is reserved for secure sign-in.</p>
        </div>
      </div>

      {/* Main grid: Form (left) + List (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Form Section */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 sticky top-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              {editingUser ? "✏️ Edit User" : "➕ Add New User"}
            </h3>
            <form onSubmit={handleSaveUser} className="space-y-4">
              {/* Role comes first because it controls the rest of the form. */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <label className="block text-sm font-bold text-blue-950 mb-1">
                  1. Account Role *
                </label>
                <select
                  name="role"
                  value={userForm.role}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 border border-blue-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select role first</option>
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.icon} {role.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-blue-700">
                  Department and request permissions apply to engineers only.
                </p>
              </div>

              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  2. Username *
                </label>
                <input
                  type="text"
                  name="username"
                  value={userForm.username}
                  onChange={handleInputChange}
                  disabled={!!editingUser}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="Enter username"
                  required
                />
              </div>

              {/* Optional phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mobile Number <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={userForm.phone}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. +20 10 1234 5678"
                  maxLength={30}
                  autoComplete="tel"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {!editingUser && "*"}
                </label>
                <input
                  type="password"
                  name="password"
                  value={userForm.password}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={editingUser ? "Leave blank to keep current" : "Minimum 6 characters"}
                  minLength={userForm.password ? 6 : undefined}
                />
                <p className="mt-1 text-xs text-gray-500">Minimum 6 characters.</p>
              </div>

              {/* Confirm Password */}
              {userForm.password && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={userForm.confirmPassword}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Confirm password"
                    minLength={6}
                  />
                </div>
              )}

              {userForm.role === "engineer" && (
                <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Department *
                    </label>
                    <select
                      name="department"
                      value={userForm.department}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept.value} value={dept.value}>
                          {dept.icon} {dept.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Allowed Request Types *
                    </label>
                    <div className="space-y-2">
                      {REQUEST_TYPE_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 border">
                          <input
                            type="checkbox"
                            checked={userForm.allowedRequestTypes.includes(option.value)}
                            onChange={() => handleAllowedTypeChange(option.value)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">{option.icon} {option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="space-y-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition disabled:opacity-50"
                >
                  {loading ? "Processing..." : editingUser ? "Update User" : "Create User"}
                </button>
                {editingUser && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="w-full py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Users List Section */}
        <div className="lg:col-span-3">
          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="🔍 Search by username, mobile, department, role, or permissions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Roles</option>
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Departments</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept.value} value={dept.value}>
                      {dept.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {filteredUsers.length !== users.length && (
              <div className="mt-2 text-sm text-gray-600">
                Showing {filteredUsers.length} of {users.length} users
              </div>
            )}
          </div>

          {/* Users Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-4 text-left font-semibold text-gray-700">Username</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Mobile</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Department</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Role</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Allowed Types</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-gray-500">
                        <div className="text-4xl mb-2">👤</div>
                        No users found
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const roleInfo = getRoleInfo(user.role);
                      const deptInfo = getDeptInfo(user.department);
                      return (
                        <tr key={user.username} className="border-b hover:bg-gray-50 transition">
                          <td className="p-4 font-bold text-gray-800">{user.username}</td>
                          <td className="p-4 text-gray-700" dir="ltr">{user.phone || "—"}</td>
                          <td className="p-4">
                            {user.role === "engineer" ? (
                              <span className={`px-3 py-1 rounded-full text-sm ${deptInfo.color}`}>
                                {deptInfo.icon} {deptInfo.label}
                              </span>
                            ) : <span className="text-gray-400">Not applicable</span>}
                          </td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-full text-sm ${roleInfo.color}`}>
                              {roleInfo.icon} {roleInfo.label}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1">
                              {user.role === "engineer"
                                ? renderAllowedTypes(user.allowedRequestTypes)
                                : <span className="text-gray-400">Not applicable</span>}
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => startEditUser(user)}
                                className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm transition"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleResetPassword(user)}
                                className="px-3 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-sm transition"
                              >
                                Reset Password
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user)}
                                className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm transition"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Role Statistics */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {roleStats.map((role) => (
              <div key={role.value} className="bg-white border rounded-xl p-4 text-center">
                <div className="text-2xl mb-2">{role.icon}</div>
                <div className="text-2xl font-bold text-gray-800">{role.count}</div>
                <div className="text-sm text-gray-600">{role.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UsersManagementTab;
