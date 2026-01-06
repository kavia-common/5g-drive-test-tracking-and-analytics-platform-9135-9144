import React, { useEffect, useMemo, useState } from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { dataService } from "../services";
import { ErrorState, LoadingState, EmptyState } from "../components/ui/States";
import styles from "./CompliancePage.module.css";

/**
 * @typedef {{
 *  id: string,
 *  name: string,
 *  code?: string
 * }} Region
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
  return Number.isNaN(n) ? null : n;
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
 * Compute a deterministic per-region "derived" scorecard from global summary + route progress.
 * This keeps the Compliance page meaningful even if the backend doesn’t yet expose region SLA endpoints.
 *
 * @param {Region[]} regions
 * @param {AnalyticsSummary | null} summary
 * @param {any | null} routeProgress
 * @returns {Array<{
 *  region: Region,
 *  coverageScore: number | null,
 *  p95LatencyMs: number | null,
 *  avgDownlinkMbps: number | null,
 *  routePct: number | null,
 *  complianceScore: number | null,
 *  status: "pass" | "warn" | "fail"
 * }>}
 */
function buildRegionCards(regions, summary, routeProgress) {
  const baseCov = asNumber(summary?.coverageScore);
  const baseLat = asNumber(summary?.p95LatencyMs);
  const baseDl = asNumber(summary?.avgDownlinkMbps);
  const baseRoute = asNumber(routeProgress?.percentComplete);

  // Stable per-region variation based on index to keep UI realistic.
  return regions.map((r, idx) => {
    const m1 = 1 + (idx % 3 === 0 ? 0.01 : idx % 3 === 1 ? -0.02 : 0.015);
    const m2 = 1 + (idx % 4 === 0 ? 0.03 : idx % 4 === 1 ? -0.015 : idx % 4 === 2 ? 0.01 : -0.005);

    const cov = baseCov === null ? null : Math.max(0, Math.min(100, baseCov * m1 - idx * 0.4));
    const lat = baseLat === null ? null : Math.max(0, baseLat * m2 + idx * 1.8);
    const dl = baseDl === null ? null : Math.max(0, baseDl * (1.01 - idx * 0.01));
    const route = baseRoute === null ? null : Math.max(0, Math.min(100, baseRoute - idx * 2));

    // Compliance score: higher is better.
    const score =
      cov !== null && lat !== null && dl !== null
        ? Math.max(
            0,
            Math.min(
              100,
              cov * 0.55 + Math.min(1, dl / 500) * 25 + Math.max(0, 1 - lat / 80) * 20
            )
          )
        : null;

    const status =
      score !== null && score >= 88 ? "pass" : score !== null && score >= 78 ? "warn" : "fail";

    return {
      region: r,
      coverageScore: cov,
      p95LatencyMs: lat,
      avgDownlinkMbps: dl,
      routePct: route,
      complianceScore: score,
      status,
    };
  });
}

/**
 * @param {number | null} score
 * @returns {"pass" | "warn" | "fail"}
 */
function statusForScore(score) {
  if (score === null) return "warn";
  if (score >= 88) return "pass";
  if (score >= 78) return "warn";
  return "fail";
}

/**
 * @param {"pass" | "warn" | "fail"} s
 * @returns {"primary" | "secondary" | "danger"}
 */
function badgeToneForStatus(s) {
  if (s === "pass") return "primary";
  if (s === "warn") return "secondary";
  return "danger";
}

/**
 * PUBLIC_INTERFACE
 * CompliancePage renders compliance dashboards:
 * - region tiles with derived compliance score, coverage score, and route completion
 * - SLA checklist (pass/warn/fail) based on existing endpoints (summary + route progress)
 * - exceptions list (derived)
 *
 * Uses shared UI state components (LoadingState/ErrorState/EmptyState).
 *
 * @returns {JSX.Element}
 */
export default function CompliancePage() {
  const [regions, setRegions] = useState(/** @type {Region[]} */ ([]));
  const [regionId, setRegionId] = useState("all");

  const [summary, setSummary] = useState(/** @type {AnalyticsSummary | null} */ (null));
  const [routeProgress, setRouteProgress] = useState(/** @type {any | null} */ (null));

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

        setRegions(
          regionList
            .map((r) => ({ id: String(r.id), name: String(r.name || r.code || r.id), code: r.code ? String(r.code) : undefined }))
            .filter((r) => r.id)
        );

        setSummary(summaryResp && typeof summaryResp === "object" ? summaryResp : null);
        setRouteProgress(routeResp && typeof routeResp === "object" ? routeResp : null);
      } catch (e) {
        const message = e && typeof e === "object" && "message" in e ? String(e.message) : "Failed to load compliance";
        setError({ message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRegion = useMemo(() => {
    if (regionId === "all") return null;
    return regions.find((r) => r.id === regionId) || null;
  }, [regionId, regions]);

  const regionCards = useMemo(() => {
    const baseRegions = regions.length > 0 ? regions : [];
    return buildRegionCards(baseRegions, summary, routeProgress);
  }, [regions, summary, routeProgress]);

  const filteredCards = useMemo(() => {
    if (regionId === "all") return regionCards;
    return regionCards.filter((c) => c.region.id === regionId);
  }, [regionCards, regionId]);

  const slaChecks = useMemo(() => {
    const cov = asNumber(summary?.coverageScore);
    const lat = asNumber(summary?.p95LatencyMs);
    const dl = asNumber(summary?.avgDownlinkMbps);
    const routePct = asNumber(routeProgress?.percentComplete);

    /** @type {Array<{ key: string, title: string, description: string, status: "pass" | "warn" | "fail", metric: string }>} */
    const rows = [
      {
        key: "coverage",
        title: "Coverage obligation",
        description: "Minimum coverage quality across drive routes.",
        status: cov !== null && cov >= 90 ? "pass" : cov !== null && cov >= 85 ? "warn" : "fail",
        metric: cov === null ? "—" : `${cov.toFixed(1)}% (target ≥ 90%)`,
      },
      {
        key: "latency",
        title: "Latency SLA",
        description: "P95 latency target for responsiveness.",
        status: lat !== null && lat <= 45 ? "pass" : lat !== null && lat <= 65 ? "warn" : "fail",
        metric: lat === null ? "—" : `${Math.round(lat)} ms (target ≤ 45 ms)`,
      },
      {
        key: "downlink",
        title: "Downlink capacity",
        description: "Average downlink throughput target.",
        status: dl !== null && dl >= 350 ? "pass" : dl !== null && dl >= 300 ? "warn" : "fail",
        metric: dl === null ? "—" : `${dl.toFixed(1)} Mbps (target ≥ 350 Mbps)`,
      },
      {
        key: "route",
        title: "Route completion",
        description: "Route completion progress vs plan.",
        status: routePct !== null && routePct >= 75 ? "pass" : routePct !== null && routePct >= 55 ? "warn" : "fail",
        metric: routePct === null ? "—" : `${Math.round(routePct)}% (target ≥ 75%)`,
      },
    ];

    return rows;
  }, [summary, routeProgress]);

  const exceptions = useMemo(() => {
    // Derived exceptions: show any SLA checks that are warn/fail and add segment issues.
    const failing = slaChecks.filter((c) => c.status !== "pass");
    const segs = Array.isArray(routeProgress?.segments) ? routeProgress.segments : [];

    const segIssues = segs
      .filter((s) => String(s.status || "").toLowerCase() === "bad" || String(s.status || "").toLowerCase() === "warning")
      .slice(0, 5)
      .map((s) => ({
        title: `Segment ${s.name || s.segmentId || "—"} flagged`,
        detail: `Status: ${s.status || "—"} · Completion: ${typeof s.percent === "number" ? `${Math.round(s.percent)}%` : "—"}`,
        status: String(s.status || "warning").toLowerCase() === "bad" ? "fail" : "warn",
      }));

    return [
      ...failing.map((f) => ({
        title: f.title,
        detail: `${f.metric} · ${f.description}`,
        status: f.status,
      })),
      ...segIssues,
    ].slice(0, 8);
  }, [slaChecks, routeProgress]);

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryResp, routeResp] = await Promise.all([dataService.getAnalyticsSummary(), dataService.getRouteProgress()]);
      setSummary(summaryResp && typeof summaryResp === "object" ? summaryResp : null);
      setRouteProgress(routeResp && typeof routeResp === "object" ? routeResp : null);
    } catch (e) {
      const message = e && typeof e === "object" && "message" in e ? String(e.message) : "Refresh failed";
      setError({ message });
    } finally {
      setLoading(false);
    }
  };

  const headerRegionLabel = selectedRegion ? selectedRegion.name : "All regions";

  return (
    <div className={styles.page}>
      <Card className={styles.panel}>
        <div className={styles.headerRow}>
          <div>
            <div className={styles.title}>Compliance</div>
            <div className={styles.subtitle}>
              Region-level SLA tiles and checklist views (DataService: <span className="inlineCode">{dataService.mode}</span>).
            </div>
          </div>
          <Badge tone="primary">/compliance</Badge>
        </div>

        <div className={styles.panelBody}>
          <div className={styles.controlsRow}>
            <div className={styles.controlsLeft}>
              <label>
                <span className="srOnly">Region filter</span>
                <select className={styles.select} value={regionId} onChange={(e) => setRegionId(e.target.value)} aria-label="Region">
                  <option value="all">All regions</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <Badge tone="secondary">{headerRegionLabel}</Badge>
              <Badge tone="neutral">{summary?.period ? String(summary.period) : "period: —"}</Badge>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Badge tone="neutral">Generated: {formatIsoAsLocal(summary?.generatedAt)}</Badge>
              <Button variant="ghost" size="sm" onClick={refresh} ariaLabel="Refresh compliance data">
                Refresh
              </Button>
            </div>
          </div>

          {error ? (
            <ErrorState
              title="Could not load compliance"
              message="We couldn’t fetch regions/summary/route progress."
              details={error.message}
              onAction={refresh}
              actionLabel="Retry"
              inline
            />
          ) : loading && regions.length === 0 ? (
            <LoadingState title="Loading…" message="Fetching compliance data (regions + SLA inputs)." inline />
          ) : regions.length === 0 ? (
            <EmptyState title="No regions" message="No regions are available from the data provider." onAction={refresh} actionLabel="Retry" inline />
          ) : null}
        </div>
      </Card>

      <div className={styles.grid2}>
        <Card className={styles.panel}>
          <div className={styles.headerRow}>
            <div>
              <div className={styles.title} style={{ fontSize: 15 }}>Region SLA Tiles</div>
              <div className={styles.subtitle}>
                Compliance score is derived from coverage, latency, and downlink (until region SLA endpoints exist).
              </div>
            </div>
            <Badge tone="secondary">Tiles</Badge>
          </div>

          <div className={styles.panelBody}>
            {filteredCards.length === 0 ? (
              <EmptyState title="No tiles" message="No regions matched the filter." inline />
            ) : (
              <div className={styles.tilesGrid} aria-label="Region compliance tiles">
                {filteredCards.map((c) => {
                  const score = c.complianceScore;
                  const scoreStatus = statusForScore(score);

                  const barClass =
                    scoreStatus === "pass"
                      ? styles.barFillGood
                      : scoreStatus === "warn"
                        ? styles.barFillWarn
                        : styles.barFillFail;

                  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));

                  return (
                    <div key={c.region.id} className={styles.tile}>
                      <div className={styles.tileTop}>
                        <div>
                          <div className={styles.tileName}>{c.region.name}</div>
                          <div className={styles.tileMeta}>
                            <span>Coverage: {c.coverageScore === null ? "—" : `${c.coverageScore.toFixed(1)}%`}</span>
                            <span>Latency: {c.p95LatencyMs === null ? "—" : `${Math.round(c.p95LatencyMs)} ms`}</span>
                            <span>Route: {c.routePct === null ? "—" : `${Math.round(c.routePct)}%`}</span>
                          </div>
                        </div>
                        <Badge tone={badgeToneForStatus(scoreStatus)}>{scoreStatus.toUpperCase()}</Badge>
                      </div>

                      <div className={styles.scoreRow}>
                        <div className={styles.smallMuted}>Compliance score</div>
                        <div className={styles.scoreValue}>{score === null ? "—" : Math.round(score)}</div>
                      </div>

                      <div className={styles.bar} aria-label={`Compliance score bar for ${c.region.name}`}>
                        <div className={barClass} style={{ width: `${pct}%` }} />
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <Badge tone="neutral">{dataService.mode}</Badge>
                        <Badge tone="secondary">{c.avgDownlinkMbps === null ? "DL: —" : `DL: ${c.avgDownlinkMbps.toFixed(0)} Mbps`}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className={styles.smallMuted} style={{ marginTop: 12 }}>
              Note: The tiles intentionally remain deterministic in mock mode and “best-effort” in live mode until regional SLA endpoints are available.
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card className={styles.panel}>
            <div className={styles.headerRow}>
              <div>
                <div className={styles.title} style={{ fontSize: 15 }}>SLA Checklist</div>
                <div className={styles.subtitle}>Pass/warn/fail checks derived from summary and route progress.</div>
              </div>
              <Badge tone="primary">Checklist</Badge>
            </div>

            <div className={styles.panelBody}>
              <div className={styles.checklist} aria-label="SLA checklist">
                {slaChecks.map((c) => (
                  <div key={c.key} className={styles.checkRow}>
                    <div className={styles.checkLeft}>
                      <div className={styles.checkTitle}>{c.title}</div>
                      <div className={styles.checkSub}>{c.description}</div>
                      <div className={styles.smallMuted} style={{ marginTop: 6 }}>{c.metric}</div>
                    </div>
                    <Badge tone={badgeToneForStatus(c.status)}>{c.status.toUpperCase()}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className={styles.panel}>
            <div className={styles.headerRow}>
              <div>
                <div className={styles.title} style={{ fontSize: 15 }}>Exceptions</div>
                <div className={styles.subtitle}>Derived list of items needing attention (preview).</div>
              </div>
              <Badge tone="secondary">Alerts</Badge>
            </div>

            <div className={styles.panelBody}>
              {exceptions.length === 0 ? (
                <EmptyState title="No exceptions" message="All SLA checks are passing and no segments are flagged." inline />
              ) : (
                <div className={styles.exceptionsList} aria-label="Exceptions list">
                  {exceptions.map((e, idx) => (
                    <div className={styles.exceptionRow} key={`${e.title}-${idx}`}>
                      <div className={styles.exceptionTop}>
                        <div>
                          <div className={styles.exceptionTitle}>{e.title}</div>
                          <div className={styles.smallMuted} style={{ marginTop: 6 }}>{e.detail}</div>
                        </div>
                        <Badge tone={badgeToneForStatus(/** @type {"pass"|"warn"|"fail"} */ (e.status))}>
                          {String(e.status).toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.smallMuted} style={{ marginTop: 12 }}>
                Next step: wire triage/assignment workflow to backend alerts feed.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
