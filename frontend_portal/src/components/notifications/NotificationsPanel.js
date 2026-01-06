import React, { useEffect, useMemo, useRef, useState } from "react";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import styles from "./NotificationsPanel.module.css";
import { dataService } from "../../services";

/**
 * @typedef {"info" | "warning" | "critical"} NoticeSeverity
 */

/**
 * @typedef {{
 *  id: string,
 *  ts: string,
 *  severity: NoticeSeverity,
 *  title: string,
 *  message: string,
 *  regionId?: string,
 *  source?: "mock" | "live" | "derived"
 * }} Notice
 */

/**
 * Derive deterministic notifications from available endpoints. This keeps the UI useful
 * even when the backend does not yet expose notifications APIs.
 *
 * @param {any} summary
 * @param {any} routeProgress
 * @param {Array<{id: string, name: string}>} regions
 * @returns {Notice[]}
 */
function deriveNotices(summary, routeProgress, regions) {
  const now = Date.now();

  const asNum = (v) => {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  const cov = asNum(summary?.coverageScore);
  const lat = asNum(summary?.p95LatencyMs);
  const dl = asNum(summary?.avgDownlinkMbps);
  const routePct = asNum(routeProgress?.percentComplete);

  /** @type {Notice[]} */
  const base = [];

  base.push({
    id: "sys-mode",
    ts: new Date(now - 2 * 60 * 1000).toISOString(),
    severity: "info",
    title: "Data layer active",
    message: `Provider: ${dataService.mode}. Notifications are derived until the backend exposes an alerts feed.`,
    source: "derived",
  });

  if (cov !== null && cov < 88) {
    base.push({
      id: "cov-low",
      ts: new Date(now - 12 * 60 * 1000).toISOString(),
      severity: cov < 84 ? "critical" : "warning",
      title: "Coverage score below target",
      message: `Coverage score is ${cov.toFixed(1)}% (target ≥ 90%). Review weak areas and reruns.`,
      source: "derived",
    });
  }

  if (lat !== null && lat > 60) {
    base.push({
      id: "lat-high",
      ts: new Date(now - 22 * 60 * 1000).toISOString(),
      severity: lat > 80 ? "critical" : "warning",
      title: "Latency regression detected",
      message: `P95 latency is ${Math.round(lat)} ms (target ≤ 45 ms). Investigate backhaul/core congestion.`,
      source: "derived",
    });
  }

  if (dl !== null && dl < 320) {
    base.push({
      id: "dl-low",
      ts: new Date(now - 35 * 60 * 1000).toISOString(),
      severity: dl < 280 ? "critical" : "warning",
      title: "Downlink throughput below expected",
      message: `Average downlink is ${dl.toFixed(1)} Mbps (expected ≥ 350 Mbps).`,
      source: "derived",
    });
  }

  if (routePct !== null && routePct < 70) {
    base.push({
      id: "route-lag",
      ts: new Date(now - 48 * 60 * 1000).toISOString(),
      severity: routePct < 55 ? "critical" : "warning",
      title: "Route completion behind plan",
      message: `Current route completion is ${Math.round(routePct)}%. Consider reallocating devices/teams.`,
      source: "derived",
    });
  }

  if (regions.length > 0) {
    const r = regions[0];
    base.push({
      id: "region-focus",
      ts: new Date(now - 65 * 60 * 1000).toISOString(),
      severity: "info",
      title: "Region focus ready",
      message: `Use Compliance to review region-level SLA tiles (e.g., ${r.name}).`,
      regionId: r.id,
      source: "derived",
    });
  }

  return base
    .slice()
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 12);
}

/**
 * PUBLIC_INTERFACE
 * NotificationsPanel renders a header dropdown panel with derived operational notices.
 *
 * @param {{
 *  open: boolean,
 *  onClose: () => void
 * }} props
 * @returns {JSX.Element | null}
 */
export default function NotificationsPanel({ open, onClose }) {
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {null | string} */ (null));

  const [regions, setRegions] = useState(/** @type {Array<{id: string, name: string}>} */ ([]));
  const [summary, setSummary] = useState(/** @type {any} */ (null));
  const [routeProgress, setRouteProgress] = useState(/** @type {any} */ (null));
  const [dismissed, setDismissed] = useState(() => new Set());

  const notices = useMemo(() => {
    const all = deriveNotices(summary, routeProgress, regions);
    return all.filter((n) => !dismissed.has(n.id));
  }, [summary, routeProgress, regions, dismissed]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [regionsResp, s, r] = await Promise.all([
          dataService.getRegions(),
          dataService.getAnalyticsSummary(),
          dataService.getRouteProgress(),
        ]);

        if (cancelled) return;

        const regionList = Array.isArray(regionsResp)
          ? regionsResp
          : regionsResp && Array.isArray(regionsResp.regions)
            ? regionsResp.regions
            : [];

        setRegions(
          regionList
            .map((x) => ({ id: String(x.id), name: String(x.name || x.code || x.id) }))
            .filter((x) => x.id)
        );
        setSummary(s && typeof s === "object" ? s : null);
        setRouteProgress(r && typeof r === "object" ? r : null);
      } catch (e) {
        const msg = e && typeof e === "object" && "message" in e ? String(e.message) : "Failed to load notifications";
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };

    const onDocMouseDown = (e) => {
      const el = panelRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onDocMouseDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [open, onClose]);

  const toneFor = (sev) => {
    if (sev === "critical") return "danger";
    if (sev === "warning") return "secondary";
    return "neutral";
  };

  const dismiss = (id) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  if (!open) return null;

  return (
    <div className={styles.portal} aria-hidden={!open}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="false" aria-label="Notifications">
        <Card className={styles.card}>
          <div className={styles.header}>
            <div>
              <div className={styles.title}>Notifications</div>
              <div className={styles.sub}>Operational notices (derived from existing data endpoints).</div>
            </div>
            <div className={styles.headerRight}>
              <Badge tone="neutral">{dataService.mode}</Badge>
              <Button variant="ghost" size="sm" onClick={onClose} ariaLabel="Close notifications">
                Close
              </Button>
            </div>
          </div>

          <div className={styles.body}>
            {error ? (
              <div className={styles.errorBox} role="alert">
                <div style={{ fontWeight: 900 }}>Could not load</div>
                <div className={styles.smallMuted} style={{ marginTop: 6 }}>
                  {error}
                </div>
              </div>
            ) : loading ? (
              <div className={styles.loadingBox} role="status" aria-live="polite">
                <div style={{ fontWeight: 900 }}>Loading…</div>
                <div className={styles.smallMuted} style={{ marginTop: 6 }}>
                  Fetching summary, route progress and regions.
                </div>
              </div>
            ) : notices.length === 0 ? (
              <div className={styles.emptyBox} role="status" aria-live="polite">
                <div style={{ fontWeight: 900 }}>All caught up</div>
                <div className={styles.smallMuted} style={{ marginTop: 6 }}>
                  No active notices. Dismissed items won’t reappear this session.
                </div>
              </div>
            ) : (
              <div className={styles.list} role="list" aria-label="Notifications list">
                {notices.map((n) => (
                  <div key={n.id} className={styles.row} role="listitem">
                    <div className={styles.rowTop}>
                      <div className={styles.rowTitle}>{n.title}</div>
                      <div className={styles.rowBadges}>
                        <Badge tone={toneFor(n.severity)}>{n.severity}</Badge>
                        {n.regionId ? <Badge tone="neutral">region</Badge> : null}
                      </div>
                    </div>
                    <div className={styles.rowMsg}>{n.message}</div>
                    <div className={styles.rowFoot}>
                      <div className={styles.smallMuted}>{new Date(n.ts).toLocaleString()}</div>
                      <Button variant="ghost" size="sm" onClick={() => dismiss(n.id)} ariaLabel={`Dismiss ${n.title}`}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.footer}>
            <div className={styles.smallMuted}>Tip: Compliance includes region-level SLA tiles and checklist views.</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
