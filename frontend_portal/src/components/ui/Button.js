import React from "react";
import styles from "./Button.module.css";

/**
 * PUBLIC_INTERFACE
 * Ocean Professional Button primitive.
 *
 * @param {{
 *   children: React.ReactNode,
 *   variant?: "primary" | "secondary" | "ghost",
 *   size?: "sm" | "md" | "lg",
 *   type?: "button" | "submit" | "reset",
 *   disabled?: boolean,
 *   onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void,
 *   className?: string,
 *   ariaLabel?: string
 * }} props
 * @returns {JSX.Element}
 */
export default function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  disabled = false,
  onClick,
  className = "",
  ariaLabel,
}) {
  const classes = [
    styles.button,
    styles[variant] || styles.primary,
    styles[size] || styles.md,
    disabled ? styles.disabled : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
