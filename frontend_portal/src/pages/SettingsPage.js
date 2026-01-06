import React from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";

/**
 * PUBLIC_INTERFACE
 * SettingsPage is the routed placeholder for configuration and admin tools.
 *
 * @returns {JSX.Element}
 */
export default function SettingsPage() {
  return (
    <div className="pageGrid">
      <Card className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Settings</div>
            <div className="panelSub op-muted">
              Regions, thresholds, users, and integrations (placeholder).
            </div>
          </div>
          <Badge tone="primary">/settings</Badge>
        </div>

        <div className="panelBody">
          <div className="placeholderArea" role="img" aria-label="Settings placeholder">
            <div className="placeholderInner">
              <div className="placeholderTitle">Admin Tools</div>
              <div className="placeholderSub op-muted">
                Wire to backend once available.
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Permissions</div>
            <div className="panelSub op-muted">Role policy is demo-only for now.</div>
          </div>
          <Badge tone="secondary">RBAC</Badge>
        </div>

        <div className="panelBody">
          <p className="op-muted" style={{ marginTop: 0 }}>
            Visible to operator/admin roles.
          </p>
        </div>
      </Card>
    </div>
  );
}
