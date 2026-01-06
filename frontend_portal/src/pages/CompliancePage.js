import React from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";

/**
 * PUBLIC_INTERFACE
 * CompliancePage is the routed placeholder for SLA/compliance dashboards.
 *
 * @returns {JSX.Element}
 */
export default function CompliancePage() {
  return (
    <div className="pageGrid">
      <Card className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Compliance</div>
            <div className="panelSub op-muted">
              Coverage obligations, route completion, and KPI pass/fail summaries (placeholder).
            </div>
          </div>
          <Badge tone="primary">/compliance</Badge>
        </div>

        <div className="panelBody">
          <div className="placeholderArea" role="img" aria-label="Compliance dashboard placeholder">
            <div className="placeholderInner">
              <div className="placeholderTitle">SLA Dashboard</div>
              <div className="placeholderSub op-muted">
                Add pass/fail cards + drilldowns.
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Exceptions</div>
            <div className="panelSub op-muted">Sites/segments failing thresholds (placeholder).</div>
          </div>
          <Badge tone="secondary">Alerts</Badge>
        </div>

        <div className="panelBody">
          <p className="op-muted" style={{ marginTop: 0 }}>
            Triage and assignment workflow comes later.
          </p>
        </div>
      </Card>
    </div>
  );
}
