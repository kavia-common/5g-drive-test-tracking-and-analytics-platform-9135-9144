import React, { useEffect, useMemo, useState } from "react";
import styles from "./DashboardShell.module.css";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Card from "../ui/Card";

/**
 * PUBLIC_INTERFACE
 * DashboardShell provides the main app frame: left sidebar navigation,
 * top header/status bar, and a content workspace area.
 *
 * This component is intentionally "routing-ready": it renders `children` inside
 * the content area, and exposes a placeholder navigation list.
 *
 * @param {{
 *  title?: string,
 *  children: React.ReactNode
 * }} props
 * @returns {JSX.Element}
 */
export default function DashboardShell({ title = "Ocean Professional", children }) {
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false);

  const navItems = useMemo(
    () => [
      { key: "overview", label: "Overview" },
      { key: "Live Map", label: "Live Map" },
      { key: "Analytics", label: "Analytics" },
      { key: "Uploads", label: "Log Uploads" },
      { key: "Reports", label: "Reports" },
      { key: "Settings", label: "Settings" },
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
          {navItems.map((item) => (
            <a
              key={item.key}
              href="#"
              className={styles.navItem}
              onClick={(e) => {
                e.preventDefault();
                // Placeholder until routing is added.
                setSidebarOpenMobile(false);
              }}
            >
              <span className={styles.navDot} aria-hidden="true" />
              {item.label}
            </a>
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
              <Badge>Operator</Badge>
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

            <button className="op-iconButton" aria-label="Notifications">
              <span aria-hidden="true">🔔</span>
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
      </div>
    </div>
  );
}
