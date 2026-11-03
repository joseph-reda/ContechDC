import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import logo from "../images/Contec.jpg";

function isCurrent(location, to) {
  const [path, query = ""] = to.split("?");
  if (location.pathname !== path) return false;
  return !query || location.search.slice(1).toLowerCase() === query.toLowerCase();
}

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggleRef = useRef(null);
  const menuDrawerRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setUser(JSON.parse(localStorage.getItem("user") || "null")), [location]);
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  const links = useMemo(() => {
    if (!user?.role) return [];
    const allowed = Array.isArray(user.allowedRequestTypes)
      ? user.allowedRequestTypes.map((type) => String(type).toLowerCase())
      : ["ir"];
    const isCivil = /civil|structure/i.test(user.department || "");

    if (user.role === "admin") return [{ to: "/dc/shopdrawings", label: "Shop Drawings", short: "SD" }];
    if (user.role === "dc") return [
      { to: "/dc/all", label: "All requests", short: "ALL" },
      { to: "/dc/ir", label: "IR only", short: "IR" },
      { to: "/dc/cpr", label: "CPR only", short: "CPR" },
      { to: "/dc/tr", label: "TR only", short: "TR" },
      { to: "/dc/reports", label: "Reports", short: "R" },
      { to: "/dc-archive", label: "Archive", short: "A" },
      { to: "/dc/shopdrawings", label: "SD", short: "SD" },
    ];

    const engineerLinks = [{ to: "/engineer?type=IR", label: "Inspection Request", short: "IR" }];
    if (isCivil && allowed.includes("cpr")) engineerLinks.push({ to: "/engineer?type=CPR", label: "Concrete Pouring", short: "CPR" });
    engineerLinks.push({ to: "/engineer-records", label: "My Records", short: "MR" });
    engineerLinks.push({ to: "/engineer/reports", label: "Reports & Charts", short: "RC" });
    return engineerLinks;
  }, [user]);

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const focusFrame = window.requestAnimationFrame(() => menuDrawerRef.current?.querySelector("a, button")?.focus());
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key !== "Tab" || !menuDrawerRef.current) return;
      const focusable = [...menuDrawerRef.current.querySelectorAll("a[href], button:not([disabled])")];
      const currentIndex = focusable.indexOf(document.activeElement);

      if (event.shiftKey && currentIndex <= 0) {
        event.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0]?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      menuToggleRef.current?.focus();
    };
  }, [menuOpen]);

  if (!user?.role) return null;

  const home = user.role === "admin" ? "/admin" : user.role === "dc" ? "/dc/all" : "/engineer";
  const logout = () => {
    fetch("/api/logout", { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem("user");
    localStorage.removeItem("last_activity");
    navigate("/login");
  };

  const navLink = (link, mobile = false) => (
    <Link key={link.to} to={link.to} onClick={mobile ? closeMenu : undefined} className={`${mobile ? "app-nav-mobile-link" : "app-nav-link"} ${isCurrent(location, link.to) ? "is-active" : ""}`}>
      <span className="app-nav-link-mark" aria-hidden="true">{link.short}</span>
      <span>{link.label}</span>
    </Link>
  );

  return (
    <>
      <nav className="app-navigation" aria-label="Main navigation">
        <div className="app-nav-container">
          <div className="app-nav-brand-group">
            <button ref={menuToggleRef} type="button" className="app-nav-toggle" aria-label="Toggle navigation" aria-controls="mobile-navigation-drawer" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
              <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
            </button>
            <Link className="app-nav-brand" to={home} aria-label="Contech dashboard home">
              <img src={logo} alt="" />
              <span><strong>CONTECH</strong><small>Document control</small></span>
            </Link>
          </div>

          <div className="app-nav-links">{links.map((link) => navLink(link))}</div>

          <div className="app-nav-account">
            <span className="app-nav-avatar" aria-hidden="true">{String(user.username || "U").slice(0, 1).toUpperCase()}</span>
            <span className="app-nav-identity"><strong>{user.username}</strong><small>{user.department || user.role}</small></span>
            <button className="app-nav-logout" type="button" onClick={logout}>Log out</button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div className="app-nav-drawer-backdrop" onClick={closeMenu}>
          <aside id="mobile-navigation-drawer" ref={menuDrawerRef} className="app-nav-drawer" onClick={(event) => event.stopPropagation()} aria-label="Mobile navigation">
            <div className="app-nav-drawer-user">
              <span className="app-nav-avatar" aria-hidden="true">{String(user.username || "U").slice(0, 1).toUpperCase()}</span>
              <div><strong>{user.username}</strong><small>{user.department || user.role}</small></div>
            </div>
            <div className="app-nav-mobile-links">{links.map((link) => navLink(link, true))}</div>
            <button className="app-nav-drawer-logout" type="button" onClick={logout}>Log out securely</button>
          </aside>
        </div>
      )}
    </>
  );
}
