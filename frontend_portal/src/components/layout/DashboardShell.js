import React, { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import styles from "./DashboardShell.module.css";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import { useRole } from "../../context/RoleContext";
import NotificationsPanel from "../notifications/NotificationsPanel";

/**
 * PUBLIC_INTERFACE
 * DashboardShell provides the main app frame: left sidebar navigation,
 * top header/status bar, and a content workspace area.
 *
 * This component is routing-aware:
 * - uses NavLink for SPA navigation
 * - highlights the active route
 * - hides nav items the current role should not see
 *
 * @param {{
 *  title?: string,
 *  children: React.ReactNode
 * }} props
 * @returns {JSX.Element}
 */
export default function DashboardShell({ title = "Ocean Professional", children }) {
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Lightweight unread indicator; can be wired to backend alerts later.
  const [unreadCount, setUnreadCount] = useState(3);

  const { role, setRole, hasAnyRole } = useRole();

  const navItems = useMemo(
    () => [
      { key: "live", label: "Live Tracking", to: "/live", roles: ["viewer", "operator", "admin"] },
      { key: "analytics", label: "Analytics", to: "/analytics", roles: ["viewer", "operator", "admin"] },
      { key: "upload", label: "Upload Logs", to: "/upload", roles: ["operator", "admin"] },
      { key: "compliance", label: "Compliance", to: "/compliance", roles: ["viewer", "operator", "admin"] },
      { key: "reports", label: "Reports", to: "/reports", roles: ["viewer", "operator", "admin"] },
      { key: "settings", label: "Settings", to: "/settings", roles: ["operator", "admin"] },
    ],
    []
  );

  // Close the mobile sidebar on Escape for accessibility.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") setSidebarOpenMobile(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const closeMobile = () => setSidebarOpenMobile(false);

  /**
   * @param {React.ChangeEvent<HTMLSelectElement>} e
   */
  const onRoleChange = (e) => {
    setRole(/** @type {"viewer" | "operator" | "admin"} */ (e.target.value));
  };

  const visibleNavItems = navItems.filter((item) => hasAnyRole(item.roles));

  return (
    <div className={styles.shell}>
      {/* Mobile overlay */}
      <div
        className={[
          styles.overlay,
          sidebarOpenMobile ? styles.overlayVisible : "",
        ].join(" ")}
        onClick={closeMobile}
        aria-hidden={!sidebarOpenMobile}
      />

      <aside
        className={[
          styles.sidebar,
          sidebarOpenMobile ? styles.sidebarOpenMobile : "",
        ].join(" ")}
        aria-label="Primary navigation"
      >
        <div className={styles.sidebarTop}>
          <div className={styles.brand}>
            <div className={styles.brandMark} aria-hidden="true">
              OP
            </div>
            <div className={styles.brandText}>
              <div className={styles.brandName}>Ocean Professional</div>
              <div className={styles.brandSub}>Drive Test Portal</div>
            </div>
          </div>

          <div className={styles.sidebarMeta}>
            <Badge tone="primary">Live</Badge>
            <span className={styles.sidebarMetaText}>Telemetry ready</span>
          </div>
        </div>

        <nav className={styles.nav}>
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) =>
                [styles.navItem, isActive ? styles.navItemActive : ""]
                  .filter(Boolean)
                  .join(" ")
              }
              onClick={() => {
                setSidebarOpenMobile(false);
              }}
              end={item.to === "/live"}
            >
              <span className={styles.navDot} aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <Card className={styles.sidebarCard}>
            <div className={styles.sidebarCardRow}>
              <span className={styles.sidebarCardLabel}>Region</span>
              <Badge tone="secondary">All</Badge>
            </div>
            <div className={styles.sidebarCardRow}>
              <span className={styles.sidebarCardLabel}>Role</span>
              <Badge>{role}</Badge>
            </div>
          </Card>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.header} role="banner">
          <div className={styles.headerLeft}>
            <button
              className={[styles.menuButton, "op-iconButton"].join(" ")}
              onClick={() => setSidebarOpenMobile((v) => !v)}
              aria-label={sidebarOpenMobile ? "Close sidebar" : "Open sidebar"}
              aria-expanded={sidebarOpenMobile}
            >
              {/* simple hamburger */}
              <span className={styles.hamburger} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>

            <div className={styles.headerTitleGroup}>
              <div className={styles.headerTitle}>{title}</div>
              <div className={styles.headerSubtitle}>
                Real-time tracking & analytics workspace
              </div>
            </div>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.headerPills}>
              <Badge tone="primary">Online</Badge>
              <Badge tone="secondary">5G</Badge>
            </div>

            <label className={styles.roleControl}>
              <span className="srOnly">Role</span>
              <select
                className={styles.roleSelect}
                value={role}
                onChange={onRoleChange}
                aria-label="Demo role switcher"
              >
                <option value="viewer">viewer</option>
                <option value="operator">operator</option>
                <option value="admin">admin</option>
              </select>
            </label>

            <button
              id="op-header-notifications"
              className={[styles.notifButton, "op-iconButton"].join(" ")}
              aria-label="Notifications"
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
              onClick={() => {
                setNotificationsOpen((v) => !v);
                if (!notificationsOpen) setUnreadCount(0);
              }}
            >
              <span aria-hidden="true">🔔</span>
              {unreadCount > 0 ? (
                <span className={styles.notifDot} aria-label={`${unreadCount} unread notifications`}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </button>

            <button className="op-iconButton" aria-label="User profile">
              <span aria-hidden="true">👤</span>
            </button>

            <Button variant="ghost" size="sm" onClick={() => setSidebarOpenMobile(false)}>
              Help
            </Button>
          </div>
        </header>

        <main className={styles.content} role="main">
          {children}
        </main>

        <NotificationsPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      </div>
    </div>
  );
}
