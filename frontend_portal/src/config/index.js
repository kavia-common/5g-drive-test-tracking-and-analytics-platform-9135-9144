const LOG_LEVELS = /** @type {const} */ ({
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
});

/**
 * Convert unknown values into a string, else return undefined.
 * @param {unknown} value
 * @returns {string | undefined}
 */
function asOptionalString(value) {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return undefined;
}

/**
 * Best-effort parse of feature flags from env.
 * Supports:
 *  - comma list: "a,b,c"
 *  - JSON array: ["a","b"]
 *  - JSON object: {"a":true,"b":false}
 *
 * @param {string | undefined} raw
 * @returns {{ list: string[], map: Record<string, boolean> }}
 */
function parseFeatureFlags(raw) {
  const cleaned = (raw ?? "").trim();
  if (!cleaned) return { list: [], map: {} };

  // JSON array / object
  if (cleaned.startsWith("[") || cleaned.startsWith("{")) {
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        const list = parsed
          .filter((v) => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean);
        const map = Object.fromEntries(list.map((k) => [k, true]));
        return { list, map };
      }
      if (parsed && typeof parsed === "object") {
        /** @type {Record<string, boolean>} */
        const map = {};
        for (const [k, v] of Object.entries(parsed)) {
          map[String(k)] = Boolean(v);
        }
        const list = Object.keys(map).filter((k) => map[k]);
        return { list, map };
      }
    } catch (e) {
      // Fall through to comma parsing.
    }
  }

  // Comma list
  const list = cleaned
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const map = Object.fromEntries(list.map((k) => [k, true]));
  return { list, map };
}

/**
 * Determine the current runtime node environment as best as possible.
 * CRA provides NODE_ENV at build/runtime; we also allow REACT_APP_NODE_ENV override.
 *
 * @returns {"development" | "test" | "production"}
 */
function resolveNodeEnv() {
  const override = asOptionalString(process.env.REACT_APP_NODE_ENV);
  const env = override || process.env.NODE_ENV || "development";
  if (env === "production" || env === "test" || env === "development") return env;
  return "development";
}

/**
 * Resolve a normalized log level string.
 *
 * @param {string | undefined} raw
 * @returns {keyof typeof LOG_LEVELS}
 */
function resolveLogLevel(raw) {
  const v = (raw ?? "").toLowerCase().trim();
  if (v in LOG_LEVELS) return /** @type {keyof typeof LOG_LEVELS} */ (v);

  // numeric levels also acceptable
  const n = Number(v);
  if (!Number.isNaN(n)) {
    if (n <= 0) return "silent";
    if (n === 1) return "error";
    if (n === 2) return "warn";
    if (n === 3) return "info";
    return "debug";
  }

  return "info";
}

/**
 * Only warn once per key to avoid console noise.
 * @type {Set<string>}
 */
const warnedKeys = new Set();

/**
 * @param {string} key
 * @param {string} message
 */
function warnOnce(key, message) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  // eslint-disable-next-line no-console
  console.warn(message);
}

/**
 * Create a tiny logger that respects the chosen log level.
 *
 * @param {keyof typeof LOG_LEVELS} level
 */
function createLogger(level) {
  const threshold = LOG_LEVELS[level] ?? LOG_LEVELS.info;

  return {
    level,

    /** @param  {...any} args */
    error: (...args) => {
      if (threshold >= LOG_LEVELS.error) {
        // eslint-disable-next-line no-console
        console.error(...args);
      }
    },

    /** @param  {...any} args */
    warn: (...args) => {
      if (threshold >= LOG_LEVELS.warn) {
        // eslint-disable-next-line no-console
        console.warn(...args);
      }
    },

    /** @param  {...any} args */
    info: (...args) => {
      if (threshold >= LOG_LEVELS.info) {
        // eslint-disable-next-line no-console
        console.info(...args);
      }
    },

    /** @param  {...any} args */
    debug: (...args) => {
      if (threshold >= LOG_LEVELS.debug) {
        // eslint-disable-next-line no-console
        console.debug(...args);
      }
    },
  };
}

/**
 * Build runtime config from process.env with sensible defaults.
 *
 * NOTE: CRA only exposes env vars prefixed with REACT_APP_ to the browser bundle.
 *
 * @returns {{
 *   apiBase: string,
 *   backendUrl: string,
 *   wsUrl: string,
 *   nodeEnv: "development" | "test" | "production",
 *   featureFlagsRaw: string,
 *   featureFlags: { list: string[], map: Record<string, boolean> },
 *   logLevel: keyof typeof LOG_LEVELS
 * }}
 */
function buildConfig() {
  const nodeEnv = resolveNodeEnv();

  // Defaults are intentionally conservative so the app can boot even without env.
  const apiBase = asOptionalString(process.env.REACT_APP_API_BASE) || "/api";
  const backendUrl =
    asOptionalString(process.env.REACT_APP_BACKEND_URL) || "http://localhost:8000";
  const wsUrl = asOptionalString(process.env.REACT_APP_WS_URL) || "ws://localhost:8000/ws";

  const featureFlagsRaw = asOptionalString(process.env.REACT_APP_FEATURE_FLAGS) || "";
  const featureFlags = parseFeatureFlags(featureFlagsRaw);

  const logLevel = resolveLogLevel(asOptionalString(process.env.REACT_APP_LOG_LEVEL));

  // Basic validation: warn in dev/test only; avoid noisy logs in production.
  if (nodeEnv !== "production") {
    if (!asOptionalString(process.env.REACT_APP_BACKEND_URL)) {
      warnOnce(
        "REACT_APP_BACKEND_URL",
        "[config] REACT_APP_BACKEND_URL is not set; defaulting to http://localhost:8000"
      );
    }
    if (!asOptionalString(process.env.REACT_APP_WS_URL)) {
      warnOnce(
        "REACT_APP_WS_URL",
        "[config] REACT_APP_WS_URL is not set; defaulting to ws://localhost:8000/ws"
      );
    }
  }

  return {
    apiBase,
    backendUrl,
    wsUrl,
    nodeEnv,
    featureFlagsRaw,
    featureFlags,
    logLevel,
  };
}

/**
 * The singleton runtime config object.
 * @type {ReturnType<typeof buildConfig>}
 */
export const config = buildConfig();

/**
 * Logger singleton using configured log level.
 */
export const logger = createLogger(config.logLevel);

/**
 * PUBLIC_INTERFACE
 * Returns true if a feature flag is enabled.
 *
 * @param {string} flagName - Feature flag key (case-sensitive).
 * @returns {boolean} True when enabled.
 */
export function isFeatureEnabled(flagName) {
  if (!flagName) return false;
  return Boolean(config.featureFlags.map[flagName]);
}

/**
 * PUBLIC_INTERFACE
 * Returns a shallow-safe snapshot of config suitable for logging.
 * (Avoids dumping large objects; keeps it stable for future extensions.)
 *
 * @returns {{ apiBase: string, backendUrl: string, wsUrl: string, nodeEnv: string, logLevel: string, featureFlags: string[] }}
 */
export function getPublicConfigSnapshot() {
  return {
    apiBase: config.apiBase,
    backendUrl: config.backendUrl,
    wsUrl: config.wsUrl,
    nodeEnv: config.nodeEnv,
    logLevel: config.logLevel,
    featureFlags: config.featureFlags.list,
  };
}
