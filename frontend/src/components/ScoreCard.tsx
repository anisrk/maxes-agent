import type { AgentResponse } from "../types";
import {
  calculateGrade,
  GRADE_STYLES,
  MAXEX_FIELDS,
  fieldStatus,
} from "../utils/grading";
import { downloadValidationReport } from "../utils/pdf";

interface Props {
  response: AgentResponse;
}

export function ScoreCard({ response }: Props) {
  const { validation } = response;
  const { grade, score } = calculateGrade(validation);
  const styles = GRADE_STYLES[grade];

  return (
    <div className="space-y-5">
      {/* Grade + status row */}
      <div className={`flex items-center gap-5 p-4 rounded-xl border ${styles.bg} ${styles.border}`}>
        <div className={`text-7xl font-black leading-none ${styles.text}`}>{grade}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-semibold ${styles.text}`}>
              {validation.is_valid ? "Loan Approved" : "Loan Rejected"}
            </span>
            <span className="text-xs text-gray-400 font-mono">{validation.loan_id}</span>
          </div>
          <div className="text-xs text-gray-500 mb-2">Quality score: {score}/100</div>
          {/* Score bar */}
          <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                grade === "A" || grade === "B" ? "bg-emerald-500" :
                grade === "C" ? "bg-yellow-400" : "bg-red-500"
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
        <button
          onClick={() => downloadValidationReport(response)}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Report
        </button>
      </div>

      {/* Field badges grid */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Field Results</p>
        <div className="grid grid-cols-3 gap-2">
          {MAXEX_FIELDS.map((field) => {
            const status = fieldStatus(field, validation.violations, validation.warnings);
            return (
              <div
                key={field}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                  status === "violation"
                    ? "bg-red-50 border-red-200 text-red-700"
                    : status === "warning"
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700"
                }`}
              >
                <span className="truncate">{field}</span>
                <span className="ml-1 shrink-0">
                  {status === "violation" ? "✕" : status === "warning" ? "⚠" : "✓"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Violations */}
      {validation.violations.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
            Violations ({validation.violations.length})
          </p>
          <ul className="space-y-1.5">
            {validation.violations.map((v, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                <span className="shrink-0 mt-0.5">✕</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {validation.warnings.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
            Warnings ({validation.warnings.length})
          </p>
          <ul className="space-y-1.5">
            {validation.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {validation.violations.length === 0 && validation.warnings.length === 0 && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2">
          All MAXEX schema rules passed with no warnings.
        </p>
      )}
    </div>
  );
}
