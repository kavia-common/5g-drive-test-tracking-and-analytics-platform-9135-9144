import React, { useEffect, useMemo, useState } from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { dataService } from "../services";
import { logger } from "../config";
import styles from "./AnalyticsPage.module.css";
import { ErrorState, LoadingState } from "../components/ui/States";

/**
 * @typedef {{ key: string, label: string }} RegionOption
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
 * Small helpers for stable UI formatting.
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
 * Build deterministic demo trend data from the summary (works for both mock and live).
 * The intent is to make preview meaningful even when only the summary endpoint exists.
 *
 * @param {AnalyticsSummary | null} summary
 * @returns {{
 *  labels: string[],
 *  downlink: number[],
 *  uplink: number[],
 *  latency: number[]
 * }}
 */
function buildTrends(summary) {
  const baseDown = asNumber(summary?.avgDownlinkMbps) ?? 380;
  const baseUp = asNumber(summary?.avgUplinkMbps) ?? 55;
  const baseLat = asNumber(summary?.p95LatencyMs) ?? 40;

  // 7 "days" trend with subtle variation.
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const multipliers = [0.94, 1.02, 0.98, 1.05, 1.0, 0.97, 1.03];

  const downlink = multipliers.map((m, i) => Math.max(0, baseDown * m + (i - 3) * 5));
  const uplink = multipliers.map((m, i) => Math.max(0, baseUp * (m * 0.96) + (3 - i) * 1.2));
  const latency = multipliers.map((m, i) => Math.max(0, baseLat * (1.04 - (m - 1) * 0.4) + (i % 2 === 0 ? 2 : -1)));

  return { labels, downlink, uplink, latency };
}

/**
 * Compute a simple coverage split based on coverageScore.
 * @param {AnalyticsSummary | null} summary
 * @returns {{ good: number, warning: number, bad: number }}
 */
function buildCoverageSplit(summary) {
  const score = asNumber(summary?.coverageScore);
  const s = score === null ? 92 : Math.max(0, Math.min(100, score));

  // Heuristic split: higher score => more "good" share.
  const bad = Math.max(2, Math.round((100 - s) * 0.55));
  const warning = Math.max(6, Math.round((100 - s) * 0.35));
  const good = Math.max(0, 100 - bad - warning);

  return { good, warning, bad };
}

/**
 * Lightweight line chart rendered in SVG (no external chart dependency).
 *
 * @param {{
 *  width: number,
 *  height: number,
 *  labels: string[],
 *  series: Array<{ name: string, color: string, values: number[] }>,
 *  yUnit?: string
 * }} props
 * @returns {JSX.Element}
 */
function LineChartSvg({ width, height, labels, series, yUnit }) {
  const pad = 18;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const allValues = series.flatMap((s) => s.values);
  const minV = Math.min(...allValues, 0);
  const maxV = Math.max(...allValues, 1);

  const xAt = (i) => pad + (labels.length <= 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
  const yAt = (v) => {
    const t = (v - minV) / (maxV - minV || 1);
    return pad + (1 - t) * innerH;
  };

  const gridLines = 4;
  const ticks = Array.from({ length: gridLines + 1 }).map((_, i) => {
    const t = i / gridLines;
    const v = minV + (1 - t) * (maxV - minV);
    return { y: pad + t * innerH, value: v };
  });

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend chart">
      <defs>
        <pattern id="grid-analytics" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M 56 0 L 0 0 0 56" fill="none" stroke="rgba(17, 24, 39, 0.06)" strokeWidth="1" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={width} height={height} fill="url(#grid-analytics)" />

      {/* horizontal grid ticks */}
      {ticks.map((t, idx) => (
        <g key={`tick-${idx}`}>
          <line x1={pad} y1={t.y} x2={width - pad} y2={t.y} stroke="rgba(17, 24, 39, 0.08)" strokeWidth="1" />
          <text x={pad} y={t.y - 6} fontSize="10" fill="rgba(17, 24, 39, 0.55)">
            {fmt(t.value, 0)}
            {yUnit ? ` ${yUnit}` : ""}
          </text>
        </g>
      ))}

      {/* series */}
      {series.map((s) => {
        const d = s.values
          .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
          .join(" ");

        return (
          <g key={s.name}>
            <path d={d} fill="none" stroke={s.color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            {s.values.map((v, i) => (
              <circle
                key={`${s.name}-${i}`}
                cx={xAt(i)}
                cy={yAt(v)}
                r="4"
                fill="rgba(255,255,255,0.92)"
                stroke={s.color}
                strokeWidth="2"
              />
            ))}
          </g>
        );
      })}

      {/* x labels */}
      {labels.map((lab, i) => (
        <text
          key={`x-${lab}-${i}`}
          x={xAt(i)}
          y={height - 6}
          textAnchor="middle"
          fontSize="10"
          fill="rgba(17, 24, 39, 0.55)"
        >
          {lab}
        </text>
      ))}
    </svg>
  );
}

/**
 * Lightweight stacked bar chart rendered in SVG.
 *
 * @param {{
 *  width: number,
 *  height: number,
 *  parts: Array<{ name: string, value: number, color: string }>,
 * }} props
 * @returns {JSX.Element}
 */
function StackedBarSvg({ width, height, parts }) {
  const pad = 18;
  const barH = 22;
  const barY = height / 2 - barH / 2;

  const total = Math.max(1, parts.reduce((a, p) => a + p.value, 0));
  const innerW = width - pad * 2;

  let x = pad;

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Coverage split chart">
      <rect x="0" y="0" width={width} height={height} fill="rgba(255,255,255,0)" />

      <text x={pad} y={18} fontSize="11" fill="rgba(17, 24, 39, 0.55)">
        Coverage share (derived)
      </text>

      <rect
        x={pad}
        y={barY}
        width={innerW}
        height={barH}
        rx="999"
        fill="rgba(17, 24, 39, 0.08)"
        stroke="rgba(17, 24, 39, 0.10)"
      />

      {parts.map((p) => {
        const w = (p.value / total) * innerW;
        const seg = (
          <g key={p.name}>
            <rect x={x} y={barY} width={w} height={barH} fill={p.color} />
            <text
              x={x + w / 2}
              y={barY + barH / 2 + 4}
              textAnchor="middle"
              fontSize="11"
              fill="rgba(255, 255, 255, 0.92)"
              fontWeight="800"
            >
              {Math.round((p.value / total) * 100)}%
            </text>
          </g>
        );
        x += w;
        return seg;
      })}

      {/* round the ends */}
      <rect x={pad} y={barY} width={innerW} height={barH} rx="999" fill="none" stroke="rgba(17, 24, 39, 0.12)" />
    </svg>
  );
}

/**
 * PUBLIC_INTERFACE
 * AnalyticsPage renders KPI cards, trend tables, and lightweight charts
 * using the existing DataService (mock/live).
 *
 * @returns {JSX.Element}
 */
export default function AnalyticsPage() {
  const [regions, setRegions] = useState(/** @type {Array<{id: string, name: string, code?: string}>} */ ([]));
  const [regionId, setRegionId] = useState("all");

  const [summary, setSummary] = useState(/** @type {AnalyticsSummary | null} */ (null));
  const [routeProgress, setRouteProgress] = useState(/** @type {any | null} */ (null));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {null | { message: string }} */ (null));

  const [search, setSearch] = useState("");

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

        setSummary(
          /** @type {AnalyticsSummary} */ (
            summaryResp && typeof summaryResp === "object" ? summaryResp : null
          )
        );

        setRouteProgress(routeResp && typeof routeResp === "object" ? routeResp : null);
      } catch (e) {
        const message =
          e && typeof e === "object" && "message" in e ? String(e.message) : "Failed to load analytics";
        setError({ message });
        logger.warn("[analytics] load failed", e);
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
    /** @type {RegionOption[]} */
    const opts = [{ key: "all", label: "All regions" }];
    regions.forEach((r) => opts.push({ key: r.id, label: r.name }));
    return opts;
  }, [regions]);

  const selectedRegionName = useMemo(() => {
    if (regionId === "all") return "All regions";
    const r = regions.find((x) => x.id === regionId);
    return r ? r.name : "Region";
  }, [regionId, regions]);

  const trends = useMemo(() => buildTrends(summary), [summary]);

  const coverageSplit = useMemo(() => buildCoverageSplit(summary), [summary]);

  const coverageParts = useMemo(
    () => [
      { name: "Good", value: coverageSplit.good, color: "rgba(16, 185, 129, 0.85)" },
      { name: "Warning", value: coverageSplit.warning, color: "rgba(245, 158, 11, 0.85)" },
      { name: "Bad", value: coverageSplit.bad, color: "rgba(239, 68, 68, 0.85)" },
    ],
    [coverageSplit]
  );

  const computedKpis = useMemo(() => {
    const active = asNumber(summary?.activeDevices);
    const uploads = asNumber(summary?.totalUploads);

    const dl = asNumber(summary?.avgDownlinkMbps);
    const ul = asNumber(summary?.avgUplinkMbps);
    const lat = asNumber(summary?.p95LatencyMs);
    const cov = asNumber(summary?.coverageScore);

    // Derived “health index” meant for quick scanning in preview/demo.
    const health =
      dl !== null && ul !== null && lat !== null && cov !== null
        ? Math.max(
            0,
            Math.min(
              100,
              cov * 0.55 + Math.min(1, dl / 500) * 25 + Math.min(1, ul / 80) * 10 + Math.max(0, 1 - lat / 80) * 10
            )
          )
        : null;

    const routePct = asNumber(routeProgress?.percentComplete);

    return {
      activeDevices: active,
      totalUploads: uploads,
      avgDownlink: dl,
      avgUplink: ul,
      p95Latency: lat,
      coverageScore: cov,
      healthIndex: health,
      routePct,
    };
  }, [summary, routeProgress]);

  const trendRows = useMemo(() => {
    const rows = trends.labels.map((lab, i) => ({
      label: lab,
      downlink: trends.downlink[i],
      uplink: trends.uplink[i],
      latency: trends.latency[i],
    }));

    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => String(r.label).toLowerCase().includes(s));
  }, [trends, search]);

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
      logger.warn("[analytics] refresh failed", e);
    } finally {
      setLoading(false);
    }
  };

  const viewportTrend = { width: 920, height: 260 };
  const viewportCoverage = { width: 920, height: 180 };

  return (
    <div className={styles.page}>
      <Card className={styles.panel}>
        <div className={styles.headerRow}>
          <div className={styles.titleGroup}>
            <div className={styles.title}>Analytics</div>
            <div className={styles.subtitle}>
              KPI cards, trends, and route progress signals (powered by DataService: <span className="inlineCode">{dataService.mode}</span>).
            </div>
          </div>
          <Badge tone="primary">/analytics</Badge>
        </div>

        <div className={styles.panelBody}>
          <div className={styles.controlsRow}>
            <div className={styles.controlsLeft}>
              <label>
                <span className="srOnly">Region</span>
                <select
                  className={styles.select}
                  value={regionId}
                  onChange={(e) => setRegionId(e.target.value)}
                  aria-label="Region filter"
                >
                  {regionOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="srOnly">Search trend table</span>
                <input
                  className={styles.input}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search trend rows…"
                  aria-label="Search trend rows"
                />
              </label>

              <Badge tone="secondary">{selectedRegionName}</Badge>
            </div>

            <div className={styles.controlsRight}>
              <Badge tone="neutral">{summary?.period ? String(summary.period) : "period: —"}</Badge>
              <Button variant="ghost" size="sm" onClick={refresh} ariaLabel="Refresh analytics">
                Refresh
              </Button>
            </div>
          </div>

          {error ? (
            <ErrorState
              title="Could not load analytics"
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

      <div className={styles.grid3}>
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>KPI Snapshot</div>
              <div className={styles.panelSub}>Derived from summary endpoint + route progress.</div>
            </div>
            <Badge tone="secondary">KPIs</Badge>
          </div>

          <div className={styles.panelBody}>
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiTop}>
                  <div className={styles.kpiLabel}>Active devices</div>
                  <Badge tone="primary">live</Badge>
                </div>
                <div className={styles.kpiValue}>{fmt(computedKpis.activeDevices, 0)}</div>
                <div className={styles.kpiFoot}>
                  <span className={styles.smallMuted}>Region: {selectedRegionName}</span>
                  <span className={styles.smallMuted}>Generated: {formatIsoAsLocal(summary?.generatedAt)}</span>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiTop}>
                  <div className={styles.kpiLabel}>Total uploads</div>
                  <Badge tone="secondary">24h</Badge>
                </div>
                <div className={styles.kpiValue}>{fmt(computedKpis.totalUploads, 0)}</div>
                <div className={styles.kpiFoot}>
                  <span className={styles.smallMuted}>Ingest pipeline (demo)</span>
                  <span className={styles.smallMuted}>Mode: {dataService.mode}</span>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiTop}>
                  <div className={styles.kpiLabel}>Avg downlink</div>
                  <Badge tone="primary">Mbps</Badge>
                </div>
                <div className={styles.kpiValue}>{computedKpis.avgDownlink === null ? "—" : `${fmt(computedKpis.avgDownlink, 1)}`}</div>
                <div className={styles.kpiFoot}>
                  <span className={styles.smallMuted}>Trend-driven chart below</span>
                  <span className={styles.smallMuted}>P95 latency: {computedKpis.p95Latency === null ? "—" : `${fmt(computedKpis.p95Latency, 0)} ms`}</span>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiTop}>
                  <div className={styles.kpiLabel}>Health index</div>
                  <Badge tone={computedKpis.healthIndex !== null && computedKpis.healthIndex >= 85 ? "primary" : "secondary"}>
                    score
                  </Badge>
                </div>
                <div className={styles.kpiValue}>
                  {computedKpis.healthIndex === null ? "—" : `${fmt(computedKpis.healthIndex, 0)}`}
                </div>
                <div className={styles.kpiFoot}>
                  <span className={styles.smallMuted}>
                    Coverage: {computedKpis.coverageScore === null ? "—" : `${fmt(computedKpis.coverageScore, 1)}%`}
                  </span>
                  <span className={styles.smallMuted}>
                    Route: {computedKpis.routePct === null ? "—" : `${fmt(computedKpis.routePct, 0)}%`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className={styles.panel} style={{ gridColumn: "span 2" }}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>Throughput & Latency Trends</div>
              <div className={styles.panelSub}>Lightweight SVG line chart (no chart library).</div>
            </div>
            <Badge tone="primary">Trend</Badge>
          </div>

          <div className={styles.panelBody}>
            <div className={styles.chartWrap}>
              <div className={styles.chartTopBar}>
                <div>
                  <div className={styles.chartTitle}>Weekly signal trend (demo)</div>
                  <div className={styles.chartSub}>Downlink vs Uplink. Latency shown in table.</div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Badge tone="secondary">{selectedRegionName}</Badge>
                  <Badge tone="neutral">{summary?.generatedAt ? formatIsoAsLocal(summary.generatedAt) : "—"}</Badge>
                </div>
              </div>

              <div className={styles.chartCanvas}>
                <LineChartSvg
                  width={viewportTrend.width}
                  height={viewportTrend.height}
                  labels={trends.labels}
                  series={[
                    { name: "Downlink", color: "rgba(37, 99, 235, 0.88)", values: trends.downlink },
                    { name: "Uplink", color: "rgba(245, 158, 11, 0.88)", values: trends.uplink },
                  ]}
                  yUnit="Mbps"
                />

                <div className={styles.legend} aria-label="Chart legend">
                  <div className={styles.legendRow}>
                    <span className={[styles.legendSwatch, styles.swatchPrimary].join(" ")} aria-hidden="true" />
                    Downlink (Mbps)
                  </div>
                  <div className={styles.legendRow}>
                    <span className={[styles.legendSwatch, styles.swatchSecondary].join(" ")} aria-hidden="true" />
                    Uplink (Mbps)
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className={styles.tableWrap} role="region" aria-label="Trend table">
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Day</th>
                      <th className={styles.th}>Downlink</th>
                      <th className={styles.th}>Uplink</th>
                      <th className={styles.th}>P95 Latency</th>
                      <th className={styles.th}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendRows.map((r) => (
                      <tr key={r.label}>
                        <td className={styles.td}>
                          <span className={styles.tdStrong}>{r.label}</span>
                        </td>
                        <td className={styles.td}>{fmt(r.downlink, 1)} Mbps</td>
                        <td className={styles.td}>{fmt(r.uplink, 1)} Mbps</td>
                        <td className={styles.td}>{fmt(r.latency, 0)} ms</td>
                        <td className={[styles.td, styles.rowMuted].join(" ")}>
                          {r.downlink >= (asNumber(summary?.avgDownlinkMbps) ?? 0) ? "Above avg" : "Below avg"}
                        </td>
                      </tr>
                    ))}
                    {trendRows.length === 0 ? (
                      <tr>
                        <td className={styles.td} colSpan={5}>
                          <span className={styles.rowMuted}>No rows match the search.</span>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className={styles.smallMuted} style={{ marginTop: 10 }}>
                Note: trend values are deterministic demo derivations from summary metrics so the page remains meaningful with minimal backend endpoints.
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className={styles.grid2}>
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>Coverage Split</div>
              <div className={styles.panelSub}>Derived from coverage score into Good/Warning/Bad share.</div>
            </div>
            <Badge tone="secondary">Coverage</Badge>
          </div>

          <div className={styles.panelBody}>
            <div className={styles.chartWrap}>
              <div className={styles.chartTopBar}>
                <div>
                  <div className={styles.chartTitle}>Quality distribution</div>
                  <div className={styles.chartSub}>
                    Score: {computedKpis.coverageScore === null ? "—" : `${fmt(computedKpis.coverageScore, 1)}%`}
                  </div>
                </div>
                <Badge tone="primary">Derived</Badge>
              </div>

              <div className={styles.chartCanvas} style={{ height: 180 }}>
                <StackedBarSvg width={viewportCoverage.width} height={viewportCoverage.height} parts={coverageParts} />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Badge tone="primary">Good: {coverageSplit.good}%</Badge>
              <Badge tone="secondary">Warning: {coverageSplit.warning}%</Badge>
              <Badge tone="danger">Bad: {coverageSplit.bad}%</Badge>
            </div>
          </div>
        </Card>

        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>Route Progress (Preview)</div>
              <div className={styles.panelSub}>Live route progress endpoint output (if available).</div>
            </div>
            <Badge tone="primary">Routes</Badge>
          </div>

          <div className={styles.panelBody}>
            {!routeProgress ? (
              <div className={styles.placeholderBox}>
                <div style={{ fontWeight: 900 }}>No route progress data</div>
                <div className={styles.smallMuted} style={{ marginTop: 6 }}>
                  Backend may not expose /routes/progress yet. Mock mode provides sample data.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 1000, letterSpacing: "-0.02em" }}>
                    {routeProgress.routeName || routeProgress.routeId || "Route"}
                  </div>
                  <Badge tone="secondary">{routeProgress.percentComplete ?? "—"}%</Badge>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table} style={{ minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th className={styles.th}>Segment</th>
                        <th className={styles.th}>Complete</th>
                        <th className={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Array.isArray(routeProgress.segments) ? routeProgress.segments : []).slice(0, 6).map((s) => (
                        <tr key={s.segmentId || s.name}>
                          <td className={styles.td}>
                            <span className={styles.tdStrong}>{s.name || s.segmentId}</span>
                          </td>
                          <td className={styles.td}>{typeof s.percent === "number" ? `${fmt(s.percent, 0)}%` : "—"}</td>
                          <td className={styles.td}>
                            <Badge tone={s.status === "bad" ? "danger" : s.status === "warning" ? "secondary" : "primary"}>
                              {s.status || "—"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {!Array.isArray(routeProgress.segments) || routeProgress.segments.length === 0 ? (
                        <tr>
                          <td className={styles.td} colSpan={3}>
                            <span className={styles.rowMuted}>No segments available.</span>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className={styles.smallMuted}>
                  Updated: {routeProgress.updatedAt ? formatIsoAsLocal(routeProgress.updatedAt) : "—"}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
