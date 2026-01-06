import { config, isFeatureEnabled, logger } from "../config";
import { createMockProvider } from "./mockProvider";
import { createLiveProvider } from "./liveProvider";

/**
 * Flags:
 * - data.mock: force mock provider
 * - data.live: force live provider
 *
 * If neither is set:
 * - default to mock in development
 * - default to live in production
 *
 * @returns {"mock" | "live"}
 */
function resolveDataMode() {
  if (isFeatureEnabled("data.mock")) return "mock";
  if (isFeatureEnabled("data.live")) return "live";
  return config.nodeEnv === "production" ? "live" : "mock";
}

/**
 * PUBLIC_INTERFACE
 * Singleton-ish DataService: a unified data layer surface for the app.
 *
 * Methods:
 * - getDevices()
 * - getRegions()
 * - getAnalyticsSummary()
 * - getRouteProgress()
 * - uploadLogs(files, onProgress)
 * - subscribeToDeviceUpdates(callback)
 * - unsubscribe()
 *
 * @returns {{
 *  mode: "mock" | "live",
 *  getDevices: () => Promise<any>,
 *  getRegions: () => Promise<any>,
 *  getAnalyticsSummary: () => Promise<any>,
 *  getRouteProgress: () => Promise<any>,
 *  uploadLogs: (files: File[], onProgress?: (pct: number) => void) => Promise<any>,
 *  subscribeToDeviceUpdates: (callback: (event: any) => void) => void,
 *  unsubscribe: () => void
 * }}
 */
export function createDataService() {
  const mode = resolveDataMode();
  const provider = mode === "live" ? createLiveProvider() : createMockProvider();

  // One-time log on creation to make mode selection explicit.
  logger.info(`[data] mode=${mode} (nodeEnv=${config.nodeEnv})`);

  return {
    mode,
    getDevices: provider.getDevices,
    getRegions: provider.getRegions,
    getAnalyticsSummary: provider.getAnalyticsSummary,
    getRouteProgress: provider.getRouteProgress,
    uploadLogs: provider.uploadLogs,
    subscribeToDeviceUpdates: provider.subscribeToDeviceUpdates,
    unsubscribe: provider.unsubscribe,
  };
}

/**
 * PUBLIC_INTERFACE
 * Shared DataService instance for convenience.
 * Import { dataService } anywhere in the app.
 */
export const dataService = createDataService();
