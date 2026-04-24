import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { useImmersive } from "../lib/ImmersiveContext";
import { getPatientAssignments } from "../lib/api";

export function Shell() {
  const { user, logout, accessToken } = useAuth();
  const { isImmersive, setImmersive } = useImmersive();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hasAssignments, setHasAssignments] = useState(false);

  const initial = user?.name?.charAt(0).toUpperCase() ?? "?";
  const isDoctor = user?.role === "doctor";

  useEffect(() => {
    if (isDoctor || !accessToken) return;
    getPatientAssignments(accessToken).then(res => {
      setHasAssignments(res.length > 0);
    }).catch(console.error);
  }, [isDoctor, accessToken]);

  return (
    <div className={`app-shell ${isImmersive ? "immersive" : ""} ${isCollapsed ? "collapsed" : ""}`}>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""} ${isImmersive ? "sidebar-hidden" : ""} ${isCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-brand">
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', cursor: isCollapsed ? 'pointer' : 'default' }}
            onClick={() => { if (isCollapsed) setIsCollapsed(false); }}
          >
            <div className="brand-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div className="brand-text">
              <span className="brand-name">Rehab AI</span>
              <span className="brand-sub">Movement Intelligence</span>
            </div>
          </div>
          {!isCollapsed && (
            <button 
              className="sidebar-toggle-btn"
              onClick={() => setIsCollapsed(true)}
              title="Collapse sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
                <polyline points="15 8 11 12 15 16"/>
              </svg>
            </button>
          )}
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
                <span className="nav-link-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                </span>
                <span className="nav-link-text">Dashboard</span>
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
                <span className="nav-link-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </span>
                <span className="nav-link-text">Exercise Session</span>
                {hasAssignments && !isCollapsed && (
                  <span style={{
                    width: "8px", height: "8px", background: "var(--accent-cyan)",
                    borderRadius: "50%", marginLeft: "auto",
                    boxShadow: "0 0 8px var(--accent-cyan)",
                  }} />
                )}
              </NavLink>
              <NavLink
                to="/patient/progress"
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <span className="nav-link-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </span>
                <span className="nav-link-text">My Progress</span>
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
          <button className="btn-ghost" style={{ width: "100%", marginTop: "0.5rem", padding: isCollapsed ? "0.5rem 0" : "0.5rem 0.75rem" }} onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span className="nav-link-text">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className={`main-content ${isImmersive ? "main-content-immersive" : ""}`}>
        {/* Mobile top bar */}
        {!isImmersive && (
          <div className="mobile-header">
            <button className="btn-icon btn-ghost mobile-toggle" onClick={() => setSidebarOpen(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <span className="brand-name" style={{ fontSize: "1rem" }}>Rehab AI</span>
          </div>
        )}

        <Outlet />
      </div>
    </div>
  );
}
