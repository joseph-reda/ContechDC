export function LoadingIndicator({ label = "Loading…", compact = false, inverse = false }) {
  return (
    <span className={`app-loading ${compact ? "app-loading--compact" : ""} ${inverse ? "app-loading--inverse" : ""}`} role="status" aria-live="polite">
      <span className="app-loading__spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function Notification({ value, onDismiss }) {
  const message = value?.message || value?.text || "";
  if (!message) return null;
  const type = value.type || (value.error ? "error" : "success");
  return (
    <div
      className={`app-notification app-notification--${type}`}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <div>
        <strong>{type === "error" ? "Action failed" : type === "warning" ? "Please note" : type === "info" ? "Information" : "Success"}</strong>
        <p>{message}</p>
      </div>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss notification">×</button>}
    </div>
  );
}
import { createContext, useCallback, useContext, useMemo, useState } from "react";

const FeedbackContext = createContext(null);


export function FeedbackProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const dismiss = useCallback((id) => setNotifications((current) => current.filter((item) => item.id !== id)), []);
  const notify = useCallback((message, type = "success", duration) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setNotifications((current) => [
      ...current.filter((item) => item.message !== message || item.type !== type).slice(-2),
      { id, message, type },
    ]);
    const timeout = duration ?? (type === "error" || type === "warning" ? 10000 : 7000);
    if (timeout > 0) window.setTimeout(() => dismiss(id), timeout);
    return id;
  }, [dismiss]);
  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);
  return <FeedbackContext.Provider value={value}>
    {children}
    <div className="app-notification-stack" aria-label="Notifications">
      {notifications.map((item) => <Notification key={item.id} value={item} onDismiss={() => dismiss(item.id)} />)}
    </div>
  </FeedbackContext.Provider>;
}

export function useNotifications() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useNotifications must be used within FeedbackProvider");
  return context;
}
