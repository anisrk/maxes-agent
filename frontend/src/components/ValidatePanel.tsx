import type { ValidationResult } from "../types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  result: ValidationResult | null;
}

export function ValidatePanel({ result }: Props) {
  if (!result) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-500">Status</span>
        <StatusBadge
          label={result.is_valid ? "VALID" : "INVALID"}
          variant={result.is_valid ? "success" : "error"}
        />
        {result.loan_id && (
          <span className="text-xs text-gray-400 font-mono">{result.loan_id}</span>
        )}
      </div>

      {result.violations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-700 mb-2">
            Violations ({result.violations.length})
          </h3>
          <ul className="space-y-1.5">
            {result.violations.map((v, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                <span className="mt-0.5 shrink-0">✕</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-700 mb-2">
            Warnings ({result.warnings.length})
          </h3>
          <ul className="space-y-1.5">
            {result.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.violations.length === 0 && result.warnings.length === 0 && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2">
          All MAXEX schema rules passed with no warnings.
        </p>
      )}
    </div>
  );
}
