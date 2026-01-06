import React, { useEffect, useMemo, useRef, useState } from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import styles from "./DashboardHome.module.css";
import { dataService } from "../services";
import { logger } from "../config";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States";

/**
 * @typedef {{ id: string, name: string, code?: string }} Region
 */

/**
 * @typedef {{
 *  id: string,
 *  name?: string,
 *  regionId?: string,
 *  status?: string,
 *  lastSeenAt?: string,
 *  lat?: number,
 *  lng?: number,
 *  speedKph?: number,
 *  batteryPct?: number | null
 * }} Device
 */

/**
 * @typedef {{
 *  id?: string,
 *  routeId?: string,
 *  routeName?: string,
 *  regionId?: string,
 *  deviceId?: string,
 *  deviceName?: string,
 *  completionPct?: number,
 *  taskCompletionPct?: number,
 *  etaMinutes?: number,
 *  status?: string,
 *  active?: boolean
 * }} RouteProgressRow
 */

/**
 * @param {string | undefined} iso
 * @returns {Date | null}
 */
function parseIso(iso) {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

/**
 * @param {string | undefined} iso
 * @returns {string}
 */
function formatTimeAgo(iso) {
  const dt = parseIso(iso);
  if (!dt) return "—";
  const diffMs = Date.now() - dt.getTime();
  const s = Math.max(0, Math.floor(diffMs / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Convert lat/lng into a deterministic point inside an SVG viewport.
 * (Not a real map projection; just a stable visual placeholder.)
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{ width: number, height: number }} viewport
 * @returns {{ x: number, y: number }}
 */
function projectLatLng(lat, lng, viewport) {
  const width = viewport.width;
  const height = viewport.height;

  const nx = (lng + 180) / 360;
  const ny = 1 - (lat + 90) / 180;

  const pad = 14;
  const x = pad + nx * (width - pad * 2);
  const y = pad + ny * (height - pad * 2);

  return { x, y };
}

/**
 * Best-effort extraction of a list from provider response shapes.
 * @param {any} resp
 * @param {string} key
 * @returns {any[]}
 */
function unwrapList(resp, key) {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object" && Array.isArray(resp[key])) return resp[key];
  return [];
}

/**
 * @param {number | undefined | null} pct
 * @returns {string}
 */
function formatPct(pct) {
  if (typeof pct !== "number" || Number.isNaN(pct)) return "—";
  const clamped = Math.max(0, Math.min(100, pct));
  return `${Math.round(clamped)}%`;
}

/**
 * @param {Device} d
 * @returns {"online" | "offline"}
 */
function normalizeOnlineStatus(d) {
  const raw = String(d.status || "").toLowerCase();
  if (raw === "offline") return "offline";
  return "online";
}

/**
 * PUBLIC_INTERFACE
 * DashboardHome is the default dashboard landing view:
 * - KPI row for completion metrics and active counts
 * - Mini live map placeholder + compact drivers-on-route list
 * - Uses DataService for fetching and real-time device updates
 *
 * @returns {JSX.Element}
 */
export default function DashboardHome() {
  const [regions, setRegions] = useState(/** @type {Region[]} */ ([]));
  const [devices, setDevices] = useState(/** @type {Device[]} */ ([]));
  const [routeProgress, setRouteProgress] = useState(/** @type {RouteProgressRow[]} */ ([]));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {null | { message: string }} */ (null));

  const [miniMapOpenMobile, setMiniMapOpenMobile] = useState(false);

  // Ensure we only subscribe once and always cleanup on unmount.
  const subscribedRef = useRef(false);

  const regionsById = useMemo(() => {
    const map = new Map();
    for (const r of regions) map.set(r.id, r);
    return map;
  }, [regions]);

  const viewport = useMemo(() => ({ width: 820, height: 360 }), []);

  const derived = useMemo(() => {
    // Normalize route progress into a shape we can join with devices.
    // We treat "predefined routes" as the set returned by getRouteProgress().
    const rp = Array.isArray(routeProgress) ? routeProgress : [];

    const byDeviceId = new Map();
    for (const row of rp) {
      const deviceId = row.deviceId || row.id || "";
      if (!deviceId) continue;

      const completionPct =
        typeof row.completionPct === "number"
          ? row.completionPct
          : typeof row.progressPct === "number"
            ? row.progressPct
            : undefined;

      const taskCompletionPct =
        typeof row.taskCompletionPct === "number"
          ? row.taskCompletionPct
          : typeof row.tasksCompletionPct === "number"
            ? row.tasksCompletionPct
            : undefined;

      byDeviceId.set(deviceId, {
        routeName: row.routeName || row.route || "Route",
        regionId: row.regionId,
        completionPct,
        taskCompletionPct,
        etaMinutes: typeof row.etaMinutes === "number" ? row.etaMinutes : undefined,
        status: row.status,
        active: typeof row.active === "boolean" ? row.active : true,
      });
    }

    /** @type {Array<{
     *  id: string,
     *  name: string,
     *  regionId?: string,
     *  regionName: string,
     *  online: "online" | "offline",
     *  onRoute: boolean,
     *  progressPct?: number,
     *  taskCompletionPct?: number,
     *  etaMinutes?: number,
     *  routeName: string,
     *  lastSeenAt?: string,
     *  lat?: number,
     *  lng?: number
     * }>} */
    const drivers = devices.map((d) => {
      const link = byDeviceId.get(d.id);
      const regionId = link?.regionId || d.regionId;
      const regionName = regionId && regionsById.get(regionId) ? regionsById.get(regionId).name : "—";
      const progressPct = link?.completionPct;
      const taskPct = link?.taskCompletionPct;

      // "On Route" when we have a matching route progress record. If no route alignment exists,
      // we conservatively consider them off-route (predefined routes filter).
      const onRoute = Boolean(link);

      return {
        id: d.id,
        name: d.name || d.id,
        regionId,
        regionName,
        online: normalizeOnlineStatus(d),
        onRoute,
        progressPct,
        taskCompletionPct: taskPct,
        etaMinutes: link?.etaMinutes,
        routeName: link?.routeName || "—",
        lastSeenAt: d.lastSeenAt,
        lat: d.lat,
        lng: d.lng,
      };
    });

    const driversOnRoutes = drivers
      .filter((d) => d.onRoute)
      .sort((a, b) => {
        // prioritize On Route + online + most progressed
        const ao = a.online === "online" ? 0 : 1;
        const bo = b.online === "online" ? 0 : 1;
        if (ao !== bo) return ao - bo;

        const ap = typeof a.progressPct === "number" ? a.progressPct : -1;
        const bp = typeof b.progressPct === "number" ? b.progressPct : -1;
        return bp - ap;
      });

    const activeDrivers = driversOnRoutes.filter((d) => d.online === "online").length;

    const activeRoutes = (() => {
      const set = new Set();
      for (const d of driversOnRoutes) {
        if (d.routeName && d.routeName !== "—") set.add(d.routeName);
      }
      return set.size || rp.length;
    })();

    // Overall route completion: average of available progress pct
    const routePctValues = driversOnRoutes
      .map((d) => d.progressPct)
      .filter((v) => typeof v === "number" && !Number.isNaN(v));
    const overallRouteCompletionPct =
      routePctValues.length > 0 ? routePctValues.reduce((a, b) => a + b, 0) / routePctValues.length : undefined;

    // Overall task completion: average of available task completion pct (if present),
    // otherwise fall back to route completion.
    const taskPctValues = driversOnRoutes
      .map((d) => d.taskCompletionPct)
      .filter((v) => typeof v === "number" && !Number.isNaN(v));
    const overallTaskCompletionPct =
      taskPctValues.length > 0
        ? taskPctValues.reduce((a, b) => a + b, 0) / taskPctValues.length
        : overallRouteCompletionPct;

    // Per-region metrics if we have region ids
    const perRegion = new Map();
    for (const d of driversOnRoutes) {
      const key = d.regionId || "unknown";
      const cur = perRegion.get(key) || { regionId: d.regionId, regionName: d.regionName, routePcts: [], taskPcts: [] };
      if (typeof d.progressPct === "number") cur.routePcts.push(d.progressPct);
      if (typeof d.taskCompletionPct === "number") cur.taskPcts.push(d.taskCompletionPct);
      perRegion.set(key, cur);
    }

    const perRegionRows = Array.from(perRegion.values())
      .map((r) => {
        const routeAvg = r.routePcts.length ? r.routePcts.reduce((a, b) => a + b, 0) / r.routePcts.length : undefined;
        const taskAvg = r.taskPcts.length ? r.taskPcts.reduce((a, b) => a + b, 0) / r.taskPcts.length : undefined;
        return {
          regionId: r.regionId,
          regionName: r.regionName,
          routeCompletionPct: routeAvg,
          taskCompletionPct: taskAvg ?? routeAvg,
        };
      })
      .filter((r) => r.regionName !== "—")
      .sort((a, b) => a.regionName.localeCompare(b.regionName));

    return {
      driversOnRoutes,
      activeDrivers,
      activeRoutes,
      overallRouteCompletionPct,
      overallTaskCompletionPct,
      perRegionRows,
    };
  }, [devices, regionsById, routeProgress]);

  const deviceMarkers = useMemo(() => {
    return derived.driversOnRoutes
      .filter((d) => typeof d.lat === "number" && typeof d.lng === "number")
      .slice(0, 24)
      .map((d) => {
        const pt = projectLatLng(/** @type {number} */ (d.lat), /** @type {number} */ (d.lng), viewport);
        return { id: d.id, x: pt.x, y: pt.y, online: d.online, onRoute: d.onRoute };
      });
  }, [derived.driversOnRoutes, viewport]);

  const refreshAll = async () => {
    setError(null);
    setLoading(true);

    try {
      const [regionsResp, devicesResp, progressResp] = await Promise.all([
        dataService.getRegions(),
        dataService.getDevices(),
        dataService.getRouteProgress(),
      ]);

      setRegions(/** @type {Region[]} */ (unwrapList(regionsResp, "regions")));
      setDevices(/** @type {Device[]} */ (unwrapList(devicesResp, "devices")));
      setRouteProgress(/** @type {RouteProgressRow[]} */ (unwrapList(progressResp, "routes")));
    } catch (e) {
      const message = e && typeof e === "object" && "message" in e ? String(e.message) : "Failed to load dashboard data";
      setError({ message });
      logger.warn("[dashboard] refreshAll failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      await refreshAll();

      // Live updates for device status/position; route progress may remain polled/mock.
      try {
        if (subscribedRef.current) return;
        subscribedRef.current = true;

        dataService.subscribeToDeviceUpdates((evt) => {
          if (cancelled) return;
          if (!evt || evt.type !== "device:update") return;

          /** @type {Device | null} */
          const incoming = evt.device || null;
          if (!incoming || !incoming.id) return;

          setDevices((prev) => {
            const idx = prev.findIndex((d) => d.id === incoming.id);
            if (idx === -1) return [incoming, ...prev];
            const next = prev.slice();
            next[idx] = { ...next[idx], ...incoming };
            return next;
          });
        });
      } catch (e) {
        logger.warn("[dashboard] subscribeToDeviceUpdates failed", e);
      }
    }

    boot();

    return () => {
      cancelled = true;
      dataService.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Responsive: default closed on small screens; allow toggle.
  const showMiniMap = miniMapOpenMobile;

  return (
    <div className={styles.page} aria-label="Dashboard home">
      <div className={styles.topRow}>
        <div className={styles.kpis} aria-label="KPI cards">
          <Card className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <div className={styles.kpiLabel}>Route Completion</div>
              <Badge tone="primary">Overall</Badge>
            </div>
            <div className={styles.kpiValue} data-testid="kpi-route-completion">
              {formatPct(derived.overallRouteCompletionPct)}
            </div>
            <div className={styles.kpiSub}>Across predefined routes currently in motion.</div>
          </Card>

          <Card className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <div className={styles.kpiLabel}>Task Completion</div>
              <Badge tone="secondary">Overall</Badge>
            </div>
            <div className={styles.kpiValue} data-testid="kpi-task-completion">
              {formatPct(derived.overallTaskCompletionPct)}
            </div>
            <div className={styles.kpiSub}>Tasks completed vs planned (best-effort from provider fields).</div>
          </Card>

          <Card className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <div className={styles.kpiLabel}>Active Drivers</div>
              <Badge tone="primary">Live</Badge>
            </div>
            <div className={styles.kpiValue} data-testid="kpi-active-drivers">
              {derived.activeDrivers}
            </div>
            <div className={styles.kpiSub}>Drivers currently on predefined routes & online.</div>
          </Card>

          <Card className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <div className={styles.kpiLabel}>Active Routes</div>
              <Badge tone="neutral">Now</Badge>
            </div>
            <div className={styles.kpiValue} data-testid="kpi-active-routes">
              {derived.activeRoutes}
            </div>
            <div className={styles.kpiSub}>Distinct routes represented in the live fleet.</div>
          </Card>
        </div>

        <div className={styles.topActions}>
          <div className={styles.metaPills}>
            <Badge tone="secondary">{dataService.mode}</Badge>
            <Badge tone="primary">Dashboard</Badge>
          </div>

          <div className={styles.actionRow}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMiniMapOpenMobile((v) => !v)}
              ariaLabel={showMiniMap ? "Hide mini map" : "Show mini map"}
            >
              {showMiniMap ? "Hide map" : "Show map"}
            </Button>

            <Button variant="ghost" size="sm" onClick={refreshAll} ariaLabel="Refresh dashboard data">
              Refresh
            </Button>

            <a className={styles.liveLink} href="/live">
              Go to /live
            </a>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Could not load dashboard"
          message="We couldn’t fetch regions/devices/route progress. Check the provider or retry."
          details={error.message}
          onAction={refreshAll}
          actionLabel="Retry"
        />
      ) : loading ? (
        <LoadingState title="Loading dashboard…" message="Fetching live devices and route progress." />
      ) : derived.driversOnRoutes.length === 0 ? (
        <EmptyState
          title="No drivers on predefined routes"
          message="Route alignment data may not be available yet, or there are no active routes in the current dataset."
          onAction={refreshAll}
          actionLabel="Refresh"
        />
      ) : (
        <>
          {derived.perRegionRows.length > 0 ? (
            <Card className={styles.regionStrip} aria-label="Per-region completion">
              <div className={styles.regionStripHeader}>
                <div className={styles.sectionTitle}>Per-region completion</div>
                <div className={styles.sectionSub}>Displayed when region mapping is available.</div>
              </div>

              <div className={styles.regionChips}>
                {derived.perRegionRows.map((r) => (
                  <div className={styles.regionChip} key={r.regionName}>
                    <div className={styles.regionName}>{r.regionName}</div>
                    <div className={styles.regionMetrics}>
                      <span className={styles.regionMetric}>
                        Routes: <strong>{formatPct(r.routeCompletionPct)}</strong>
                      </span>
                      <span className={styles.regionMetric}>
                        Tasks: <strong>{formatPct(r.taskCompletionPct)}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <div className={styles.mainSplit}>
            <Card
              className={[styles.mapCard, showMiniMap ? styles.mapCardVisibleMobile : styles.mapCardHiddenMobile].join(" ")}
              aria-label="Mini live map"
            >
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.sectionTitle}>On-route visibility</div>
                  <div className={styles.sectionSub}>Mini placeholder map (no external SDK). Markers update in real time.</div>
                </div>
                <Badge tone="secondary">Mini map</Badge>
              </div>

              <div className={styles.mapSurface} role="img" aria-label="Map placeholder with driver markers">
                <svg className={styles.mapSvg} viewBox={`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="xMidYMid slice">
                  <defs>
                    <pattern id="dashGrid" width="48" height="48" patternUnits="userSpaceOnUse">
                      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(17, 24, 39, 0.06)" strokeWidth="1" />
                    </pattern>
                  </defs>

                  <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="url(#dashGrid)" />
                  <rect x="28" y="38" width="250" height="130" rx="18" fill="rgba(37, 99, 235, 0.10)" stroke="rgba(37, 99, 235, 0.20)" />
                  <rect x="310" y="72" width="260" height="160" rx="18" fill="rgba(37, 99, 235, 0.08)" stroke="rgba(37, 99, 235, 0.18)" />
                  <rect x="160" y="236" width="420" height="96" rx="18" fill="rgba(245, 158, 11, 0.08)" stroke="rgba(245, 158, 11, 0.18)" />

                  {deviceMarkers.map((m) => {
                    const fill =
                      m.online === "online" ? "rgba(37, 99, 235, 0.70)" : "rgba(239, 68, 68, 0.70)";
                    return (
                      <g key={m.id}>
                        <circle cx={m.x} cy={m.y} r={10} fill="rgba(17, 24, 39, 0.08)" />
                        <circle cx={m.x} cy={m.y} r={6} fill={fill} />
                        <circle cx={m.x} cy={m.y} r={3} fill="rgba(255,255,255,0.92)" />
                      </g>
                    );
                  })}
                </svg>

                <div className={styles.mapLegend} aria-label="Map legend">
                  <div className={styles.legendRow}>
                    <span className={[styles.legendSwatch, styles.legendSwatchOn].join(" ")} aria-hidden="true" />
                    Online on-route
                  </div>
                  <div className={styles.legendRow}>
                    <span className={[styles.legendSwatch, styles.legendSwatchOff].join(" ")} aria-hidden="true" />
                    Offline / stale
                  </div>
                </div>
              </div>

              <div className={styles.mapFooter}>
                <div className={styles.mutedTiny}>Last device fix shown as marker positions (best-effort).</div>
                <a className={styles.secondaryLink} href="/live">
                  Open full workspace →
                </a>
              </div>
            </Card>

            <Card className={styles.listCard} aria-label="Drivers on routes">
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.sectionTitle}>Drivers on predefined routes</div>
                  <div className={styles.sectionSub}>Compact operational list with progress and ETA.</div>
                </div>
                <Badge tone="primary">{derived.driversOnRoutes.length}</Badge>
              </div>

              <div className={styles.tableWrap} role="region" aria-label="Drivers table">
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Driver</th>
                      <th scope="col">Status</th>
                      <th scope="col">Progress</th>
                      <th scope="col">ETA</th>
                      <th scope="col">Route</th>
                      <th scope="col">Region</th>
                      <th scope="col">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.driversOnRoutes.map((d) => {
                      const onRoute = d.onRoute;
                      const statusLabel = onRoute ? "On Route" : "Off Route";
                      const statusTone = d.online === "online" ? "primary" : "danger";
                      const etaLabel =
                        typeof d.etaMinutes === "number" && !Number.isNaN(d.etaMinutes) ? `${Math.round(d.etaMinutes)}m` : "—";

                      return (
                        <tr key={d.id}>
                          <td className={styles.cellDriver}>
                            <div className={styles.driverName}>{d.name}</div>
                            <div className={styles.driverSub}>{d.id}</div>
                          </td>
                          <td>
                            <div className={styles.statusStack}>
                              <Badge tone={statusTone}>{d.online === "online" ? "Online" : "Offline"}</Badge>
                              <span className={styles.smallMuted}>{statusLabel}</span>
                            </div>
                          </td>
                          <td>
                            <div className={styles.progressCell}>
                              <div className={styles.progressTop}>
                                <span className={styles.progressValue}>{formatPct(d.progressPct)}</span>
                                <span className={styles.progressTiny}>Tasks: {formatPct(d.taskCompletionPct)}</span>
                              </div>
                              <div className={styles.progressBar} aria-hidden="true">
                                <span
                                  className={styles.progressFill}
                                  style={{
                                    width:
                                      typeof d.progressPct === "number"
                                        ? `${Math.max(0, Math.min(100, d.progressPct))}%`
                                        : "0%",
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>{etaLabel}</td>
                          <td className={styles.cellRoute}>{d.routeName}</td>
                          <td>{d.regionName}</td>
                          <td className={styles.cellLastSeen}>{formatTimeAgo(d.lastSeenAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={styles.cardFooter}>
                <div className={styles.mutedTiny}>
                  Note: If route alignment/progress fields are missing from the provider, values will display as “—”.
                </div>
                <a className={styles.secondaryLink} href="/reports">
                  View reports →
                </a>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
