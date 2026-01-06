import React, { createContext, useContext, useMemo, useState } from "react";

/**
 * @typedef {"viewer" | "operator" | "admin"} Role
 */

const RoleContext = createContext(
  /** @type {null | { role: Role, setRole: (role: Role) => void, hasAnyRole: (roles: Role[]) => boolean }} */ (
    null
  )
);

/**
 * PUBLIC_INTERFACE
 * RoleProvider stores the current role in memory (demo-only) and exposes helpers
 * for role-based gating.
 *
 * Default role is "viewer".
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {JSX.Element}
 */
export function RoleProvider({ children }) {
  const [role, setRole] = useState(/** @type {Role} */ ("viewer"));

  const value = useMemo(() => {
    /**
     * @param {Role[]} roles
     * @returns {boolean}
     */
    const hasAnyRole = (roles) => roles.includes(role);

    return { role, setRole, hasAnyRole };
  }, [role]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

/**
 * PUBLIC_INTERFACE
 * useRole returns role state + helpers from RoleProvider.
 *
 * @returns {{ role: Role, setRole: (role: Role) => void, hasAnyRole: (roles: Role[]) => boolean }}
 */
export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error("useRole must be used within a <RoleProvider />");
  }
  return ctx;
}
