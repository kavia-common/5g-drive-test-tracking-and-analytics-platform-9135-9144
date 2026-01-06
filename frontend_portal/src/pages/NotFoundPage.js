import React from "react";
import { Link } from "react-router-dom";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";

/**
 * PUBLIC_INTERFACE
 * NotFoundPage renders for unmatched routes.
 *
 * @returns {JSX.Element}
 */
export default function NotFoundPage() {
  return (
    <Card className="panel">
      <div className="panelHeader">
        <div>
          <div className="panelTitle">Page not found</div>
          <div className="panelSub op-muted">
            The requested route does not exist.
          </div>
        </div>
        <Badge tone="danger">404</Badge>
      </div>

      <div className="panelBody">
        <Link to="/live" style={{ textDecoration: "none" }}>
          <Button variant="primary">Go to Live Tracking</Button>
        </Link>
      </div>
    </Card>
  );
}
