import { config, logger } from "../config";

/**
 * @typedef {{
 *  type: string,
 *  data?: any,
 *  ts?: string
 * }} WsEvent
 */

/**
 * @typedef {{
 *  url?: string,
 *  reconnect?: boolean,
 *  reconnectBaseDelayMs?: number,
 *  reconnectMaxDelayMs?: number
 * }} WsClientOptions
 */

/**
 * PUBLIC_INTERFACE
 * Create a lightweight WebSocket client with:
 * - auto reconnect (exponential-ish backoff)
 * - event dispatching to subscribers
 * - JSON message handling (best-effort)
 *
 * @param {WsClientOptions} [opts]
 * @returns {{
 *  connect: () => void,
 *  close: () => void,
 *  send: (msg: any) => void,
 *  subscribe: (cb: (event: WsEvent) => void) => () => void,
 *  getState: () => ({ connected: boolean, url: string })
 * }}
 */
export function createWebSocketClient(opts = {}) {
  const url = (opts.url || config.wsUrl || "").trim();
  const reconnect = opts.reconnect !== false;
  const baseDelay = opts.reconnectBaseDelayMs ?? 700;
  const maxDelay = opts.reconnectMaxDelayMs ?? 10_000;

  /** @type {WebSocket | null} */
  let ws = null;
  let connected = false;

  /** @type {Set<(event: WsEvent) => void>} */
  const listeners = new Set();

  let shouldReconnect = reconnect;
  let reconnectAttempt = 0;
  /** @type {number | null} */
  let reconnectTimer = null;

  function emit(event) {
    for (const cb of listeners) {
      try {
        cb(event);
      } catch (e) {
        logger.warn("[ws] listener threw", e);
      }
    }
  }

  function scheduleReconnect() {
    if (!shouldReconnect) return;
    if (reconnectTimer) return;

    reconnectAttempt += 1;
    const delay = Math.min(maxDelay, baseDelay * (1 + reconnectAttempt));
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function clearReconnectTimer() {
    if (!reconnectTimer) return;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function connect() {
    if (!url) {
      logger.warn("[ws] No wsUrl configured; skipping connect.");
      return;
    }
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    clearReconnectTimer();

    try {
      ws = new WebSocket(url);
    } catch (e) {
      emit({ type: "error", data: { message: "Failed to create WebSocket", error: String(e) } });
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connected = true;
      reconnectAttempt = 0;
      emit({ type: "open", ts: new Date().toISOString() });
    };

    ws.onmessage = (evt) => {
      const raw = evt.data;
      /** @type {WsEvent} */
      let message = { type: "message", data: raw, ts: new Date().toISOString() };

      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            message = {
              type: parsed.type || "message",
              data: parsed.data ?? parsed,
              ts: parsed.ts || new Date().toISOString(),
            };
          }
        } catch {
          // ignore parse failures; keep as string
        }
      }

      emit(message);
    };

    ws.onerror = () => {
      emit({ type: "error", ts: new Date().toISOString() });
    };

    ws.onclose = () => {
      connected = false;
      emit({ type: "close", ts: new Date().toISOString() });
      if (shouldReconnect) scheduleReconnect();
    };
  }

  function close() {
    shouldReconnect = false;
    clearReconnectTimer();
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    ws = null;
    connected = false;
  }

  function send(msg) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
    } catch (e) {
      logger.warn("[ws] send failed", e);
    }
  }

  function subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function getState() {
    return { connected, url };
  }

  return { connect, close, send, subscribe, getState };
}
