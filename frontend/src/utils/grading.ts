import type { Grade, GradeResult, ValidationResult } from "../types";

export function calculateGrade(validation: ValidationResult): GradeResult {
  if (!validation.is_valid) {
    return validation.violations.length >= 3
      ? { grade: "F", score: 42 }
      : { grade: "D", score: 61 };
  }
  if (validation.warnings.length === 0) return { grade: "A", score: 98 };
  if (validation.warnings.length <= 2)  return { grade: "B", score: 84 };
  return { grade: "C", score: 71 };
}

export const GRADE_STYLES: Record<Grade, { text: string; bg: string; border: string; badge: string }> = {
  A: { text: "text-emerald-600", bg: "bg-emerald-50",  border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-800" },
  B: { text: "text-green-600",   bg: "bg-green-50",    border: "border-green-200",   badge: "bg-green-100 text-green-800"   },
  C: { text: "text-yellow-500",  bg: "bg-yellow-50",   border: "border-yellow-200",  badge: "bg-yellow-100 text-yellow-800" },
  D: { text: "text-orange-600",  bg: "bg-orange-50",   border: "border-orange-200",  badge: "bg-orange-100 text-orange-800" },
  F: { text: "text-red-600",     bg: "bg-red-50",      border: "border-red-200",     badge: "bg-red-100 text-red-800"       },
};

export const MAXEX_FIELDS = [
  "loan_id", "loan_type", "occupancy_type", "loan_amount",
  "ltv_ratio", "dti_ratio", "fico_score", "property_value",
  "borrower_income", "is_self_employed", "units", "state",
];

export function extractField(message: string): string | null {
  const match = message.match(/^([a-z_]+):/);
  return match ? match[1] : null;
}

export function fieldStatus(
  field: string,
  violations: string[],
  warnings: string[]
): "violation" | "warning" | "pass" {
  if (violations.some((v) => extractField(v) === field)) return "violation";
  if (warnings.some((w) => extractField(w) === field)) return "warning";
  return "pass";
}
