import type { DriftReport } from "../types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  report: DriftReport | null;
}

const severityVariant: Record<DriftReport["severity"], "success" | "info" | "warning" | "error"> = {
  none:   "success",
  low:    "info",
  medium: "warning",
  high:   "error",
};

const severityLabel: Record<DriftReport["severity"], string> = {
  none:   "No Drift",
  low:    "Low Drift",
  medium: "Medium Drift",
  high:   "High Drift",
};

export function DriftPanel({ report }: Props) {
  if (!report) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <StatusBadge
          label={severityLabel[report.severity]}
          variant={severityVariant[report.severity]}
        />
        <StatusBadge
          label={report.detected ? "Drift Detected" : "Schema Conformant"}
          variant={report.detected ? "warning" : "success"}
        />
      </div>

      {report.fields_changed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Drifted Fields ({report.fields_changed.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {report.fields_changed.map((f) => (
              <span key={f} className="font-mono text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded px-2 py-1">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Recommendation</h3>
        <p className={`text-sm rounded-md border px-3 py-2 leading-relaxed ${
          report.detected
            ? "bg-amber-50 border-amber-100 text-amber-800"
            : "bg-emerald-50 border-emerald-100 text-emerald-800"
        }`}>
          {report.recommendation}
        </p>
      </div>
    </div>
  );
}
