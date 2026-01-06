import React from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";

/**
 * PUBLIC_INTERFACE
 * LiveTrackingPage is the routed placeholder for real-time drive test tracking.
 *
 * @returns {JSX.Element}
 */
export default function LiveTrackingPage() {
  return (
    <div className="pageGrid">
      <Card className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Live Tracking</div>
            <div className="panelSub op-muted">
              Real-time sessions, devices, and current route progress (placeholder).
            </div>
          </div>
          <Badge tone="primary">/live</Badge>
        </div>

        <div className="panelBody">
          <div className="placeholderArea" role="img" aria-label="Live map placeholder">
            <div className="placeholderInner">
              <div className="placeholderTitle">Map + Telemetry</div>
              <div className="placeholderSub op-muted">
                Map rendering, device markers, and session status will appear here.
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Session Feed</div>
            <div className="panelSub op-muted">
              Alerts, handovers, and KPI threshold events (placeholder).
            </div>
          </div>
          <Badge tone="secondary">Live</Badge>
        </div>

        <div className="panelBody">
          <p className="op-muted" style={{ marginTop: 0 }}>
            Add streaming widgets once backend + WebSocket telemetry is wired.
          </p>
        </div>
      </Card>
    </div>
  );
}
