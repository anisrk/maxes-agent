interface Props {
  label: string;
  variant: "success" | "error" | "warning" | "info" | "neutral";
}

const styles: Record<Props["variant"], string> = {
  success: "bg-emerald-100 text-emerald-800 border-emerald-200",
  error:   "bg-red-100 text-red-800 border-red-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  info:    "bg-blue-100 text-blue-800 border-blue-200",
  neutral: "bg-gray-100 text-gray-600 border-gray-200",
};

export function StatusBadge({ label, variant }: Props) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[variant]}`}>
      {label}
    </span>
  );
}
