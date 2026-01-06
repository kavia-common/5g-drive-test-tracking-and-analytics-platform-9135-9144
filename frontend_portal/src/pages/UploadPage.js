import React from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";

/**
 * PUBLIC_INTERFACE
 * UploadPage is the routed placeholder for log upload workflows (TEMS, etc).
 *
 * @returns {JSX.Element}
 */
export default function UploadPage() {
  return (
    <div className="pageGrid">
      <Card className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Upload Logs</div>
            <div className="panelSub op-muted">
              Upload and validate TEMS/drive logs, then kick off parsing (placeholder).
            </div>
          </div>
          <Badge tone="primary">/upload</Badge>
        </div>

        <div className="panelBody">
          <div className="placeholderArea" role="img" aria-label="Upload placeholder">
            <div className="placeholderInner">
              <div className="placeholderTitle">Dropzone</div>
              <div className="placeholderSub op-muted">
                Add file picker + progress + validation results.
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Recent Uploads</div>
            <div className="panelSub op-muted">Status, warnings, and parsing jobs (placeholder).</div>
          </div>
          <Badge tone="secondary">Queue</Badge>
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
