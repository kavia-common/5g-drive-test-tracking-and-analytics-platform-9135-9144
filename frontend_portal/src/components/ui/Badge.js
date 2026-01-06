import React from "react";
import styles from "./Badge.module.css";

/**
 * PUBLIC_INTERFACE
 * Ocean Professional Badge primitive.
 *
 * @param {{
 *  children: React.ReactNode,
 *  tone?: "primary" | "secondary" | "neutral" | "danger",
 *  className?: string
 * }} props
 * @returns {JSX.Element}
 */
export default function Badge({ children, tone = "neutral", className = "" }) {
  const classes = [styles.badge, styles[tone] || styles.neutral, className]
    .filter(Boolean)
    .join(" ");
  return <span className={classes}>{children}</span>;
}
