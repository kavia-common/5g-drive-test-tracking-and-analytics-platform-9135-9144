import React from "react";
import Card from "./Card";
import Button from "./Button";
import styles from "./States.module.css";

/**
 * PUBLIC_INTERFACE
 * LoadingState renders a consistent loading panel with optional details.
 *
 * @param {{
 *  title?: string,
 *  message?: string,
 *  inline?: boolean
 * }} props
 * @returns {JSX.Element}
 */
export function LoadingState({ title = "Loading…", message = "Fetching data. Please wait.", inline = false }) {
  const content = (
    <div className={styles.state} role="status" aria-live="polite">
      <div className={styles.icon} aria-hidden="true">
        <span className={styles.spinner} />
      </div>
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        <div className={styles.message}>{message}</div>
      </div>
    </div>
  );

  if (inline) return <div className={styles.inlineWrap}>{content}</div>;
  return <Card className={styles.cardWrap}>{content}</Card>;
}

/**
 * PUBLIC_INTERFACE
 * EmptyState renders a consistent "nothing to show" panel with optional action.
 *
 * @param {{
 *  title?: string,
 *  message?: string,
 *  actionLabel?: string,
 *  onAction?: () => void,
 *  inline?: boolean
 * }} props
 * @returns {JSX.Element}
 */
export function EmptyState({
  title = "Nothing here yet",
  message = "Try adjusting filters or refreshing.",
  actionLabel,
  onAction,
  inline = false,
}) {
  const content = (
    <div className={styles.state} role="status" aria-live="polite">
      <div className={styles.icon} aria-hidden="true">
        <span className={styles.emptyMark}>—</span>
      </div>
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        <div className={styles.message}>{message}</div>
        {actionLabel && typeof onAction === "function" ? (
          <div className={styles.actions}>
            <Button variant="ghost" size="sm" onClick={onAction} ariaLabel={actionLabel}>
              {actionLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (inline) return <div className={styles.inlineWrap}>{content}</div>;
  return <Card className={styles.cardWrap}>{content}</Card>;
}

/**
 * PUBLIC_INTERFACE
 * ErrorState renders a consistent error panel with retry action.
 *
 * @param {{
 *  title?: string,
 *  message?: string,
 *  details?: string,
 *  actionLabel?: string,
 *  onAction?: () => void,
 *  inline?: boolean
 * }} props
 * @returns {JSX.Element}
 */
export function ErrorState({
  title = "Something went wrong",
  message = "We couldn’t load the requested data.",
  details,
  actionLabel = "Retry",
  onAction,
  inline = false,
}) {
  const content = (
    <div className={[styles.state, styles.error].join(" ")} role="alert" aria-live="assertive">
      <div className={styles.icon} aria-hidden="true">
        <span className={styles.errorMark}>!</span>
      </div>
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        <div className={styles.message}>{message}</div>
        {details ? <div className={styles.details}>{details}</div> : null}
        {typeof onAction === "function" ? (
          <div className={styles.actions}>
            <Button variant="primary" size="sm" onClick={onAction} ariaLabel={actionLabel}>
              {actionLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (inline) return <div className={styles.inlineWrap}>{content}</div>;
  return <Card className={styles.cardWrap}>{content}</Card>;
}
