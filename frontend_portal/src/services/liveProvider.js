import { config, logger } from "../config";
import { createRestClient } from "./httpClient";
import { createWebSocketClient } from "./wsClient";

/**
 * Live provider endpoints (conservative defaults).
 * These are intentionally simple and can be adapted once backend routes are known.
 */
const ENDPOINTS = {
  devices: "/devices",
  regions: "/regions",
  analyticsSummary: "/analytics/summary",
  routeProgress: "/routes/progress",
  uploads: "/uploads/logs",
};

/**
 * Upload with progress uses XHR; this helper normalizes response + errors.
 * @param {string} url
 * @param {FormData} formData
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<any>}
 */
function xhrUpload(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.responseType = "json";
    xhr.setRequestHeader("Accept", "application/json");

    xhr.upload.onprogress = (evt) => {
      if (!onProgress) return;
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      onProgress(pct);
    };

    xhr.onerror = () => reject({ code: "NETWORK", message: "Network error", url, retriable: true });
    xhr.onabort = () => reject({ code: "ABORTED", message: "Upload aborted", url, retriable: false });
    xhr.ontimeout = () => reject({ code: "TIMEOUT", message: "Upload timeout", url, retriable: true });

    xhr.onload = () => {
      const status = xhr.status;
      const payload = xhr.response;

      if (status >= 200 && status < 300) {
        resolve(payload);
      } else {
        reject({
          code: "HTTP",
          message: (payload && payload.message) || `HTTP ${status}`,
          status,
          url,
          payload,
          retriable: status >= 500 || status === 429,
        });
      }
    };

    xhr.send(formData);
  });
}

/**
 * PUBLIC_INTERFACE
 * Live provider that mirrors DataService method signatures.
 *
 * Uses:
 * - REST: config.apiBase or config.backendUrl
 * - WS: config.wsUrl
 *
 * @returns {{
 *  getDevices: () => Promise<any>,
 *  getRegions: () => Promise<any>,
 *  getAnalyticsSummary: () => Promise<any>,
 *  getRouteProgress: () => Promise<any>,
 *  uploadLogs: (files: File[], onProgress?: (pct: number) => void) => Promise<any>,
 *  subscribeToDeviceUpdates: (callback: (event: any) => void) => void,
 *  unsubscribe: () => void
 * }}
 */
export function createLiveProvider() {
  // No real auth yet; placeholder for future token integration.
  const rest = createRestClient({
    getAuthHeaders: () => ({}),
  });

  const ws = createWebSocketClient({
    url: config.wsUrl,
    reconnect: true,
  });

  /** @type {null | (() => void)} */
  let unsubWs = null;

  async function getDevices() {
    return rest.getJson(ENDPOINTS.devices);
  }

  async function getRegions() {
    return rest.getJson(ENDPOINTS.regions);
  }

  async function getAnalyticsSummary() {
    return rest.getJson(ENDPOINTS.analyticsSummary);
  }

  async function getRouteProgress() {
    return rest.getJson(ENDPOINTS.routeProgress);
  }

  async function uploadLogs(files, onProgress) {
    // Use apiBase/backendUrl logic from rest client.
    // We reconstruct the resolved base by making a request URL through the rest client’s base resolution.
    // Simpler: rely on config.apiBase (relative) else config.backendUrl.
    const base = (config.apiBase || config.backendUrl || "").trim() || "/api";
    const baseNormalized = base.endsWith("/") ? base.slice(0, -1) : base;
    const url = `${baseNormalized}${ENDPOINTS.uploads.startsWith("/") ? "" : "/"}${ENDPOINTS.uploads}`;

    const fd = new FormData();
    files.forEach((f) => fd.append("files", f, f.name));

    return xhrUpload(url, fd, onProgress);
  }

  function subscribeToDeviceUpdates(callback) {
    ws.connect();

    // Expecting server to send JSON: {type:"device:update", data:{...}}
    unsubWs = ws.subscribe((evt) => {
      if (evt.type === "device:update") {
        callback({ type: "device:update", device: evt.data, ts: evt.ts });
      } else if (evt.type === "open") {
        logger.debug("[ws] open");
      }
    });
  }

  function unsubscribe() {
    if (unsubWs) unsubWs();
    unsubWs = null;
    ws.close();
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
