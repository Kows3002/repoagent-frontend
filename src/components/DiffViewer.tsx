import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
} from "lucide-react";
import { getDiffStats, parseUnifiedDiff } from "../lib/diff";
import type { DiffFile } from "../lib/diff";

export interface DiffViewerProps {
  diff: string;
  filename?: string;
  isExample?: boolean;
}

function FileDiff({ file }: { file: DiffFile }) {
  const [expanded, setExpanded] = useState(true);
  const tableId = useId();

  return (
    <section className="diff-file" aria-label={`Changes to ${file.filename}`}>
      <button
        className="diff-file-header"
        type="button"
        aria-expanded={expanded}
        aria-controls={tableId}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? (
          <ChevronDown size={14} aria-hidden="true" />
        ) : (
          <ChevronRight size={14} aria-hidden="true" />
        )}
        <FileCode2 size={15} aria-hidden="true" />
        <span className="diff-file-name">{file.filename}</span>
        <span
          className="diff-stats"
          aria-label={`${file.additions} additions, ${file.deletions} deletions`}
        >
          <span className="diff-add-count">+{file.additions}</span>
          <span className="diff-remove-count">−{file.deletions}</span>
        </span>
      </button>
      <div
        className="diff-scroll"
        id={tableId}
        hidden={!expanded}
        tabIndex={expanded ? 0 : -1}
        role="region"
        aria-label={`Scrollable diff for ${file.filename}`}
      >
        <table
          className="diff-table"
          aria-label={`Unified diff for ${file.filename}`}
        >
          <tbody>
            {file.lines.map((line, index) => (
              <tr key={index} className={`diff-line diff-line-${line.type}`}>
                <td
                  className="diff-line-number"
                  aria-label={
                    line.oldNumber === undefined
                      ? undefined
                      : `Original line ${line.oldNumber}`
                  }
                >
                  {line.oldNumber}
                </td>
                <td
                  className="diff-line-number"
                  aria-label={
                    line.newNumber === undefined
                      ? undefined
                      : `New line ${line.newNumber}`
                  }
                >
                  {line.newNumber}
                </td>
                <td
                  className="diff-line-marker"
                  aria-label={
                    line.type === "add"
                      ? "Added"
                      : line.type === "remove"
                        ? "Removed"
                        : undefined
                  }
                >
                  {line.type === "add"
                    ? "+"
                    : line.type === "remove"
                      ? "−"
                      : " "}
                </td>
                <td className="diff-line-code">
                  <code>{line.text || " "}</code>
                </td>
              </tr>
            ))}
            {file.lines.length === 0 && (
              <tr className="diff-line diff-line-meta">
                <td colSpan={4} className="diff-line-code">
                  File metadata changed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DiffViewer({
  diff,
  filename,
  isExample = false,
}: DiffViewerProps) {
  const files = useMemo(
    () => parseUnifiedDiff(diff, filename),
    [diff, filename],
  );
  const stats = useMemo(() => getDiffStats(files), [files]);
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copied" | "unavailable"
  >("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(resetTimer.current), []);
  useEffect(() => {
    clearTimeout(resetTimer.current);
    setCopyStatus("idle");
  }, [diff]);

  async function copyDiff() {
    clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(diff);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("unavailable");
    }
    resetTimer.current = setTimeout(() => setCopyStatus("idle"), 3000);
  }

  if (files.length === 0) return null;

  return (
    <div className="diff-viewer">
      <div className="diff-toolbar">
        <div className="diff-summary">
          <span>
            {stats.files} {stats.files === 1 ? "file" : "files"}{" "}
            {isExample ? "in this example" : "changed"}
          </span>
          <span className="diff-add-count">+{stats.additions}</span>
          <span className="diff-remove-count">−{stats.deletions}</span>
        </div>
        <button
          className="diff-copy-button"
          type="button"
          onClick={() => void copyDiff()}
          aria-label="Copy diff to clipboard"
        >
          {copyStatus === "copied" ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
          <span aria-live="polite">
            {copyStatus === "copied"
              ? "Copied"
              : copyStatus === "unavailable"
                ? "Copy unavailable"
                : "Copy diff"}
          </span>
        </button>
      </div>
      {files.map((file, index) => (
        <FileDiff key={`${file.filename}-${index}`} file={file} />
      ))}
    </div>
  );
}
