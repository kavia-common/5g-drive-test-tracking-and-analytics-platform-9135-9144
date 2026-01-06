import React, { useEffect } from "react";
import "./App.css";
import { config, getPublicConfigSnapshot, logger } from "./config";
import DashboardShell from "./components/layout/DashboardShell";
import Card from "./components/ui/Card";
import Button from "./components/ui/Button";
import Badge from "./components/ui/Badge";

// PUBLIC_INTERFACE
function App() {
  // Initialize runtime config once (module initialization happens on import).
  // Keep logging non-noisy: a single info log outside production.
  useEffect(() => {
    if (config.nodeEnv !== "production") {
      logger.info("[config]", getPublicConfigSnapshot());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="App">
      <DashboardShell title="Operations Dashboard">
        <div className="pageGrid">
          <Card className="panel">
            <div className="panelHeader">
              <div>
                <div className="panelTitle">Welcome</div>
                <div className="panelSub op-muted">
                  App shell is ready. Next step: add routed pages.
                </div>
              </div>
              <Badge tone="primary">Ocean Professional</Badge>
            </div>

            <div className="panelBody">
              <p className="op-muted" style={{ marginTop: 0 }}>
                Backend base:
                <br />
                <code className="inlineCode">{config.backendUrl}</code>
              </p>

              <div className="panelActions">
                <Button variant="primary">Create Session</Button>
                <Button variant="secondary">Upload Logs</Button>
                <Button variant="ghost">View Reports</Button>
              </div>
            </div>
          </Card>

          <Card className="panel">
            <div className="panelHeader">
              <div>
                <div className="panelTitle">Workspace</div>
                <div className="panelSub op-muted">
                  Map, analytics, and route progress panels will render here.
                </div>
              </div>
              <Badge tone="secondary">Placeholder</Badge>
            </div>

            <div className="panelBody">
              <div className="placeholderArea" role="img" aria-label="Map placeholder">
                <div className="placeholderInner">
                  <div className="placeholderTitle">Main Content Area</div>
                  <div className="placeholderSub op-muted">
                    Ready for real-time map and analytics components.
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </DashboardShell>
    </div>
  );
}

export default App;
