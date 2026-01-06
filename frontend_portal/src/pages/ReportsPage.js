import React, { useEffect, useMemo, useState } from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { dataService } from "../services";
import { logger } from "../config";
import styles from "./ReportsPage.module.css";
import { ErrorState, LoadingState } from "../components/ui/States";

/**
 * @typedef {{
 *  routeId?: string,
 *  routeName?: string,
 *  regionId?: string,
 *  updatedAt?: string,
 *  percentComplete?: number,
 *  segments?: Array<{ segmentId?: string, name?: string, percent?: number, status?: "good" | "warning" | "bad" }>
 * }} RouteProgress
 */

/**
 * @typedef {{
 *  period?: string,
 *  generatedAt?: string,
 *  totalUploads?: number,
 *  activeDevices?: number,
 *  avgDownlinkMbps?: number,
 *  avgUplinkMbps?: number,
 *  p95LatencyMs?: number,
 *  coverageScore?: number
 * }} AnalyticsSummary
 */

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function asNumber(v) {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  return null;
}

/**
 * @param {string | undefined} iso
 * @returns {string}
 */
function formatIsoAsLocal(iso) {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

/**
 * @param {number | null} v
 * @param {number} [digits]
 * @returns {string}
 */
function fmt(v, digits = 0) {
  if (v === null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/**
 * Generate a small "report table" dataset suitable for preview/export, derived from
 * analytics summary and route progress (keeps the page meaningful even with minimal backend endpoints).
 *
 * @param {AnalyticsSummary | null} summary
 * @param {RouteProgress | null} route
 * @returns {Array<{ metric: string, value: string, target: string, status: "pass" | "warn" | "fail", note: string }>}
 */
function buildReportMetrics(summary, route) {
  const dl = asNumber(summary?.avgDownlinkMbps);
  const ul = asNumber(summary?.avgUplinkMbps);
  const lat = asNumber(summary?.p95LatencyMs);
  const cov = asNumber(summary?.coverageScore);
  const routePct = asNumber(route?.percentComplete);

  const rows = [
    {
      metric: "Average downlink",
      value: dl === null ? "—" : `${fmt(dl, 1)} Mbps`,
      target: ">= 350 Mbps",
      status: dl !== null && dl >= 350 ? "pass" : dl !== null && dl >= 300 ? "warn" : "fail",
      note: "Aggregated from summary endpoint",
    },
    {
      metric: "Average uplink",
      value: ul === null ? "—" : `${fmt(ul, 1)} Mbps`,
      target: ">= 45 Mbps",
      status: ul !== null && ul >= 45 ? "pass" : ul !== null && ul >= 35 ? "warn" : "fail",
      note: "Aggregated from summary endpoint",
    },
    {
      metric: "P95 latency",
      value: lat === null ? "—" : `${fmt(lat, 0)} ms`,
      target: "<= 45 ms",
      status: lat !== null && lat <= 45 ? "pass" : lat !== null && lat <= 65 ? "warn" : "fail",
      note: "Operational responsiveness",
    },
    {
      metric: "Coverage score",
      value: cov === null ? "—" : `${fmt(cov, 1)}%`,
      target: ">= 90%",
      status: cov !== null && cov >= 90 ? "pass" : cov !== null && cov >= 85 ? "warn" : "fail",
      note: "Derived quality summary",
    },
    {
      metric: "Route completion",
      value: routePct === null ? "—" : `${fmt(routePct, 0)}%`,
      target: ">= 75%",
      status: routePct !== null && routePct >= 75 ? "pass" : routePct !== null && routePct >= 55 ? "warn" : "fail",
      note: route?.routeName ? `Route: ${route.routeName}` : "From route progress endpoint",
    },
  ];

  return rows;
}

/**
 * Minimal SVG bar chart of segment completion.
 * @param {{
 *  width: number,
 *  height: number,
 *  segments: Array<{ name: string, percent: number, status: string }>,
 * }} props
 * @returns {JSX.Element}
 */
function SegmentBarChartSvg({ width, height, segments }) {
  const pad = 18;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const maxBars = Math.min(8, segments.length);
  const bars = segments.slice(0, maxBars);
  const barGap = 10;
  const barW = (innerW - barGap * (maxBars - 1)) / Math.max(1, maxBars);

  const y0 = pad + innerH;
  const maxV = 100;

  const colorFor = (status) => {
    if (status === "bad") return "rgba(239, 68, 68, 0.80)";
    if (status === "warning") return "rgba(245, 158, 11, 0.85)";
    return "rgba(37, 99, 235, 0.75)";
  };

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Segment completion chart">
      <defs>
        <pattern id="grid-reports" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M 56 0 L 0 0 0 56" fill="none" stroke="rgba(17, 24, 39, 0.06)" strokeWidth="1" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={width} height={height} fill="url(#grid-reports)" />
      <line x1={pad} y1={y0} x2={width - pad} y2={y0} stroke="rgba(17, 24, 39, 0.12)" />

      {bars.map((b, i) => {
        const x = pad + i * (barW + barGap);
        const h = (Math.max(0, Math.min(100, b.percent)) / maxV) * (innerH - 26);
        const y = y0 - h;
        return (
          <g key={`${b.name}-${i}`}>
            <rect x={x} y={y} width={barW} height={h} rx="12" fill={colorFor(b.status)} />
            <text
              x={x + barW / 2}
              y={y - 6}
              textAnchor="middle"
              fontSize="10"
              fill="rgba(17, 24, 39, 0.60)"
              fontWeight="800"
            >
              {Math.round(b.percent)}%
            </text>
            <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="rgba(17, 24, 39, 0.55)">
              {b.name.length > 10 ? `${b.name.slice(0, 10)}…` : b.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * PUBLIC_INTERFACE
 * ReportsPage provides operational reporting views (demo):
 * - report preset selector (weekly, route, compliance)
 * - route progress breakdown (segments + bar chart)
 * - KPI evaluation table suitable for export
 *
 * No heavy chart deps; uses lightweight SVG.
 *
 * @returns {JSX.Element}
 */
export default function ReportsPage() {
  const [reportPreset, setReportPreset] = useState("weekly_ops");
  const [regions, setRegions] = useState(/** @type {Array<{id: string, name: string, code?: string}>} */ ([]));
  const [regionId, setRegionId] = useState("all");

  const [summary, setSummary] = useState(/** @type {AnalyticsSummary | null} */ (null));
  const [routeProgress, setRouteProgress] = useState(/** @type {RouteProgress | null} */ (null));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {null | { message: string }} */ (null));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [regionsResp, summaryResp, routeResp] = await Promise.all([
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

        setRegions(regionList);
        setSummary(summaryResp && typeof summaryResp === "object" ? summaryResp : null);
        setRouteProgress(routeResp && typeof routeResp === "object" ? routeResp : null);
      } catch (e) {
        const message =
          e && typeof e === "object" && "message" in e ? String(e.message) : "Failed to load reports";
        setError({ message });
        logger.warn("[reports] load failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const regionOptions = useMemo(() => {
    const opts = [{ id: "all", name: "All regions" }];
    for (const r of regions) opts.push({ id: r.id, name: r.name });
    return opts;
  }, [regions]);

  const selectedRegionName = useMemo(() => {
    if (regionId === "all") return "All regions";
    const r = regions.find((x) => x.id === regionId);
    return r ? r.name : "Region";
  }, [regionId, regions]);

  const routeSegments = useMemo(() => {
    const segs = Array.isArray(routeProgress?.segments) ? routeProgress.segments : [];
    return segs
      .map((s) => ({
        name: String(s.name || s.segmentId || "Segment"),
        percent: asNumber(s.percent) ?? 0,
        status: String(s.status || "good"),
      }))
      .slice()
      .sort((a, b) => b.percent - a.percent);
  }, [routeProgress]);

  const reportMetrics = useMemo(() => buildReportMetrics(summary, routeProgress), [summary, routeProgress]);

  const counts = useMemo(() => {
    const pass = reportMetrics.filter((r) => r.status === "pass").length;
    const warn = reportMetrics.filter((r) => r.status === "warn").length;
    const fail = reportMetrics.filter((r) => r.status === "fail").length;
    return { pass, warn, fail };
  }, [reportMetrics]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResp, routeResp] = await Promise.all([dataService.getAnalyticsSummary(), dataService.getRouteProgress()]);
      setSummary(summaryResp && typeof summaryResp === "object" ? summaryResp : null);
      setRouteProgress(routeResp && typeof routeResp === "object" ? routeResp : null);
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e ? String(e.message) : "Refresh failed";
      setError({ message });
      logger.warn("[reports] refresh failed", e);
    } finally {
      setLoading(false);
    }
  };

  const viewportSegments = { width: 920, height: 240 };

  return (
    <div className={styles.page}>
      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <div className={styles.panelTitle}>Reports</div>
            <div className={styles.panelSub}>
              Operational reporting workspace (demo). Presets + export-ready tables using existing DataService.
            </div>
          </div>
          <Badge tone="primary">/reports</Badge>
        </div>

        <div className={styles.panelBody}>
          <div className={styles.controlsRow}>
            <div className={styles.controlsLeft}>
              <label>
                <span className="srOnly">Report preset</span>
                <select
                  className={styles.select}
                  value={reportPreset}
                  onChange={(e) => setReportPreset(e.target.value)}
                  aria-label="Report preset"
                >
                  <option value="weekly_ops">Weekly Ops Summary</option>
                  <option value="route_progress">Route Progress Report</option>
                  <option value="compliance_snapshot">Compliance Snapshot</option>
                </select>
              </label>

              <label>
                <span className="srOnly">Region filter</span>
                <select className={styles.select} value={regionId} onChange={(e) => setRegionId(e.target.value)} aria-label="Region">
                  {regionOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>

              <Badge tone="secondary">{selectedRegionName}</Badge>
              <Badge tone="neutral">{dataService.mode}</Badge>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Badge tone="primary">{summary?.generatedAt ? "Ready" : "Demo"}</Badge>
              <Button variant="ghost" size="sm" onClick={refresh} ariaLabel="Refresh report data">
                Refresh
              </Button>
            </div>
          </div>

          <div className={styles.kpiRow}>
            <div className={styles.kpiPill} title="Report checks that are passing">
              <div className={styles.kpiLabel}>Pass</div>
              <div className={styles.kpiValue}>{counts.pass}</div>
            </div>
            <div className={styles.kpiPill} title="Report checks that require attention">
              <div className={styles.kpiLabel}>Warn</div>
              <div className={styles.kpiValue}>{counts.warn}</div>
            </div>
            <div className={styles.kpiPill} title="Report checks that fail targets">
              <div className={styles.kpiLabel}>Fail</div>
              <div className={styles.kpiValue}>{counts.fail}</div>
            </div>
            <div className={styles.kpiPill} title="When summary was generated">
              <div className={styles.kpiLabel}>Generated</div>
              <div className={styles.kpiValue} style={{ fontSize: 12 }}>
                {formatIsoAsLocal(summary?.generatedAt)}
              </div>
            </div>
          </div>

          {error ? (
            <ErrorState
              title="Could not load report data"
              message="We couldn’t fetch analytics summary / route progress."
              details={error.message}
              onAction={refresh}
              actionLabel="Retry"
              inline
            />
          ) : loading && !summary ? (
            <LoadingState title="Loading…" message="Fetching analytics summary and route progress." inline />
          ) : null}
        </div>
      </Card>

      <div className={styles.grid2}>
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>Route Progress</div>
              <div className={styles.panelSub}>Completion and segment status (from getRouteProgress).</div>
            </div>
            <Badge tone="secondary">Route</Badge>
          </div>

          <div className={styles.panelBody}>
            {!routeProgress ? (
              <div className={styles.emptyBox}>
                <div style={{ fontWeight: 900 }}>No route progress data</div>
                <div className={styles.smallMuted}>
                  In live mode, /routes/progress may not be implemented yet. Mock mode provides sample data.
                </div>
              </div>
            ) : (
              <div className={styles.progressCard}>
                <div className={styles.progressTop}>
                  <div>
                    <div className={styles.progressTitle}>
                      {routeProgress.routeName || routeProgress.routeId || "Route"}
                    </div>
                    <div className={styles.smallMuted}>
                      Updated: {formatIsoAsLocal(routeProgress.updatedAt)} · Preset:{" "}
                      <span style={{ fontWeight: 900 }}>{reportPreset}</span>
                    </div>
                  </div>
                  <Badge tone="primary">{routeProgress.percentComplete ?? "—"}%</Badge>
                </div>

                <div className={styles.progressBar} aria-label="Route completion bar">
                  <div
                    className={styles.progressFill}
                    style={{
                      width:
                        typeof routeProgress.percentComplete === "number"
                          ? `${Math.max(0, Math.min(100, routeProgress.percentComplete))}%`
                          : "0%",
                    }}
                  />
                </div>

                <div className={styles.segmentList} aria-label="Segment list">
                  {routeSegments.slice(0, 6).map((s, idx) => (
                    <div key={`${s.name}-${idx}`} className={styles.segmentRow}>
                      <div>
                        <div className={styles.segmentName}>{s.name}</div>
                        <div className={styles.segmentMeta}>
                          <span>Completion: {fmt(s.percent, 0)}%</span>
                          <span>Status: {s.status}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                        <div className={styles.segmentPct}>{fmt(s.percent, 0)}%</div>
                        <Badge tone={s.status === "bad" ? "danger" : s.status === "warning" ? "secondary" : "primary"}>
                          {s.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {routeSegments.length === 0 ? (
                    <div className={styles.emptyBox}>
                      <div style={{ fontWeight: 900 }}>No segments</div>
                      <div className={styles.smallMuted}>Route progress did not include segment breakdown.</div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>Segment Chart</div>
              <div className={styles.panelSub}>Lightweight SVG bar chart (first 8 segments).</div>
            </div>
            <Badge tone="primary">Chart</Badge>
          </div>

          <div className={styles.panelBody}>
            <div className={styles.chartWrap}>
              <div className={styles.chartTopBar}>
                <div>
                  <div className={styles.chartTitle}>Completion by segment</div>
                  <div className={styles.chartSub}>
                    {routeProgress?.routeName ? routeProgress.routeName : "Route"} · {selectedRegionName}
                  </div>
                </div>
                <Badge tone="secondary">{routeSegments.length} segs</Badge>
              </div>

              <div className={styles.chartCanvas}>
                {routeSegments.length === 0 ? (
                  <div className={styles.emptyBox} style={{ margin: 12 }}>
                    <div style={{ fontWeight: 900 }}>No chart data</div>
                    <div className={styles.smallMuted}>Segment list is empty.</div>
                  </div>
                ) : (
                  <SegmentBarChartSvg width={viewportSegments.width} height={viewportSegments.height} segments={routeSegments} />
                )}
              </div>
            </div>

            <div className={styles.smallMuted} style={{ marginTop: 10 }}>
              Color mapping: blue=good, amber=warning, red=bad.
            </div>
          </div>
        </Card>
      </div>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <div className={styles.panelTitle}>KPI Evaluation Table</div>
            <div className={styles.panelSub}>A compact report-ready table suitable for export later (CSV/PDF).</div>
          </div>
          <Badge tone="secondary">Table</Badge>
        </div>

        <div className={styles.panelBody}>
          <div className={styles.tableWrap} role="region" aria-label="KPI evaluation table">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Metric</th>
                  <th className={styles.th}>Value</th>
                  <th className={styles.th}>Target</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {reportMetrics.map((r) => (
                  <tr key={r.metric}>
                    <td className={styles.td}>
                      <span className={styles.tdStrong}>{r.metric}</span>
                    </td>
                    <td className={styles.td}>{r.value}</td>
                    <td className={styles.td}>{r.target}</td>
                    <td className={styles.td}>
                      <Badge tone={r.status === "fail" ? "danger" : r.status === "warn" ? "secondary" : "primary"}>
                        {r.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className={styles.td} style={{ color: "var(--op-text-muted)", fontWeight: 650 }}>
                      {r.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div className={styles.smallMuted}>
              Preset: <span style={{ fontWeight: 900 }}>{reportPreset}</span> · Region:{" "}
              <span style={{ fontWeight: 900 }}>{selectedRegionName}</span>
            </div>
            <div className={styles.smallMuted}>Next: export actions (CSV/PDF) can be wired to backend.</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
