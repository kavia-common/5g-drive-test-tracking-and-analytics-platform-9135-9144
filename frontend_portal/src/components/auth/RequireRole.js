import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useRole } from "../../context/RoleContext";

/**
 * PUBLIC_INTERFACE
 * RequireRole restricts access to children based on the current role.
 * If access is denied, the user is redirected to /live.
 *
 * @param {{
 *  allow: import("../../context/RoleContext").Role[],
 *  children: React.ReactNode
 * }} props
 * @returns {JSX.Element}
 */
export default function RequireRole({ allow, children }) {
  const { hasAnyRole } = useRole();
  const location = useLocation();

  if (!hasAnyRole(allow)) {
    return <Navigate to="/live" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
