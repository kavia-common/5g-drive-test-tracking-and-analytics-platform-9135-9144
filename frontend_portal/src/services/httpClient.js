import { config } from "../config";

/**
 * @typedef {"NETWORK" | "TIMEOUT" | "HTTP" | "ABORTED" | "UNKNOWN"} NormalizedErrorCode
 */

/**
 * @typedef {{
 *   code: NormalizedErrorCode,
 *   message: string,
 *   status?: number,
 *   url?: string,
 *   details?: any,
 *   retriable?: boolean
 * }} NormalizedError
 */

/**
 * @typedef {{
 *   method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
 *   headers?: Record<string, string>,
 *   query?: Record<string, string | number | boolean | undefined | null>,
 *   body?: any,
 *   timeoutMs?: number,
 *   retries?: number,
 *   retryDelayMs?: number,
 *   signal?: AbortSignal,
 *   /**
 *    * Hook to provide auth headers (no real auth yet).
 *    * Useful for plugging in a token later without touching all callers.
 *    *\/
 *   getAuthHeaders?: () => Record<string, string>
 * }} RequestOptions
 */

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 450;

/**
 * @param {Record<string, string | number | boolean | undefined | null> | undefined} query
 */
function toQueryString(query) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * Normalize various fetch/HTTP errors into a stable shape for UI.
 *
 * @param {unknown} err
 * @param {{ url?: string, status?: number }} context
 * @returns {NormalizedError}
 */
function normalizeError(err, context = {}) {
  const url = context.url;
  const status = context.status;

  if (err && typeof err === "object") {
    // AbortError: thrown by fetch when aborted.
    if ("name" in err && err.name === "AbortError") {
      return {
        code: "ABORTED",
        message: "Request aborted",
        url,
        status,
        retriable: false,
      };
    }
  }

  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";

  // If we have a status, treat it as HTTP.
  if (typeof status === "number") {
    return {
      code: "HTTP",
      message,
      status,
      url,
      retriable: status >= 500 || status === 429,
      details: err,
    };
  }

  // Heuristic: timeouts throw AbortError from our internal controller; we label as TIMEOUT.
  if (typeof message === "string" && message.toLowerCase().includes("timeout")) {
    return { code: "TIMEOUT", message, url, retriable: true, details: err };
  }

  // Fetch network errors often surface as TypeError in browsers.
  if (err instanceof TypeError) {
    return {
      code: "NETWORK",
      message: message || "Network error",
      url,
      retriable: true,
      details: err,
    };
  }

  return { code: "UNKNOWN", message, url, retriable: false, details: err };
}

/**
 * Sleep helper for retry backoff.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Select API base URL:
 * - Prefer REACT_APP_API_BASE (often "/api") which can be proxied by the host.
 * - Else fall back to REACT_APP_BACKEND_URL (e.g. "http://localhost:8000").
 *
 * If apiBase is relative ("/api"), it will be used as-is.
 * If apiBase is absolute, it's used as-is.
 *
 * @returns {string}
 */
function resolveApiBase() {
  const apiBase = (config.apiBase || "").trim();
  if (apiBase) return apiBase;

  const backendUrl = (config.backendUrl || "").trim();
  return backendUrl || "/api";
}

/**
 * Join base + path safely without double slashes.
 * @param {string} base
 * @param {string} path
 */
function joinUrl(base, path) {
  if (!path) return base;
  // If path is absolute URL, return it.
  if (/^https?:\/\//i.test(path)) return path;

  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * PUBLIC_INTERFACE
 * Create a lightweight REST client with sane defaults (JSON, retries, timeout, error normalization).
 *
 * @param {{
 *  baseUrl?: string,
 *  getAuthHeaders?: () => Record<string, string>
 * }} [opts]
 * @returns {{
 *  requestJson: <T=any>(path: string, options?: RequestOptions) => Promise<T>,
 *  getJson: <T=any>(path: string, options?: Omit<RequestOptions, "method" | "body">) => Promise<T>,
 *  postJson: <T=any>(path: string, body?: any, options?: Omit<RequestOptions, "method" | "body">) => Promise<T>,
 *  uploadFormData: <T=any>(path: string, formData: FormData, options?: Omit<RequestOptions, "method" | "body">) => Promise<T>
 * }}
 */
export function createRestClient(opts = {}) {
  const baseUrl = (opts.baseUrl || resolveApiBase()).trim();
  const getAuthHeaders = opts.getAuthHeaders;

  /**
   * @template T
   * @param {string} path
   * @param {RequestOptions} [options]
   * @returns {Promise<T>}
   */
  async function requestJson(path, options = {}) {
    const {
      method = "GET",
      headers = {},
      query,
      body,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      retries = DEFAULT_RETRIES,
      retryDelayMs = DEFAULT_RETRY_DELAY_MS,
      signal,
      getAuthHeaders: perRequestAuthHeaders,
    } = options;

    const url = joinUrl(baseUrl, path) + toQueryString(query);

    let attempt = 0;
    /** @type {unknown} */
    let lastErr;

    while (attempt <= retries) {
      attempt += 1;

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        // AbortController triggers AbortError; we add a hint for our normalizer.
        controller.abort(new Error("timeout"));
      }, timeoutMs);

      const combinedSignal = (() => {
        if (!signal) return controller.signal;

        // Combine abort signals by proxying. (Simple, avoids external deps.)
        const proxy = new AbortController();
        const onAbort = () => proxy.abort(signal.reason || new Error("aborted"));
        signal.addEventListener("abort", onAbort, { once: true });
        controller.signal.addEventListener(
          "abort",
          () => proxy.abort(controller.signal.reason || new Error("aborted")),
          { once: true }
        );
        return proxy.signal;
      })();

      try {
        const authHeaders =
          (perRequestAuthHeaders && perRequestAuthHeaders()) ||
          (getAuthHeaders && getAuthHeaders()) ||
          {};

        const hasBody = body !== undefined && body !== null && method !== "GET";
        const finalHeaders = {
          Accept: "application/json",
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...authHeaders,
          ...headers,
        };

        const resp = await fetch(url, {
          method,
          headers: finalHeaders,
          body: hasBody ? JSON.stringify(body) : undefined,
          signal: combinedSignal,
        });

        // Try to parse JSON for both ok and error responses.
        let payload;
        const ct = resp.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          try {
            payload = await resp.json();
          } catch {
            payload = undefined;
          }
        } else {
          // Best-effort text for debugging.
          try {
            payload = await resp.text();
          } catch {
            payload = undefined;
          }
        }

        if (!resp.ok) {
          const err = normalizeError(
            {
              message:
                (payload && payload.message) ||
                `HTTP ${resp.status} (${resp.statusText})`,
              payload,
            },
            { url, status: resp.status }
          );

          // Retry only on retriable errors.
          if (attempt <= retries && err.retriable) {
            await sleep(retryDelayMs * attempt);
            continue;
          }
          throw err;
        }

        return /** @type {T} */ (payload);
      } catch (err) {
        lastErr = err;

        const normalized =
          err && typeof err === "object" && "code" in err
            ? /** @type {NormalizedError} */ (err)
            : normalizeError(err, { url });

        const canRetry =
          attempt <= retries && (normalized.retriable || normalized.code === "NETWORK");

        if (canRetry) {
          await sleep(retryDelayMs * attempt);
          continue;
        }

        throw normalized;
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    throw normalizeError(lastErr, { url });
  }

  /**
   * @template T
   * @param {string} path
   * @param {Omit<RequestOptions, "method" | "body">} [options]
   * @returns {Promise<T>}
   */
  function getJson(path, options) {
    return requestJson(path, { ...(options || {}), method: "GET" });
  }

  /**
   * @template T
   * @param {string} path
   * @param {any} body
   * @param {Omit<RequestOptions, "method" | "body">} [options]
   * @returns {Promise<T>}
   */
  function postJson(path, body, options) {
    return requestJson(path, { ...(options || {}), method: "POST", body });
  }

  /**
   * Upload using FormData.
   * Note: Fetch does not provide upload progress; we use XHR in DataService for progress callbacks.
   *
   * @template T
   * @param {string} path
   * @param {FormData} formData
   * @param {Omit<RequestOptions, "method" | "body">} [options]
   * @returns {Promise<T>}
   */
  async function uploadFormData(path, formData, options = {}) {
    const { headers = {} } = options;
    const url = joinUrl(baseUrl, path) + toQueryString(options.query);

    try {
      const authHeaders = (getAuthHeaders && getAuthHeaders()) || {};
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...authHeaders,
          ...headers,
          // DO NOT set Content-Type; browser will set multipart boundary.
        },
        body: formData,
      });

      const payload = await resp.json().catch(() => undefined);
      if (!resp.ok) {
        throw normalizeError(
          { message: (payload && payload.message) || "Upload failed", payload },
          { url, status: resp.status }
        );
      }
      return /** @type {T} */ (payload);
    } catch (err) {
      throw normalizeError(err, { url });
    }
  }

  return { requestJson, getJson, postJson, uploadFormData };
}
