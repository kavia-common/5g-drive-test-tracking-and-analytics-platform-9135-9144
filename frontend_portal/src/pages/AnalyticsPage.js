import React from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";

/**
 * PUBLIC_INTERFACE
 * AnalyticsPage is the routed placeholder for aggregated KPIs and charts.
 *
 * @returns {JSX.Element}
 */
export default function AnalyticsPage() {
  return (
    <div className="pageGrid">
      <Card className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Analytics</div>
            <div className="panelSub op-muted">
              KPI trends, throughput distributions, and drive summary analytics (placeholder).
            </div>
          </div>
          <Badge tone="primary">/analytics</Badge>
        </div>

        <div className="panelBody">
          <div className="placeholderArea" role="img" aria-label="Analytics placeholder">
            <div className="placeholderInner">
              <div className="placeholderTitle">Charts & KPIs</div>
              <div className="placeholderSub op-muted">
                Add charting + filters in next steps.
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Filters</div>
            <div className="panelSub op-muted">Region, date range, route, device (placeholder).</div>
          </div>
          <Badge tone="secondary">Controls</Badge>
        </div>

        <div className="panelBody">
          <p className="op-muted" style={{ marginTop: 0 }}>
            Filter state will be shared across analytics widgets.
          </p>
        </div>
      </Card>
    </div>
  );
}
