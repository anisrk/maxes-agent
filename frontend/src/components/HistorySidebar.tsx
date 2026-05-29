import type { HistoryEntry } from "../types";
import { GRADE_STYLES } from "../utils/grading";

interface Props {
  history: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  activeId: string | null;
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export function HistorySidebar({ history, onSelect, activeId }: Props) {
  return (
    <aside className="w-48 shrink-0">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden sticky top-6">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent</p>
        </div>

        {history.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-gray-400">No validations yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {history.map((entry) => {
              const gs = GRADE_STYLES[entry.grade];
              const isActive = entry.id === activeId;
              return (
                <li key={entry.id}>
                  <button
                    onClick={() => onSelect(entry)}
                    className={`w-full flex items-center gap-2.5 px-3 py-3 text-left transition-colors hover:bg-gray-50 ${isActive ? "bg-blue-50" : ""}`}
                  >
                    <span className={`text-base font-black shrink-0 ${gs.text}`}>{entry.grade}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-gray-700 truncate">
                        {entry.loan_id ?? "unknown"}
                      </p>
                      <p className="text-xs text-gray-400">{timeAgo(entry.timestamp)}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
