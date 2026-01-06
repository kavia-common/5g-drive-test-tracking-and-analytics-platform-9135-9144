import React from "react";
import styles from "./Card.module.css";

/**
 * PUBLIC_INTERFACE
 * Ocean Professional Card primitive (surface container).
 *
 * @param {{
 *  children: React.ReactNode,
 *  className?: string,
 *  as?: keyof JSX.IntrinsicElements
 * }} props
 * @returns {JSX.Element}
 */
export default function Card({ children, className = "", as = "div" }) {
  const Tag = as;
  return <Tag className={[styles.card, className].join(" ")}>{children}</Tag>;
}
