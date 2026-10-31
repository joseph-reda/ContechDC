import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";

export default function LoginPage({ setUser }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (error) setError("");
  };

  const goToDashboard = (user) => {
    if (user.role === "admin") navigate("/admin");
    else if (user.role === "dc") navigate("/dc/all");
    else if (user.role === "head") navigate("/head");
    else navigate("/engineer");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const username = form.username.trim();

    if (!username || !form.password) {
      setError("Enter your username and password to continue.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password: form.password }),
      });
      const raw = await response.text();
      let data = {};

      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error("The local server returned an invalid response. Please try again.");
      }

      if (!response.ok) {
        throw new Error(data.error || (raw ? "Unable to sign in." : "The local API did not return a response. Please check that the server is running and try again."));
      }

      if (!data.user) throw new Error("The local server did not return your account details.");

      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      goToDashboard(data.user);
    } catch (requestError) {
      setError(requestError.message || "Unable to reach the local API. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-intro" aria-label="Contech document control overview">
        <div className="login-brand" aria-label="Contech">
          <span className="login-brandmark">C</span>
          <span>CONTECH</span>
        </div>

        <div className="login-intro-copy">
          <p className="login-eyebrow">DOCUMENT CONTROL SYSTEM</p>
          <h1>Clear control for every site document.</h1>
          <p className="login-lede">
            Keep submissions, reviews, revisions, and project records visible to the people responsible for moving work forward.
          </p>
        </div>

        <ul className="login-feature-list" aria-label="Dashboard capabilities">
          <li><span aria-hidden="true">01</span> Trace every document decision</li>
          <li><span aria-hidden="true">02</span> Keep revisions linked to their source</li>
          <li><span aria-hidden="true">03</span> Work from one controlled record</li>
        </ul>
      </section>

      <section className="login-card-wrap" aria-label="Sign in">
        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <div className="login-card-heading">
            <p className="login-eyebrow">SECURE ACCESS</p>
            <h2>Welcome back</h2>
            <p>Sign in to your Contech DC Dashboard workspace.</p>
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}

          <label className="login-field">
            <span>Username</span>
            <input
              autoComplete="username"
              autoFocus
              onChange={(event) => updateField("username", event.target.value)}
              placeholder="Enter your username"
              value={form.username}
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => updateField("password", event.target.value)}
              placeholder="Enter your password"
              type="password"
              value={form.password}
            />
          </label>

          <button className="login-submit" disabled={loading} type="submit">
            {loading ? "Signing in…" : "Sign in"}
            {!loading && <span aria-hidden="true">→</span>}
          </button>

          <aside className="login-account-note">
            <span aria-hidden="true">✦</span>
            <p><strong>Need an account?</strong> Ask a system administrator to create one from Admin Mode.</p>
          </aside>
        </form>
      </section>
    </main>
  );
}
