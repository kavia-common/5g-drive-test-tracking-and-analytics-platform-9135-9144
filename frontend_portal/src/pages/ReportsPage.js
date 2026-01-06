import React from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";

/**
 * PUBLIC_INTERFACE
 * ReportsPage is the routed placeholder for operational reporting and exports.
 *
 * @returns {JSX.Element}
 */
export default function ReportsPage() {
  return (
    <div className="pageGrid">
      <Card className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Reports</div>
            <div className="panelSub op-muted">
              Generate weekly summaries, route PDFs, and KPI exports (placeholder).
            </div>
          </div>
          <Badge tone="primary">/reports</Badge>
        </div>

        <div className="panelBody">
          <div className="placeholderArea" role="img" aria-label="Reports placeholder">
            <div className="placeholderInner">
              <div className="placeholderTitle">Reporting Workspace</div>
              <div className="placeholderSub op-muted">
                Add report templates + export actions.
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Saved Reports</div>
            <div className="panelSub op-muted">Recent exports and scheduled jobs (placeholder).</div>
          </div>
          <Badge tone="secondary">History</Badge>
        </div>

        <div className="panelBody">
          <p className="op-muted" style={{ marginTop: 0 }}>
            Visible to viewer/operator/admin roles.
          </p>
        </div>
      </Card>
    </div>
  );
}
