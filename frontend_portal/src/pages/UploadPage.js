import React, { useMemo, useRef, useState } from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import RequireRole from "../components/auth/RequireRole";
import { dataService } from "../services/dataService";
import styles from "./UploadPage.module.css";

const RECENT_UPLOADS_KEY = "op.recentUploads.v1";
const MAX_RECENTS = 12;

// Conservative limits; can be widened once backend constraints are known.
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const ALLOWED_EXTENSIONS = [".zip", ".7z", ".rar", ".log", ".csv", ".txt"];

/**
 * @typedef {"idle" | "queued" | "uploading" | "success" | "error" | "removed"} UploadState
 */

/**
 * @typedef {{
 *   id: string,
 *   file: File,
 *   status: UploadState,
 *   progress: number,
 *   validationErrors: string[],
 *   validationWarnings: string[],
 *   uploadError?: string
 * }} UploadItem
 */

/**
 * @typedef {{
 *   id: string,
 *   filename: string,
 *   sizeBytes: number,
 *   uploadedAt: string,
 *   status: "queued" | "processing" | "complete" | "failed",
 *   warnings: number,
 *   source: "live" | "mock"
 * }} RecentUpload
 */

function bytesToHuman(bytes) {
  if (!Number.isFinite(bytes)) return "-";
  const thresh = 1024;
  if (bytes < thresh) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let u = -1;
  let b = bytes;
  do {
    b /= thresh;
    u += 1;
  } while (b >= thresh && u < units.length - 1);
  return `${b.toFixed(b >= 10 ? 0 : 1)} ${units[u]}`;
}

function getFileExtensionLower(name) {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx).toLowerCase();
}

/**
 * Best-effort "structure" validation without parsing content:
 * - check non-empty
 * - check signature for zip if extension .zip (optional)
 *
 * @param {File} file
 * @returns {Promise<{ errors: string[], warnings: string[] }>}
 */
async function validateFile(file) {
  const errors = [];
  const warnings = [];

  if (!file) {
    return { errors: ["Invalid file."], warnings };
  }

  const ext = getFileExtensionLower(file.name);

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    errors.push(
      `Unsupported file type "${ext || "unknown"}". Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`
    );
  }

  if (file.size <= 0) {
    errors.push("File is empty.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.push(
      `File too large (${bytesToHuman(file.size)}). Max allowed is ${bytesToHuman(
        MAX_FILE_SIZE_BYTES
      )}.`
    );
  }

  // Heuristic: ZIP files usually begin with "PK".
  if (ext === ".zip" && file.size >= 2) {
    try {
      const buf = await file.slice(0, 4).arrayBuffer();
      const u8 = new Uint8Array(buf);
      const sig = String.fromCharCode(u8[0] || 0, u8[1] || 0);
      if (sig !== "PK") {
        warnings.push("ZIP signature not detected (file may still be valid).");
      }
    } catch (e) {
      warnings.push("Could not inspect file header for basic validation.");
    }
  }

  return { errors, warnings };
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function readRecentUploads() {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(RECENT_UPLOADS_KEY);
  const parsed = safeJsonParse(raw || "[]", []);
  if (!Array.isArray(parsed)) return [];
  // Lightweight validation:
  return parsed
    .filter((x) => x && typeof x === "object" && typeof x.id === "string" && typeof x.filename === "string")
    .slice(0, MAX_RECENTS);
}

function writeRecentUploads(items) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECENT_UPLOADS_KEY, JSON.stringify(items.slice(0, MAX_RECENTS)));
}

function statusTone(status) {
  if (status === "complete") return "primary";
  if (status === "processing" || status === "queued") return "secondary";
  if (status === "failed") return "danger";
  return "neutral";
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * PUBLIC_INTERFACE
 * UploadPage provides a complete log upload UX:
 * - drag & drop + file picker
 * - client-side validation
 * - list controls (remove/clear)
 * - per-file progress + overall status
 * - DataService integration with mock/live provider
 * - persisted Recent Uploads in localStorage
 *
 * Access is restricted to operator/admin via RequireRole at the route-level in App.js;
 * this component also includes an internal guard for defense-in-depth.
 *
 * @returns {JSX.Element}
 */
export default function UploadPage() {
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  const [isDragging, setIsDragging] = useState(false);
  const [items, setItems] = useState(/** @type {UploadItem[]} */ ([]));
  const [overallStatus, setOverallStatus] = useState(/** @type {"idle" | "validating" | "ready" | "uploading" | "done" | "error"} */ ("idle"));
  const [pageError, setPageError] = useState("");
  const [recentUploads, setRecentUploads] = useState(() => readRecentUploads());

  const validItems = useMemo(
    () => items.filter((it) => it.status !== "removed" && it.validationErrors.length === 0),
    [items]
  );

  const invalidCount = useMemo(
    () => items.filter((it) => it.status !== "removed" && it.validationErrors.length > 0).length,
    [items]
  );

  const anyUploading = useMemo(() => items.some((it) => it.status === "uploading"), [items]);

  const overallProgress = useMemo(() => {
    const active = items.filter((it) => it.status !== "removed");
    if (active.length === 0) return 0;
    const sum = active.reduce((acc, it) => acc + (Number.isFinite(it.progress) ? it.progress : 0), 0);
    return Math.round(sum / active.length);
  }, [items]);

  function onPickFilesClick() {
    setPageError("");
    inputRef.current?.click();
  }

  function clearAll() {
    setPageError("");
    setItems([]);
    setOverallStatus("idle");
  }

  function clearRecentUploads() {
    writeRecentUploads([]);
    setRecentUploads([]);
  }

  function removeItem(id) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "removed" } : it)));
  }

  function dedupeNewFiles(existing, incoming) {
    const existingKeys = new Set(
      existing
        .filter((it) => it.status !== "removed")
        .map((it) => `${it.file.name}::${it.file.size}::${it.file.lastModified}`)
    );

    /** @type {File[]} */
    const next = [];
    for (const f of incoming) {
      const key = `${f.name}::${f.size}::${f.lastModified}`;
      if (!existingKeys.has(key)) next.push(f);
    }
    return next;
  }

  async function addFiles(fileList) {
    setPageError("");
    if (!fileList || fileList.length === 0) return;

    setOverallStatus("validating");

    const incoming = Array.from(fileList);
    const deduped = dedupeNewFiles(items, incoming);

    if (deduped.length === 0) {
      setOverallStatus(items.length > 0 ? "ready" : "idle");
      return;
    }

    /** @type {UploadItem[]} */
    const newItems = [];
    for (const f of deduped) {
      const { errors, warnings } = await validateFile(f);
      newItems.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file: f,
        status: "idle",
        progress: 0,
        validationErrors: errors,
        validationWarnings: warnings,
      });
    }

    setItems((prev) => [...prev, ...newItems]);
    setOverallStatus("ready");
  }

  function handleInputChange(e) {
    const list = e.target.files;
    // Allow selecting same file again by clearing input value.
    e.target.value = "";
    addFiles(list);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const list = e.dataTransfer?.files;
    addFiles(list);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    // Only end drag when leaving the dropzone itself.
    if (e.currentTarget === e.target) setIsDragging(false);
  }

  function pushRecentUploads(newRecents) {
    const merged = [...newRecents, ...recentUploads]
      // de-dupe by id; if no id, de-dupe by filename+uploadedAt
      .reduce((acc, cur) => {
        const key = cur.id || `${cur.filename}::${cur.uploadedAt}`;
        if (acc.seen.has(key)) return acc;
        acc.seen.add(key);
        acc.items.push(cur);
        return acc;
      }, /** @type {{items: RecentUpload[], seen: Set<string>}} */ ({ items: [], seen: new Set() }))
      .items
      .slice(0, MAX_RECENTS);

    setRecentUploads(merged);
    writeRecentUploads(merged);
  }

  async function uploadAll() {
    setPageError("");
    if (anyUploading) return;

    const active = items.filter((it) => it.status !== "removed");
    if (active.length === 0) {
      setPageError("Add one or more files to upload.");
      return;
    }

    const valid = active.filter((it) => it.validationErrors.length === 0);
    if (valid.length === 0) {
      setPageError("Fix validation errors before uploading.");
      return;
    }

    // Mark queued
    setItems((prev) =>
      prev.map((it) => {
        if (it.status === "removed") return it;
        if (it.validationErrors.length > 0) return { ...it, status: "error", uploadError: "Validation failed." };
        return { ...it, status: "queued", progress: 0, uploadError: undefined };
      })
    );

    setOverallStatus("uploading");

    // Upload sequentially for better per-file progress reporting without adding deps / complex concurrency.
    /** @type {RecentUpload[]} */
    const newRecents = [];

    for (const it of valid) {
      // Set uploading
      setItems((prev) =>
        prev.map((p) => (p.id === it.id ? { ...p, status: "uploading", progress: 0, uploadError: undefined } : p))
      );

      try {
        // Provider supports only a single onProgress callback; when uploading one file at a time,
        // we can treat that callback as per-file progress.
        const resp = await dataService.uploadLogs([it.file], (pct) => {
          setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, progress: pct } : p)));
        });

        // If provider returns recentUploads, prefer that; otherwise, synthesize a recent entry.
        const nowIso = new Date().toISOString();
        if (resp && Array.isArray(resp.recentUploads) && resp.recentUploads.length > 0) {
          // Normalize mock provider shape to our RecentUpload
          const mapped = resp.recentUploads.map((r) => ({
            id: r.id || `${nowIso}-${Math.random().toString(16).slice(2)}`,
            filename: r.filename || it.file.name,
            sizeBytes: it.file.size,
            uploadedAt: r.uploadedAt || nowIso,
            status: r.status || "queued",
            warnings: Number.isFinite(r.warnings) ? r.warnings : 0,
            source: dataService.mode,
          }));
          // Only take the first that matches the file name, else take first.
          const match = mapped.find((m) => m.filename === it.file.name) || mapped[0];
          if (match) newRecents.push(match);
        } else {
          newRecents.push({
            id: `${nowIso}-${Math.random().toString(16).slice(2)}`,
            filename: it.file.name,
            sizeBytes: it.file.size,
            uploadedAt: nowIso,
            status: "queued",
            warnings: it.validationWarnings.length,
            source: dataService.mode,
          });
        }

        setItems((prev) =>
          prev.map((p) => (p.id === it.id ? { ...p, status: "success", progress: 100 } : p))
        );
      } catch (err) {
        const msg =
          (err && typeof err === "object" && "message" in err && String(err.message)) ||
          "Upload failed. Please try again.";

        setItems((prev) =>
          prev.map((p) =>
            p.id === it.id ? { ...p, status: "error", uploadError: msg, progress: Math.min(100, p.progress || 0) } : p
          )
        );
        setOverallStatus("error");
      }
    }

    if (newRecents.length > 0) pushRecentUploads(newRecents);

    // If any file is in error, keep overall error; otherwise done.
    const hadError = items.some((it) => it.status === "error");
    setOverallStatus(hadError ? "error" : "done");
  }

  return (
    <RequireRole allow={["operator", "admin"]}>
      <div className="pageGrid">
        <Card className="panel">
          <div className="panelHeader">
            <div>
              <div className="panelTitle">Upload Logs</div>
              <div className="panelSub op-muted">
                Upload and validate TEMS/drive logs. Current data mode:{" "}
                <strong>{dataService.mode}</strong>
              </div>
            </div>
            <div className={styles.headerBadges}>
              <Badge tone="primary">/upload</Badge>
              <Badge tone={dataService.mode === "live" ? "secondary" : "neutral"}>
                {dataService.mode === "live" ? "Live" : "Mock"}
              </Badge>
            </div>
          </div>

          <div className="panelBody">
            {pageError ? (
              <div className={styles.alert} role="alert">
                <div className={styles.alertTitle}>Action needed</div>
                <div className={styles.alertBody}>{pageError}</div>
              </div>
            ) : null}

            <div
              className={[
                styles.dropzone,
                isDragging ? styles.dropzoneActive : "",
                anyUploading ? styles.dropzoneDisabled : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onDrop={anyUploading ? undefined : handleDrop}
              onDragOver={anyUploading ? undefined : handleDragOver}
              onDragEnter={anyUploading ? undefined : handleDragEnter}
              onDragLeave={anyUploading ? undefined : handleDragLeave}
              role="button"
              tabIndex={0}
              aria-label="Drag and drop files here, or use the file picker"
              onKeyDown={(e) => {
                if (anyUploading) return;
                if (e.key === "Enter" || e.key === " ") onPickFilesClick();
              }}
              onClick={() => {
                if (anyUploading) return;
                onPickFilesClick();
              }}
            >
              <div className={styles.dropzoneInner}>
                <div className={styles.dropzoneTitle}>Drag & drop logs here</div>
                <div className={styles.dropzoneSub}>
                  Or <span className={styles.linkLike}>choose files</span>. Allowed:{" "}
                  {ALLOWED_EXTENSIONS.join(", ")}. Max size: {bytesToHuman(MAX_FILE_SIZE_BYTES)}.
                </div>

                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  className={styles.hiddenInput}
                  onChange={handleInputChange}
                  accept={ALLOWED_EXTENSIONS.join(",")}
                />
              </div>
            </div>

            <div className={styles.actionsRow}>
              <div className={styles.leftMeta}>
                <div className={styles.metaLine}>
                  <Badge tone="neutral">Overall</Badge>
                  <span className={styles.metaText}>
                    {overallStatus === "idle" ? "Idle" : null}
                    {overallStatus === "validating" ? "Validating…" : null}
                    {overallStatus === "ready" ? "Ready" : null}
                    {overallStatus === "uploading" ? "Uploading…" : null}
                    {overallStatus === "done" ? "Completed" : null}
                    {overallStatus === "error" ? "Completed with errors" : null}
                  </span>
                </div>

                <div className={styles.progressWrap} aria-label="Overall upload progress">
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${overallProgress}%` }} />
                  </div>
                  <div className={styles.progressPct}>{overallProgress}%</div>
                </div>

                {invalidCount > 0 ? (
                  <div className={styles.metaHint}>
                    <Badge tone="danger">{invalidCount} invalid</Badge> Fix errors to upload those files.
                  </div>
                ) : null}
              </div>

              <div className={styles.rightButtons}>
                <Button variant="ghost" onClick={clearAll} disabled={anyUploading || items.length === 0}>
                  Clear
                </Button>
                <Button
                  variant="secondary"
                  onClick={onPickFilesClick}
                  disabled={anyUploading}
                  ariaLabel="Pick files"
                >
                  Add files
                </Button>
                <Button
                  variant="primary"
                  onClick={uploadAll}
                  disabled={anyUploading || validItems.length === 0}
                  ariaLabel="Upload files"
                >
                  Upload
                </Button>
              </div>
            </div>

            <div className={styles.listHeader}>
              <div className={styles.listTitle}>Files</div>
              <div className={styles.listSub}>
                {items.filter((it) => it.status !== "removed").length === 0
                  ? "No files added yet."
                  : "Validation runs client-side before upload."}
              </div>
            </div>

            {items.filter((it) => it.status !== "removed").length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyTitle}>Drop logs to begin</div>
                <div className={styles.emptySub}>
                  We’ll validate file type and size locally, then upload using the current data provider.
                </div>
              </div>
            ) : (
              <div className={styles.fileList} role="list" aria-label="Selected files">
                {items
                  .filter((it) => it.status !== "removed")
                  .map((it) => {
                    const hasErrors = it.validationErrors.length > 0;
                    const hasWarnings = it.validationWarnings.length > 0;

                    const tone =
                      it.status === "success"
                        ? "primary"
                        : it.status === "error"
                          ? "danger"
                          : hasErrors
                            ? "danger"
                            : hasWarnings
                              ? "secondary"
                              : "neutral";

                    return (
                      <div key={it.id} className={styles.fileRow} role="listitem">
                        <div className={styles.fileMain}>
                          <div className={styles.fileTopLine}>
                            <div className={styles.fileName} title={it.file.name}>
                              {it.file.name}
                            </div>
                            <div className={styles.fileMeta}>
                              <span className={styles.fileSize}>{bytesToHuman(it.file.size)}</span>
                              <Badge tone={tone}>
                                {it.status === "uploading" ? "Uploading" : null}
                                {it.status === "queued" ? "Queued" : null}
                                {it.status === "success" ? "Uploaded" : null}
                                {it.status === "error" ? "Error" : null}
                                {(it.status === "idle" || it.status === "removed") && !hasErrors ? "Ready" : null}
                                {(it.status === "idle" || it.status === "removed") && hasErrors ? "Invalid" : null}
                              </Badge>
                            </div>
                          </div>

                          <div className={styles.progressTrackSm} aria-label={`Progress for ${it.file.name}`}>
                            <div className={styles.progressFillSm} style={{ width: `${it.progress}%` }} />
                          </div>

                          {hasErrors ? (
                            <ul className={styles.messageList} aria-label={`Validation errors for ${it.file.name}`}>
                              {it.validationErrors.map((m) => (
                                <li key={m} className={styles.msgError}>
                                  {m}
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          {!hasErrors && hasWarnings ? (
                            <ul className={styles.messageList} aria-label={`Validation warnings for ${it.file.name}`}>
                              {it.validationWarnings.map((m) => (
                                <li key={m} className={styles.msgWarn}>
                                  {m}
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          {it.uploadError ? (
                            <div className={styles.msgError} role="alert">
                              {it.uploadError}
                            </div>
                          ) : null}
                        </div>

                        <div className={styles.fileActions}>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={it.status === "uploading"}
                            onClick={() => removeItem(it.id)}
                            ariaLabel={`Remove ${it.file.name}`}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </Card>

        <Card className="panel">
          <div className="panelHeader">
            <div>
              <div className="panelTitle">Recent Uploads</div>
              <div className="panelSub op-muted">Persisted locally on this device (demo behavior).</div>
            </div>
            <div className={styles.headerBadges}>
              <Badge tone="secondary">Queue</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearRecentUploads}
                disabled={recentUploads.length === 0}
                ariaLabel="Clear recent uploads"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="panelBody">
            {recentUploads.length === 0 ? (
              <div className={styles.emptyRecent}>
                <div className={styles.emptyTitle}>No recent uploads</div>
                <div className={styles.emptySub}>Upload logs to populate this list.</div>
              </div>
            ) : (
              <div className={styles.recentList} role="list" aria-label="Recent uploads">
                {recentUploads.map((u) => (
                  <div key={u.id} className={styles.recentRow} role="listitem">
                    <div className={styles.recentMain}>
                      <div className={styles.recentTop}>
                        <div className={styles.recentName} title={u.filename}>
                          {u.filename}
                        </div>
                        <div className={styles.recentBadges}>
                          <Badge tone={statusTone(u.status)}>{u.status}</Badge>
                          {u.warnings > 0 ? <Badge tone="secondary">{u.warnings} warn</Badge> : null}
                          <Badge tone="neutral">{u.source}</Badge>
                        </div>
                      </div>
                      <div className={styles.recentMeta}>
                        <span>{bytesToHuman(u.sizeBytes)}</span>
                        <span className={styles.dotSep}>•</span>
                        <span className="op-muted">{formatTime(u.uploadedAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.recentFootnote}>
              <span className="op-muted">
                Note: backend-driven upload history will replace this local-only list when available.
              </span>
            </div>
          </div>
        </Card>
      </div>
    </RequireRole>
  );
}
