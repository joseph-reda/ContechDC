import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "../../config";

const requestJson = async (path, signal) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`Timed out loading ${path}`)), 8000);
  });
  try {
    const response = await Promise.race([
      fetch(`${API_URL}${path}`, { credentials: "include", signal }),
      timeout,
    ]);
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const countByRole = (users) => users.reduce((counts, user) => {
  counts[user.role] = (counts[user.role] || 0) + 1;
  return counts;
}, {});

export default function DashboardTab() {
  const [data, setData] = useState({ users: [], projects: {}, irs: [], revs: [], archive: [], shopdrawings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const controllerRef = useRef(null);

  const loadDashboardData = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);

    try {
      const requests = await Promise.allSettled([
        requestJson("/users", controller.signal),
        requestJson("/projects", controller.signal),
        requestJson("/irs", controller.signal),
        requestJson("/revs", controller.signal),
        requestJson("/archive/dc", controller.signal),
        requestJson("/shopdrawings", controller.signal),
      ]);
      if (controller.signal.aborted) return;
      const valueAt = (index, fallback) => requests[index].status === "fulfilled" ? requests[index].value : fallback;
      const failedRequests = requests.filter((request) => request.status === "rejected").length;
      const users = valueAt(0, { users: [] });
      const projects = valueAt(1, { projects: {} });
      const irs = valueAt(2, { irs: [] });
      const revs = valueAt(3, { revs: [] });
      const archive = valueAt(4, { archive: [] });
      const shopdrawings = valueAt(5, { shopdrawings: [] });
      setData({
        users: users.users || [],
        projects: projects.projects || {},
        irs: irs.irs || [],
        revs: revs.revs || [],
        archive: archive.archive || [],
        shopdrawings: shopdrawings.shopdrawings || [],
      });
      setLastUpdated(new Date());
      setError(failedRequests ? "Some dashboard data could not be refreshed. Showing the latest available sections." : "");
    } catch (requestError) {
      if (!controller.signal.aborted) setError("Dashboard data could not be refreshed. Check the local server connection and try again.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    const interval = window.setInterval(() => {
      if (!document.hidden) loadDashboardData();
    }, 120000);
    const handleVisibility = () => {
      if (!document.hidden) loadDashboardData();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      controllerRef.current?.abort();
    };
  }, [loadDashboardData]);

  const model = useMemo(() => {
    const activeIrs = data.irs.filter((item) => !item.isArchived);
    const pendingIrs = activeIrs.filter((item) => !item.isDone);
    const pendingRevisions = data.revs.filter((item) => !item.isArchived && !item.isDone);
    const activeShopDrawings = data.shopdrawings.filter((item) => !item.isArchived);
    const pendingShopDrawings = activeShopDrawings.filter((item) => !item.isDone);
    const roleCounts = countByRole(data.users);
    const activity = [
      ...activeIrs.map((item) => ({ ...item, type: "IR", number: item.irNo, date: item.sentAt || item.createdAt || item.updatedAt })),
      ...data.revs.map((item) => ({ ...item, type: "Revision", number: item.revNo, date: item.sentAt || item.createdAt || item.updatedAt })),
      ...activeShopDrawings.map((item) => ({ ...item, type: "Shop drawing", number: item.sdNo, date: item.sentAt || item.createdAt || item.updatedAt })),
    ].filter((item) => item.date).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

    return {
      activeIrs,
      pendingIrs,
      pendingRevisions,
      pendingShopDrawings,
      roleCounts,
      activity,
      metrics: [
        { label: "Open requests", value: activeIrs.length, detail: `${pendingIrs.length} awaiting action` },
        { label: "Open revisions", value: data.revs.filter((item) => !item.isArchived).length, detail: `${pendingRevisions.length} awaiting action` },
        { label: "Shop drawings", value: activeShopDrawings.length, detail: `${pendingShopDrawings.length} awaiting action` },
        { label: "Projects", value: Object.keys(data.projects).length, detail: `${data.users.length} managed accounts` },
      ],
    };
  }, [data]);

  const attentionItems = [
    { label: "Inspection requests", count: model.pendingIrs.length, detail: "Open the DC workspace to review pending requests.", to: "#dc" },
    { label: "Revisions", count: model.pendingRevisions.length, detail: "Review revisions that have not been completed.", to: "#dc" },
    { label: "Shop drawings", count: model.pendingShopDrawings.length, detail: "Check drawings that are still awaiting action.", to: "#dc" },
  ].filter((item) => item.count > 0);

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard__header">
        <div>
          <h2>Control overview</h2>
          <p>Start with work that needs a decision, then review the operational snapshot.</p>
        </div>
        <div className="admin-dashboard__header-actions">
          <p aria-live="polite" className="admin-dashboard__updated">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Loading current data…"}</p>
          <button type="button" onClick={loadDashboardData} disabled={loading} className="bg-blue-600 text-white">
            {loading ? "Refreshing…" : "Refresh overview"}
          </button>
        </div>
      </header>

      {error && (
        <section className="admin-dashboard__error" role="alert">
          <div><strong>Unable to refresh the dashboard.</strong><p>{error}</p></div>
          <button type="button" onClick={loadDashboardData} className="bg-red-600 text-white">Try again</button>
        </section>
      )}

      <section className="admin-dashboard__attention" aria-labelledby="attention-heading">
        <div className="admin-dashboard__section-heading">
          <div><h3 id="attention-heading">Needs attention</h3><p>Only work that is currently waiting for a decision.</p></div>
          <Link to="#dc">Open DC workspace</Link>
        </div>
        {attentionItems.length ? (
          <div className="admin-dashboard__attention-list">
            {attentionItems.map((item) => <Link className="admin-dashboard__attention-item" key={item.label} to={item.to}>
              <span className="admin-dashboard__attention-count">{item.count}</span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <span className="admin-dashboard__attention-action">Review</span>
            </Link>)}
          </div>
        ) : <div className="admin-dashboard__empty"><strong>No pending document work.</strong><span>All active requests, revisions, and shop drawings are complete.</span></div>}
      </section>

      <section className="admin-dashboard__metrics" aria-label="Operational snapshot">
        {model.metrics.map((metric) => <div className="admin-dashboard__metric" key={metric.label}>
          <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small>
        </div>)}
      </section>

      <div className="admin-dashboard__lower-grid">
        <section className="admin-dashboard__panel" aria-labelledby="activity-heading">
          <div className="admin-dashboard__section-heading"><div><h3 id="activity-heading">Recent document activity</h3><p>The six latest changes across requests, revisions, and drawings.</p></div></div>
          {model.activity.length ? <ul className="admin-dashboard__activity-list">
            {model.activity.map((item) => <li key={`${item.type}-${item.uniqueId || item.id || item.number}`}>
              <span className={`admin-dashboard__type admin-dashboard__type--${item.type.toLowerCase().replace(" ", "-")}`}>{item.type}</span>
              <span className="admin-dashboard__activity-copy"><strong>{item.number || "Draft document"}</strong><small>{item.project || "No project"} · {item.user || "Unknown user"}</small></span>
              <time dateTime={item.date}>{new Date(item.date).toLocaleString()}</time>
            </li>)}
          </ul> : <div className="admin-dashboard__empty"><strong>No activity has been recorded yet.</strong><span>New document requests will appear here after submission.</span></div>}
        </section>

        <aside className="admin-dashboard__panel" aria-labelledby="accounts-heading">
          <div className="admin-dashboard__section-heading"><div><h3 id="accounts-heading">Account coverage</h3><p>Managed access by role.</p></div><Link to="#users">Manage users</Link></div>
          <dl className="admin-dashboard__roles">
            <div><dt>Engineers</dt><dd>{model.roleCounts.engineer || 0}</dd></div>
            <div><dt>Document controllers</dt><dd>{model.roleCounts.dc || 0}</dd></div>
            <div><dt>Department heads</dt><dd>{model.roleCounts.head || 0}</dd></div>
            <div><dt>Administrators</dt><dd>{model.roleCounts.admin || 0}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
