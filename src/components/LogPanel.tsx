import type { ReactNode, RefObject } from "react";

interface LogPanelProps {
  title: string;
  icon: ReactNode;
  lines: string[];
  expanded: boolean;
  emptyText: string;
  endRef: RefObject<HTMLDivElement>;
  onToggle: () => void;
  onClear: () => void;
}

const VISIBLE_LOG_LINES = 200;

export function LogPanel({
  title,
  icon,
  lines,
  expanded,
  emptyText,
  endRef,
  onToggle,
  onClear,
}: LogPanelProps) {
  const visibleLines = lines.length > VISIBLE_LOG_LINES ? lines.slice(-VISIBLE_LOG_LINES) : lines;

  return (
    <div className="card">
      <div
        className="card-header"
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={onToggle}
      >
        {icon}
        <h3>
          {title}
          {lines.length > 0 ? ` (${lines.length})` : ""}
        </h3>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button
            className="btn btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {expanded ? "Hide" : "Show"}
          </button>
          {lines.length > 0 && (
            <button
              className="btn btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="log-output">
          {visibleLines.length === 0 ? (
            <span className="text-muted">{emptyText}</span>
          ) : (
            visibleLines.map((line, i) => (
              <div
                key={`${i}-${line.slice(0, 24)}`}
                className={
                  line.toLowerCase().includes("error")
                    ? "log-line error"
                    : line.toLowerCase().includes("warn")
                      ? "log-line warn"
                      : "log-line"
                }
              >
                {line}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
