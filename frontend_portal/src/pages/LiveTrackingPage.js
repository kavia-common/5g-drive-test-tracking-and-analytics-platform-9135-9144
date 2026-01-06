import React, { useEffect, useMemo, useRef, useState } from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import styles from "./LiveTrackingPage.module.css";
import { dataService } from "../services";
import { logger } from "../config";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States";

/**
 * @typedef {{
 *  lat: number,
 *  lng: number,
 *  ts: string,
 *  speedKph?: number
 * }} BreadcrumbPoint
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
 * Make a best-effort attempt to normalize device status to "online"/"offline".
 * @param {Device} d
 * @returns {"online" | "offline"}
 */
function normalizeOnlineStatus(d) {
  const raw = String(d.status || "").toLowerCase();
  if (raw === "offline") return "offline";

  // Most non-offline statuses should be treated as online (driving/idle/online/etc)
  // as long as we have a recent-ish lastSeenAt.
  return "online";
}

/**
 * @param {string | undefined} iso
 * @returns {Date | null}
 */
function parseIso(iso) {
  if (!iso) return null;
  const dt = new Date(iso);
  // Invalid Date check
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
 * @param {number | undefined} speed
 * @returns {string}
 */
function formatSpeed(speed) {
  if (typeof speed !== "number" || Number.isNaN(speed)) return "—";
  return `${Math.round(speed)} km/h`;
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

  // Normalize lat/lng into 0..1 then scale:
  // lng: -180..180 => 0..1
  // lat: -90..90 => 0..1 (invert y for screen coords)
  const nx = (lng + 180) / 360;
  const ny = 1 - (lat + 90) / 180;

  // Keep within interior padding
  const pad = 18;
  const x = pad + nx * (width - pad * 2);
  const y = pad + ny * (height - pad * 2);

  return { x, y };
}

/**
 * Generate a tiny rolling breadcrumb list per device.
 * We keep it in-memory only (not persisted).
 *
 * @param {Map<string, BreadcrumbPoint[]>} current
 * @param {Device} device
 * @returns {Map<string, BreadcrumbPoint[]>}
 */
function appendBreadcrumb(current, device) {
  const next = new Map(current);
  const id = device.id;
  const lat = typeof device.lat === "number" ? device.lat : null;
  const lng = typeof device.lng === "number" ? device.lng : null;
  const ts = device.lastSeenAt || new Date().toISOString();
  if (lat === null || lng === null) return next;

  const list = next.get(id) ? next.get(id).slice() : [];
  const last = list[list.length - 1];

  // Avoid duplicates if updates come in quickly with same coord.
  if (last && Math.abs(last.lat - lat) < 1e-7 && Math.abs(last.lng - lng) < 1e-7) {
    return next;
  }

  list.push({
    lat,
    lng,
    ts,
    speedKph: typeof device.speedKph === "number" ? device.speedKph : undefined,
  });

  // Keep last N points.
  const MAX = 18;
  const trimmed = list.length > MAX ? list.slice(list.length - MAX) : list;
  next.set(id, trimmed);
  return next;
}

/**
 * PUBLIC_INTERFACE
 * LiveTrackingPage renders the real-time tracking workspace:
 * - Map placeholder (SVG) with region tiles + device markers + selected route breadcrumbs
 * - Device list with region filter, status, speed, last update
 * - Selection drawer with device details + recent breadcrumbs
 *
 * Live updates:
 * - Uses DataService websocket stream when available (subscribeToDeviceUpdates)
 * - Falls back to periodic polling (getDevices) for resiliency
 *
 * @returns {JSX.Element}
 */
export default function LiveTrackingPage() {
  const [regions, setRegions] = useState(/** @type {Array<{id: string, name: string, code?: string}>} */ ([]));
  const [devices, setDevices] = useState(/** @type {Device[]} */ ([]));
  const [selectedDeviceId, setSelectedDeviceId] = useState(/** @type {string | null} */ (null));

  const [regionFilter, setRegionFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {null | { message: string }} */ (null));

  const [liveMeta, setLiveMeta] = useState(() => ({
    source: /** @type {"ws" | "poll"} */ ("poll"),
    wsAttempted: false,
    lastRefreshAt: /** @type {string | null} */ (null),
  }));

  const [breadcrumbsByDevice, setBreadcrumbsByDevice] = useState(
    /** @type {Map<string, BreadcrumbPoint[]>} */ (new Map())
  );

  // Interval state (polling fallback)
  const pollTimerRef = useRef(/** @type {number | null} */ (null));

  const selectedDevice = useMemo(() => {
    if (!selectedDeviceId) return null;
    return devices.find((d) => d.id === selectedDeviceId) || null;
  }, [devices, selectedDeviceId]);

  const selectedBreadcrumbs = useMemo(() => {
    if (!selectedDeviceId) return [];
    return breadcrumbsByDevice.get(selectedDeviceId) || [];
  }, [breadcrumbsByDevice, selectedDeviceId]);

  const regionsById = useMemo(() => {
    const map = new Map();
    for (const r of regions) map.set(r.id, r);
    return map;
  }, [regions]);

  const filteredDevices = useMemo(() => {
    const s = search.trim().toLowerCase();
    return devices
      .filter((d) => (regionFilter === "all" ? true : d.regionId === regionFilter))
      .filter((d) => {
        if (!s) return true;
        const name = String(d.name || d.id || "").toLowerCase();
        const id = String(d.id || "").toLowerCase();
        const regionName = d.regionId && regionsById.get(d.regionId) ? String(regionsById.get(d.regionId).name) : "";
        return name.includes(s) || id.includes(s) || regionName.toLowerCase().includes(s);
      })
      .sort((a, b) => {
        // Put online devices first, then most recently seen.
        const ao = normalizeOnlineStatus(a) === "online" ? 0 : 1;
        const bo = normalizeOnlineStatus(b) === "online" ? 0 : 1;
        if (ao !== bo) return ao - bo;

        const at = parseIso(a.lastSeenAt)?.getTime() ?? 0;
        const bt = parseIso(b.lastSeenAt)?.getTime() ?? 0;
        return bt - at;
      });
  }, [devices, regionFilter, search, regionsById]);

  const onlineCount = useMemo(() => filteredDevices.filter((d) => normalizeOnlineStatus(d) === "online").length, [
    filteredDevices,
  ]);

  /**
   * Poll devices once and update state.
   * @param {{ silent?: boolean }} [opts]
   */
  const refreshDevices = async (opts = {}) => {
    try {
      if (!opts.silent) setError(null);
      const resp = await dataService.getDevices();

      const list = Array.isArray(resp) ? resp : resp && Array.isArray(resp.devices) ? resp.devices : [];
      setDevices(list);

      // Update breadcrumbs with latest positions.
      setBreadcrumbsByDevice((prev) => {
        let next = prev;
        for (const d of list) {
          next = appendBreadcrumb(next, d);
        }
        return next;
      });

      setLiveMeta((m) => ({
        ...m,
        lastRefreshAt: new Date().toISOString(),
      }));
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e ? String(e.message) : "Failed to load devices";
      if (!opts.silent) setError({ message });
      logger.warn("[live] refreshDevices failed", e);
    }
  };

  /**
   * Start fallback polling.
   * Uses a conservative interval to avoid noisy traffic; updates are incremental via WS when available.
   */
  const startPolling = () => {
    if (pollTimerRef.current) return;

    // Polling is also useful as a safety net even when WS is connected.
    // But we keep it slower to minimize traffic.
    pollTimerRef.current = window.setInterval(() => {
      refreshDevices({ silent: true });
    }, 5000);

    setLiveMeta((m) => ({ ...m, source: "poll" }));
  };

  const stopPolling = () => {
    if (!pollTimerRef.current) return;
    window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);
      setError(null);

      try {
        const [regionsResp] = await Promise.all([dataService.getRegions()]);
        if (cancelled) return;

        const list = Array.isArray(regionsResp)
          ? regionsResp
          : regionsResp && Array.isArray(regionsResp.regions)
            ? regionsResp.regions
            : [];

        setRegions(list);
      } catch (e) {
        if (!cancelled) {
          setError({
            message:
              e && typeof e === "object" && "message" in e
                ? String(e.message)
                : "Failed to load regions",
          });
          logger.warn("[live] getRegions failed", e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }

      // First device fetch regardless of WS.
      await refreshDevices({ silent: true });

      // Start polling fallback.
      startPolling();

      // Try websocket stream. If server supports it, this will quickly become the primary update path.
      try {
        setLiveMeta((m) => ({ ...m, wsAttempted: true }));
        dataService.subscribeToDeviceUpdates((evt) => {
          if (cancelled) return;
          if (!evt || evt.type !== "device:update") return;

          setLiveMeta((m) => ({ ...m, source: "ws" }));

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

          setBreadcrumbsByDevice((prev) => appendBreadcrumb(prev, incoming));

          setLiveMeta((m) => ({
            ...m,
            lastRefreshAt: evt.ts || new Date().toISOString(),
          }));
        });
      } catch (e) {
        // subscribeToDeviceUpdates should not throw, but guard anyway.
        logger.warn("[live] WS subscribe failed (will continue polling)", e);
      }
    }

    boot();

    return () => {
      cancelled = true;
      stopPolling();
      dataService.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selection valid if device list changes.
  useEffect(() => {
    if (!selectedDeviceId) return;
    const exists = devices.some((d) => d.id === selectedDeviceId);
    if (!exists) setSelectedDeviceId(null);
  }, [devices, selectedDeviceId]);

  const regionOptions = useMemo(() => {
    const opts = regions.map((r) => ({ value: r.id, label: r.name }));
    return [{ value: "all", label: "All regions" }, ...opts];
  }, [regions]);

  // Memoized so it can be safely used as a dependency (CI treats ESLint warnings as errors).
  const viewport = useMemo(() => ({ width: 920, height: 520 }), []);

  const regionTiles = useMemo(() => {
    // Visual placeholder: create 3 region "zones" regardless of exact list length.
    // If more regions exist, they will be shown in list/filter but map tiles stay simple.
    return [
      { key: "tile-a", x: 40, y: 60, w: 280, h: 170 },
      { key: "tile-b", x: 360, y: 90, w: 300, h: 190 },
      { key: "tile-c", x: 200, y: 300, w: 380, h: 170 },
    ];
  }, []);

  const selectedRoutePath = useMemo(() => {
    if (!selectedDeviceId) return "";
    const points = breadcrumbsByDevice.get(selectedDeviceId) || [];
    if (points.length < 2) return "";

    const coords = points.map((p) => projectLatLng(p.lat, p.lng, viewport));
    return coords
      .map((c, idx) => `${idx === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(" ");
  }, [breadcrumbsByDevice, selectedDeviceId, viewport]);

  const deviceMarkers = useMemo(() => {
    // Render only filtered set to match the list.
    return filteredDevices
      .filter((d) => typeof d.lat === "number" && typeof d.lng === "number")
      .map((d) => {
        const pt = projectLatLng(/** @type {number} */ (d.lat), /** @type {number} */ (d.lng), viewport);
        return { id: d.id, x: pt.x, y: pt.y, status: normalizeOnlineStatus(d) };
      });
  }, [filteredDevices, viewport]);

  const onSelectDevice = (id) => setSelectedDeviceId(id);

  const onClearSelection = () => setSelectedDeviceId(null);

  const onRegionChange = (e) => setRegionFilter(e.target.value);

  const onSearchChange = (e) => setSearch(e.target.value);

  return (
    <div className={styles.workspace}>
      <div className={styles.leftRail}>
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>Devices</div>
              <div className={[styles.panelSub, "op-muted"].join(" ")}>
                Real-time device status, speed and last fix. Filter by region.
              </div>

              <div className={styles.controlsRow}>
                <label>
                  <span className="srOnly">Region</span>
                  <select className={styles.select} value={regionFilter} onChange={onRegionChange} aria-label="Region">
                    {regionOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ flex: "1 1 auto" }}>
                  <span className="srOnly">Search devices</span>
                  <input
                    className={styles.searchInput}
                    value={search}
                    onChange={onSearchChange}
                    placeholder="Search device / region…"
                    aria-label="Search devices"
                  />
                </label>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refreshDevices({ silent: false })}
                  ariaLabel="Refresh device list"
                >
                  Refresh
                </Button>
              </div>

              <div className={styles.kpiRow}>
                <div className={styles.kpiItem} title="Filtered devices">
                  <div className={styles.kpiLabel}>Devices</div>
                  <div className={styles.kpiValue}>{filteredDevices.length}</div>
                </div>
                <div className={styles.kpiItem} title="Filtered devices currently online">
                  <div className={styles.kpiLabel}>Online</div>
                  <div className={styles.kpiValue}>{onlineCount}</div>
                </div>
                <div className={styles.kpiItem} title="Update source">
                  <div className={styles.kpiLabel}>Live</div>
                  <div className={styles.kpiValue}>{liveMeta.source.toUpperCase()}</div>
                </div>
              </div>
            </div>

            <Badge tone="primary">/live</Badge>
          </div>

          <div className={styles.panelBody}>
            {error ? (
              <ErrorState
                title="Could not load live data"
                message="We couldn’t fetch regions/devices or the data provider is unavailable."
                details={error.message}
                onAction={() => refreshDevices({ silent: false })}
                actionLabel="Retry devices"
                inline
              />
            ) : loading ? (
              <LoadingState title="Loading…" message="Fetching regions and devices." inline />
            ) : filteredDevices.length === 0 ? (
              <EmptyState
                title="No devices"
                message="Try selecting a different region or clearing the search."
                onAction={() => {
                  setRegionFilter("all");
                  setSearch("");
                }}
                actionLabel="Clear filters"
                inline
              />
            ) : (
              <div className={styles.list} role="list" aria-label="Device list">
                {filteredDevices.map((d) => {
                  const online = normalizeOnlineStatus(d) === "online";
                  const regionName =
                    d.regionId && regionsById.get(d.regionId) ? regionsById.get(d.regionId).name : "—";
                  const selected = selectedDeviceId === d.id;

                  return (
                    <div
                      key={d.id}
                      role="listitem"
                      tabIndex={0}
                      className={[
                        styles.deviceRow,
                        selected ? styles.deviceRowSelected : "",
                      ].join(" ")}
                      onClick={() => onSelectDevice(d.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") onSelectDevice(d.id);
                      }}
                      aria-label={`Select device ${d.name || d.id}`}
                    >
                      <div className={styles.deviceMain}>
                        <div className={styles.deviceTopLine}>
                          <div className={styles.deviceName}>{d.name || d.id}</div>
                          <Badge tone={online ? "primary" : "danger"}>{online ? "Online" : "Offline"}</Badge>
                        </div>

                        <div className={styles.deviceMeta}>
                          <span className={styles.metaPill} title="Region">
                            <span aria-hidden="true">📍</span> {regionName}
                          </span>
                          <span className={styles.metaPill} title="Last update">
                            <span aria-hidden="true">🕒</span> {formatTimeAgo(d.lastSeenAt)}
                          </span>
                        </div>
                      </div>

                      <div className={styles.deviceRight}>
                        <div className={styles.deviceSpeed} title="Speed">
                          {formatSpeed(d.speedKph)}
                        </div>
                        <div className={styles.smallMuted} title="Device id">
                          {d.id}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <Card className={styles.drawer} aria-label="Device details panel">
          <div className={styles.drawerHeader}>
            <div>
              <div className={styles.drawerTitle}>{selectedDevice ? selectedDevice.name || selectedDevice.id : "Selection"}</div>
              <div className={[styles.panelSub, "op-muted"].join(" ")}>
                {selectedDevice ? "Device details and breadcrumbs." : "Select a device to inspect live telemetry."}
              </div>
            </div>

            {selectedDevice ? (
              <Button variant="ghost" size="sm" onClick={onClearSelection} ariaLabel="Clear selection">
                Clear
              </Button>
            ) : (
              <Badge tone="secondary">Drawer</Badge>
            )}
          </div>

          <div className={styles.drawerBody}>
            {!selectedDevice ? (
              <EmptyState
                title="No device selected"
                message="Click a device in the list to see its status, last fix, and recent breadcrumb points."
                inline
              />
            ) : (
              <>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Device ID</div>
                    <div className={styles.detailValue}>{selectedDevice.id}</div>
                  </div>

                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Region</div>
                    <div className={styles.detailValue}>
                      {selectedDevice.regionId && regionsById.get(selectedDevice.regionId)
                        ? regionsById.get(selectedDevice.regionId).name
                        : "—"}
                    </div>
                  </div>

                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Speed</div>
                    <div className={styles.detailValue}>{formatSpeed(selectedDevice.speedKph)}</div>
                  </div>

                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Last fix</div>
                    <div className={styles.detailValue}>{formatTimeAgo(selectedDevice.lastSeenAt)}</div>
                  </div>

                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Status</div>
                    <div className={styles.detailValue}>
                      {normalizeOnlineStatus(selectedDevice) === "online" ? "Online" : "Offline"}
                    </div>
                  </div>

                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Battery</div>
                    <div className={styles.detailValue}>
                      {typeof selectedDevice.batteryPct === "number" ? `${Math.round(selectedDevice.batteryPct)}%` : "—"}
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 900, letterSpacing: "-0.01em" }}>Recent breadcrumbs</div>
                    <Badge tone="secondary">{selectedBreadcrumbs.length}</Badge>
                  </div>
                  <div className={styles.breadcrumbs} style={{ marginTop: 10 }}>
                    {selectedBreadcrumbs.length === 0 ? (
                      <EmptyState title="No points yet" message="Waiting for location updates for this device." inline />
                    ) : (
                      selectedBreadcrumbs
                        .slice()
                        .reverse()
                        .slice(0, 8)
                        .map((p, idx) => (
                          <div className={styles.breadcrumbRow} key={`${p.ts}-${idx}`}>
                            <div className={styles.bcLeft}>
                              <div className={styles.bcTitle}>
                                {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                              </div>
                              <div className={styles.bcSub}>
                                Speed: {typeof p.speedKph === "number" ? formatSpeed(p.speedKph) : "—"}
                              </div>
                            </div>
                            <div className={styles.bcRight}>{formatTimeAgo(p.ts)}</div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className={styles.mainArea}>
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>Map</div>
              <div className={[styles.panelSub, "op-muted"].join(" ")}>
                Placeholder map using SVG (no external API key). Shows regions + device markers + selected route.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Badge tone="secondary">{dataService.mode}</Badge>
              <Badge tone="primary">{liveMeta.source === "ws" ? "Streaming" : "Polling"}</Badge>
            </div>
          </div>

          <div className={styles.panelBody}>
            <div className={styles.mapSurface}>
              <div className={styles.mapTopBar}>
                <div>
                  <div className={styles.mapTitle}>
                    {selectedDevice ? `Tracking: ${selectedDevice.name || selectedDevice.id}` : "Fleet overview"}
                  </div>
                  <div className={styles.mapSub}>
                    Last refresh: {liveMeta.lastRefreshAt ? formatTimeAgo(liveMeta.lastRefreshAt) : "—"}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Badge tone="neutral">{regionFilter === "all" ? "All regions" : "Filtered"}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // If WS is not delivering events, this can help recover quickly.
                      refreshDevices({ silent: false });
                    }}
                    ariaLabel="Recenter / refresh"
                  >
                    Recenter
                  </Button>
                </div>
              </div>

              <div className={styles.mapCanvasWrap} aria-label="Map placeholder" role="img">
                <svg
                  className={styles.mapSvg}
                  viewBox={`0 0 ${viewport.width} ${viewport.height}`}
                  preserveAspectRatio="xMidYMid slice"
                >
                  {/* subtle grid */}
                  <defs>
                    <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
                      <path d="M 56 0 L 0 0 0 56" fill="none" stroke="rgba(17, 24, 39, 0.06)" strokeWidth="1" />
                    </pattern>
                    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="rgba(17,24,39,0.14)" />
                    </filter>
                  </defs>

                  <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="url(#grid)" />

                  {/* region tiles */}
                  {regionTiles.map((t) => (
                    <g key={t.key}>
                      <rect
                        x={t.x}
                        y={t.y}
                        width={t.w}
                        height={t.h}
                        rx="22"
                        fill="rgba(37, 99, 235, 0.10)"
                        stroke="rgba(37, 99, 235, 0.22)"
                      />
                      <path
                        d={`M ${t.x + 18} ${t.y + t.h - 20} C ${t.x + t.w * 0.35} ${t.y + t.h * 0.55}, ${
                          t.x + t.w * 0.65
                        } ${t.y + t.h * 0.95}, ${t.x + t.w - 18} ${t.y + 24}`}
                        fill="none"
                        stroke="rgba(245, 158, 11, 0.35)"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    </g>
                  ))}

                  {/* selected route breadcrumbs path */}
                  {selectedRoutePath ? (
                    <>
                      <path
                        d={selectedRoutePath}
                        fill="none"
                        stroke="rgba(245, 158, 11, 0.85)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={selectedRoutePath}
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.85)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  ) : null}

                  {/* device markers */}
                  {deviceMarkers.map((m) => {
                    const isSelected = selectedDeviceId === m.id;
                    const fill = isSelected ? "rgba(37, 99, 235, 0.95)" : m.status === "online" ? "rgba(37, 99, 235, 0.65)" : "rgba(239, 68, 68, 0.70)";
                    const stroke = isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.75)";
                    const r = isSelected ? 9 : 7;

                    return (
                      <g key={m.id} onClick={() => onSelectDevice(m.id)} style={{ cursor: "pointer" }}>
                        <circle cx={m.x} cy={m.y} r={r + 6} fill="rgba(17, 24, 39, 0.08)" />
                        <circle cx={m.x} cy={m.y} r={r + 2} fill={fill} filter={isSelected ? "url(#shadow)" : undefined} />
                        <circle cx={m.x} cy={m.y} r={r - 2} fill="rgba(255,255,255,0.9)" stroke={stroke} strokeWidth="1" />
                      </g>
                    );
                  })}
                </svg>

                <div className={styles.mapLegend} aria-label="Map legend">
                  <div className={styles.legendRow}>
                    <span className={[styles.legendSwatch, styles.legendSwatchRegion].join(" ")} aria-hidden="true" />
                    Regions (placeholder)
                  </div>
                  <div className={styles.legendRow}>
                    <span className={[styles.legendSwatch, styles.legendSwatchRoute].join(" ")} aria-hidden="true" />
                    Selected route (breadcrumbs)
                  </div>
                  <div className={styles.legendRow}>
                    <span className={[styles.legendSwatch, styles.legendSwatchSelected].join(" ")} aria-hidden="true" />
                    Selected device
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div className="op-muted" style={{ fontSize: 12, fontWeight: 600 }}>
                Updates: WS when available, otherwise polling every 5s (safety net stays on).
              </div>
              <div className="op-muted" style={{ fontSize: 12, fontWeight: 600 }}>
                Tip: Click a marker to select a device.
              </div>
            </div>
          </div>
        </Card>

        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>Live feed</div>
              <div className={[styles.panelSub, "op-muted"].join(" ")}>
                Operational events and KPI threshold alerts (next step).
              </div>
            </div>
            <Badge tone="secondary">Live</Badge>
          </div>

          <div className={styles.panelBody}>
            <div className={styles.emptyBox}>
              <div style={{ fontWeight: 900 }}>Coming soon</div>
              <div className={styles.smallMuted} style={{ marginTop: 6 }}>
                This panel will show handovers, coverage anomalies, and compliance events.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
