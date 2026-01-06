import { logger } from "../config";

/**
 * @typedef {{
 *  id: string,
 *  name: string,
 *  regionId: string,
 *  status: "online" | "offline" | "driving" | "idle",
 *  lastSeenAt: string,
 *  lat: number,
 *  lng: number,
 *  speedKph: number,
 *  rsrpDbm: number,
 *  sinrDb: number,
 *  routeId?: string
 * }} Device
 */

/**
 * @typedef {{
 *  id: string,
 *  name: string,
 *  code: string
 * }} Region
 */

/**
 * @typedef {{
 *  period: string,
 *  generatedAt: string,
 *  totalUploads: number,
 *  activeDevices: number,
 *  avgDownlinkMbps: number,
 *  avgUplinkMbps: number,
 *  p95LatencyMs: number,
 *  coverageScore: number
 * }} AnalyticsSummary
 */

/**
 * @typedef {{
 *  routeId: string,
 *  routeName: string,
 *  regionId: string,
 *  updatedAt: string,
 *  percentComplete: number,
 *  segments: Array<{ segmentId: string, name: string, percent: number, status: "good" | "warning" | "bad" }>
 * }} RouteProgress
 */

/**
 * @typedef {{
 *  id: string,
 *  filename: string,
 *  uploadedAt: string,
 *  status: "queued" | "processing" | "complete" | "failed",
 *  warnings: number
 * }} RecentUpload
 */

function isoMinutesAgo(mins) {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

const REGIONS = /** @type {Region[]} */ ([
  { id: "r-na", name: "North America", code: "NA" },
  { id: "r-eu", name: "Europe", code: "EU" },
  { id: "r-apac", name: "APAC", code: "APAC" },
]);

/**
 * Base seed devices; positions get slightly jittered for "status updates".
 * @type {Device[]}
 */
const DEVICES_SEED = [
  {
    id: "dev-001",
    name: "DriveKit-001",
    regionId: "r-na",
    status: "driving",
    lastSeenAt: isoMinutesAgo(1),
    lat: 37.775,
    lng: -122.418,
    speedKph: 46,
    rsrpDbm: -92,
    sinrDb: 18,
    routeId: "route-sf-01",
  },
  {
    id: "dev-002",
    name: "DriveKit-002",
    regionId: "r-na",
    status: "idle",
    lastSeenAt: isoMinutesAgo(4),
    lat: 37.764,
    lng: -122.431,
    speedKph: 0,
    rsrpDbm: -98,
    sinrDb: 12,
    routeId: "route-sf-01",
  },
  {
    id: "dev-101",
    name: "Probe-101",
    regionId: "r-eu",
    status: "online",
    lastSeenAt: isoMinutesAgo(2),
    lat: 52.5207,
    lng: 13.405,
    speedKph: 12,
    rsrpDbm: -90,
    sinrDb: 20,
    routeId: "route-ber-02",
  },
  {
    id: "dev-202",
    name: "Probe-202",
    regionId: "r-apac",
    status: "offline",
    lastSeenAt: isoMinutesAgo(37),
    lat: 35.6762,
    lng: 139.6503,
    speedKph: 0,
    rsrpDbm: -110,
    sinrDb: 2,
    routeId: "route-tok-03",
  },
];

const ROUTE_PROGRESS = /** @type {RouteProgress} */ ({
  routeId: "route-sf-01",
  routeName: "SF Downtown Loop",
  regionId: "r-na",
  updatedAt: new Date().toISOString(),
  percentComplete: 62,
  segments: [
    { segmentId: "seg-1", name: "Market St", percent: 90, status: "good" },
    { segmentId: "seg-2", name: "Embarcadero", percent: 70, status: "warning" },
    { segmentId: "seg-3", name: "SoMa", percent: 45, status: "good" },
    { segmentId: "seg-4", name: "Mission", percent: 20, status: "bad" },
  ],
});

const RECENT_UPLOADS = /** @type {RecentUpload[]} */ ([
  {
    id: "upl-9001",
    filename: "TEMS_SF_2026-01-02.zip",
    uploadedAt: isoMinutesAgo(35),
    status: "complete",
    warnings: 2,
  },
  {
    id: "upl-9002",
    filename: "TEMS_BER_2026-01-02.zip",
    uploadedAt: isoMinutesAgo(78),
    status: "processing",
    warnings: 0,
  },
  {
    id: "upl-9003",
    filename: "TEMS_TOK_2026-01-01.zip",
    uploadedAt: isoMinutesAgo(180),
    status: "failed",
    warnings: 5,
  },
]);

/**
 * PUBLIC_INTERFACE
 * Mock provider that mirrors DataService method signatures.
 * Suitable for local development without a backend.
 *
 * @returns {{
 *  getDevices: () => Promise<Device[]>,
 *  getRegions: () => Promise<Region[]>,
 *  getAnalyticsSummary: () => Promise<AnalyticsSummary>,
 *  getRouteProgress: () => Promise<RouteProgress>,
 *  uploadLogs: (files: File[], onProgress?: (pct: number) => void) => Promise<{ uploaded: number, recentUploads: RecentUpload[] }>,
 *  subscribeToDeviceUpdates: (callback: (event: { type: "device:update", device: Device, ts: string }) => void) => void,
 *  unsubscribe: () => void
 * }}
 */
export function createMockProvider() {
  /** @type {number | null} */
  let intervalId = null;

  /** @type {Set<(event: any) => void>} */
  const subs = new Set();

  async function getDevices() {
    // Return a stable copy with realistic timestamps.
    return DEVICES_SEED.map((d) => ({ ...d, lastSeenAt: d.status === "offline" ? d.lastSeenAt : isoMinutesAgo(1) }));
  }

  async function getRegions() {
    return REGIONS.slice();
  }

  async function getAnalyticsSummary() {
    return {
      period: "last_24h",
      generatedAt: new Date().toISOString(),
      totalUploads: 38,
      activeDevices: DEVICES_SEED.filter((d) => d.status !== "offline").length,
      avgDownlinkMbps: 412.6,
      avgUplinkMbps: 58.3,
      p95LatencyMs: 34,
      coverageScore: 92.4,
    };
  }

  async function getRouteProgress() {
    return { ...ROUTE_PROGRESS, updatedAt: new Date().toISOString() };
  }

  async function uploadLogs(files, onProgress) {
    // Simulate progress over ~1.2s
    const totalSteps = 6;
    for (let i = 1; i <= totalSteps; i += 1) {
      await new Promise((r) => setTimeout(r, 200));
      if (onProgress) onProgress(Math.round((i / totalSteps) * 100));
    }

    const now = new Date().toISOString();
    const newItems = files.map((f, idx) => ({
      id: `upl-${9100 + idx}`,
      filename: f.name,
      uploadedAt: now,
      status: "queued",
      warnings: 0,
    }));

    return {
      uploaded: files.length,
      recentUploads: [...newItems, ...RECENT_UPLOADS].slice(0, 8),
    };
  }

  function startEmittingUpdates() {
    if (intervalId) return;
    intervalId = window.setInterval(() => {
      // Pick a device and jitter location/metrics a little.
      const pick = DEVICES_SEED[Math.floor(Math.random() * DEVICES_SEED.length)];
      const jitterLat = (Math.random() - 0.5) * 0.002;
      const jitterLng = (Math.random() - 0.5) * 0.002;

      const next = {
        ...pick,
        status: pick.status === "offline" ? "offline" : pick.status,
        lastSeenAt: pick.status === "offline" ? pick.lastSeenAt : new Date().toISOString(),
        lat: clamp(pick.lat + jitterLat, -90, 90),
        lng: clamp(pick.lng + jitterLng, -180, 180),
        speedKph: pick.status === "driving" ? clamp(pick.speedKph + (Math.random() - 0.5) * 8, 0, 120) : pick.speedKph,
        rsrpDbm: clamp(pick.rsrpDbm + (Math.random() - 0.5) * 4, -125, -65),
        sinrDb: clamp(pick.sinrDb + (Math.random() - 0.5) * 3, -5, 30),
      };

      const evt = { type: "device:update", device: next, ts: new Date().toISOString() };
      for (const cb of subs) cb(evt);
    }, 1500);

    logger.debug("[mock] device updates started");
  }

  function stopEmittingUpdates() {
    if (!intervalId) return;
    window.clearInterval(intervalId);
    intervalId = null;
    logger.debug("[mock] device updates stopped");
  }

  function subscribeToDeviceUpdates(callback) {
    subs.add(callback);
    startEmittingUpdates();
  }

  function unsubscribe() {
    subs.clear();
    stopEmittingUpdates();
  }

  return {
    getDevices,
    getRegions,
    getAnalyticsSummary,
    getRouteProgress,
    uploadLogs,
    subscribeToDeviceUpdates,
    unsubscribe,
  };
}
