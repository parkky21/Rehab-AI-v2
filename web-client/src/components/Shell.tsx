import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../lib/auth";

export function Shell() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const initial = user?.name?.charAt(0).toUpperCase() ?? "?";
  const isDoctor = user?.role === "doctor";

  return (
    <div className="app-shell">
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-icon">⚡</div>
          <div className="brand-text">
            <span className="brand-name">Rehab AI</span>
            <span className="brand-sub">Movement Intelligence</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-section-label">
            {isDoctor ? "Doctor" : "Patient"}
          </span>

          {isDoctor ? (
            <>
              <NavLink
                to="/doctor"
                end
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <span className="nav-link-icon">📋</span>
                Dashboard
              </NavLink>
            </>
          ) : (
            <>
              <NavLink
                to="/patient/exercise"
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <span className="nav-link-icon">🏋️</span>
                Exercise Session
              </NavLink>
              <NavLink
                to="/patient/progress"
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <span className="nav-link-icon">📊</span>
                My Progress
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{initial}</div>
            <div className="user-info">
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="btn-ghost" style={{ width: "100%", marginTop: "0.5rem" }} onClick={logout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="main-content">
        {/* Mobile top bar */}
        <div className="mobile-header">
          <button className="btn-icon btn-ghost mobile-toggle" onClick={() => setSidebarOpen(true)}>
            ☰
          </button>
          <span className="brand-name" style={{ fontSize: "1rem" }}>Rehab AI</span>
        </div>

        <Outlet />
      </div>
    </div>
  );
}
