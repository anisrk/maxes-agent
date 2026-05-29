import { useState, useEffect, useRef } from "react";
import { validateLoanStream } from "../api";
import { calculateGrade, GRADE_STYLES, extractField } from "../utils/grading";
import { formatFileSize } from "../utils/csv";
import type { UploadFormat } from "../utils/csv";
import { FileUploadZone } from "./FileUploadZone";
import type { BatchLoanResult, BatchSummary, NodeStatus, PipelineNode, SchemaType, StreamEvent } from "../types";
import { downloadContractPDF } from "../utils/pdf";

// ── Types ────────────────────────────────────────────────────────────────────

type RowStatus = "waiting" | "running" | "complete" | "error" | "cancelled";

interface LoanRow {
  index: number;
  loanData: object;
  loan_id: string | null;
  status: RowStatus;
  nodes: PipelineNode[];
  result: BatchLoanResult | null;
  error: string | null;
}

interface Props {
  schemaType: SchemaType;
  loans: object[] | null;
  filename?: string;
  fileSize?: number;
  onFile: (content: string, format: UploadFormat, filename: string, fileSize: number) => void;
  onReset: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePendingNodes(): PipelineNode[] {
  return [
    { id: "validator",             label: "Validator", status: "pending" },
    { id: "contract_generator",    label: "Contract",  status: "pending" },
    { id: "schema_drift_detector", label: "Drift",     status: "pending" },
  ];
}

function patchNode(
  nodes: PipelineNode[],
  id: PipelineNode["id"],
  patch: Partial<PipelineNode>
): PipelineNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
}

function nodeDuration(node: PipelineNode): string | null {
  if (!node.startedAt || !node.completedAt) return null;
  const ms = node.completedAt - node.startedAt;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}


function rowsFromResults(results: BatchLoanResult[]): LoanRow[] {
  return results.map((r) => ({
    index: r.index,
    loanData: {},
    loan_id: r.loan_id,
    status: "complete" as RowStatus,
    nodes: [
      { id: "validator"             as const, label: "Validator", status: "complete"                                            as const },
      { id: "contract_generator"    as const, label: "Contract",  status: (r.response.validation.is_valid ? "complete" : "skipped") as NodeStatus },
      { id: "schema_drift_detector" as const, label: "Drift",     status: "complete"                                            as const },
    ],
    result: r,
    error: null,
  }));
}

function nodeTime(node?: PipelineNode): string {
  if (!node?.startedAt || !node?.completedAt) return "";
  const ms = node.completedAt - node.startedAt;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function downloadBatchCsv(results: BatchLoanResult[], rows: LoanRow[]) {
  const validatedAt = new Date().toISOString();
  const headers = [
    "loan_id", "grade", "score", "status",
    "violations_count", "warnings_count", "most_common_error",
    "validator_time", "contract_time", "drift_time", "validated_at",
  ];
  const csvRows = results.map((r) => {
    const row = rows.find((lr) => lr.index === r.index);
    const fieldCounts: Record<string, number> = {};
    for (const v of r.response.validation.violations) {
      const f = extractField(v);
      if (f) fieldCounts[f] = (fieldCounts[f] ?? 0) + 1;
    }
    const mostCommonError = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    return [
      r.loan_id ?? `Loan #${r.index + 1}`,
      r.grade,
      r.score,
      r.response.validation.is_valid ? "PASS" : "FAIL",
      r.response.validation.violations.length,
      r.response.validation.warnings.length,
      mostCommonError,
      nodeTime(row?.nodes.find((n) => n.id === "validator")),
      nodeTime(row?.nodes.find((n) => n.id === "contract_generator")),
      nodeTime(row?.nodes.find((n) => n.id === "schema_drift_detector")),
      validatedAt,
    ];
  });
  const csv = [headers, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `maxex-batch-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Mini Pipeline ────────────────────────────────────────────────────────────

const MINI_STATUS: Record<PipelineNode["status"], { border: string; bg: string; text: string; sym: string }> = {
  idle:       { border: "border-gray-200",    bg: "bg-gray-50",    text: "text-gray-300",    sym: "○" },
  pending:    { border: "border-gray-300",    bg: "bg-gray-50",    text: "text-gray-400",    sym: "○" },
  processing: { border: "border-blue-400",    bg: "bg-blue-50",    text: "text-blue-500",    sym: "◉" },
  complete:   { border: "border-emerald-400", bg: "bg-emerald-50", text: "text-emerald-600", sym: "✓" },
  failed:     { border: "border-red-400",     bg: "bg-red-50",     text: "text-red-600",     sym: "✕" },
  skipped:    { border: "border-gray-200",    bg: "bg-gray-50",    text: "text-gray-400",    sym: "—" },
};

function MiniPipeline({ nodes }: { nodes: PipelineNode[] }) {
  return (
    <div className="flex items-start">
      {nodes.map((node, i) => {
        const s = MINI_STATUS[node.status];
        const isProcessing = node.status === "processing";
        const dur = nodeDuration(node);
        const arrowActive =
          nodes[i - 1]?.status === "complete" ||
          node.status === "processing" ||
          node.status === "complete";

        return (
          <div key={node.id} className="flex items-start">
            {/* Arrow centered on the 24px circle */}
            {i > 0 && (
              <div className="flex items-center h-6 shrink-0">
                <div className={`h-px w-4 transition-colors duration-300 ${arrowActive ? "bg-blue-400" : "bg-gray-200"}`} />
                <svg
                  className={`w-2 h-2 transition-colors duration-300 ${arrowActive ? "text-blue-400" : "text-gray-300"}`}
                  viewBox="0 0 8 8"
                  fill="currentColor"
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
              </div>
            )}

            {/* Node column */}
            <div className="flex flex-col items-center gap-0.5 min-w-[52px]">
              <div className={`relative w-6 h-6 rounded-full border-2 flex items-center justify-center ${s.border} ${s.bg}`}>
                {isProcessing && (
                  <span className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping opacity-40" />
                )}
                <span className={`text-[10px] font-bold leading-none ${s.text} ${isProcessing ? "animate-pulse" : ""}`}>
                  {s.sym}
                </span>
              </div>
              <span className="text-[8px] text-gray-500 leading-tight text-center">{node.label}</span>
              {dur && <span className="text-[8px] text-gray-400 leading-tight">{dur}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Loan Row Card ─────────────────────────────────────────────────────────────

function LoanRowCard({
  row,
  isExpanded,
  onToggle,
}: {
  row: LoanRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const gs = row.result ? GRADE_STYLES[row.result.grade] : null;
  const canExpand = row.status === "complete" || row.status === "error";

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all duration-200 ${
        row.status === "running"
          ? "border-blue-300 shadow shadow-blue-100"
          : row.status === "waiting"
          ? "border-gray-100 opacity-60"
          : row.status === "cancelled"
          ? "border-gray-100 opacity-40"
          : "border-gray-200"
      }`}
    >
      <button
        onClick={onToggle}
        disabled={!canExpand}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left disabled:cursor-default"
      >
        {/* Grade or spinner */}
        <div className="w-5 text-center shrink-0">
          {row.result ? (
            <span className={`text-sm font-black ${gs!.text}`}>{row.result.grade}</span>
          ) : row.status === "running" ? (
            <svg className="animate-spin h-3.5 w-3.5 text-blue-500 mx-auto" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <span className="text-[10px] text-gray-300">—</span>
          )}
        </div>

        {/* Loan ID */}
        <span className="text-xs font-mono text-gray-700 w-36 truncate shrink-0">
          {row.loan_id ?? `Loan #${row.index + 1}`}
        </span>

        {/* Mini pipeline */}
        <div className="flex-1 flex justify-center">
          <MiniPipeline nodes={row.nodes} />
        </div>

        {/* Result badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          {row.result && (
            <>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                  row.result.response.validation.is_valid
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                {row.result.response.validation.is_valid ? "PASS" : "FAIL"}
              </span>
              {row.result.response.validation.warnings.length > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700">
                  {row.result.response.validation.warnings.length}w
                </span>
              )}
              {row.result.response.validation.is_valid && row.result.response.contract && (
                <button
                  onClick={(e) => { e.stopPropagation(); downloadContractPDF(row.result!.response.contract!); }}
                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                  title={`Download contract for ${row.loan_id}`}
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Contract
                </button>
              )}
            </>
          )}
          {row.status === "cancelled" && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-gray-100 border-gray-200 text-gray-500">
              Cancelled
            </span>
          )}
          {row.status === "error" && !row.result && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-red-50 border-red-200 text-red-700">
              ERR
            </span>
          )}
          {canExpand && (
            <svg
              className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-1.5">
          {row.result?.response.validation.violations.map((v, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-red-700">
              <span className="shrink-0">✕</span>
              <span>{v}</span>
            </div>
          ))}
          {row.result?.response.validation.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
              <span className="shrink-0">⚠</span>
              <span>{w}</span>
            </div>
          ))}
          {row.result &&
            row.result.response.validation.violations.length === 0 &&
            row.result.response.validation.warnings.length === 0 && (
              <div className="text-xs text-emerald-700">All rules passed.</div>
            )}
          {row.error && !row.result && (
            <div className="text-xs text-red-600">{row.error}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function BatchPanel({ schemaType, loans, filename, fileSize, onFile, onReset }: Props) {
  const [loanRows, setLoanRows] = useState<LoanRow[]>(() => {
    if (loans !== null) return [];
    try {
      const saved = localStorage.getItem("maxex_batch_summary");
      if (!saved) return [];
      return rowsFromResults((JSON.parse(saved) as BatchSummary).results);
    } catch { return []; }
  });
  const [processing, setProcessing] = useState(false);
  const [summary, setSummary] = useState<BatchSummary | null>(() => {
    if (loans !== null) return null;
    try {
      const saved = localStorage.getItem("maxex_batch_summary");
      return saved ? (JSON.parse(saved) as BatchSummary) : null;
    } catch { return null; }
  });
  const [expanded, setExpanded]         = useState<number | null>(null);
  const [stopping, setStopping]         = useState(false);
  const [stoppedAt, setStoppedAt]       = useState<{ completed: number; total: number } | null>(null);
  const abortRef                        = useRef<AbortController | null>(null);
  const resultsRef                      = useRef<BatchLoanResult[]>([]);
  const stopRequestedRef                = useRef(false);

  // When a new file is uploaded, start fresh and clear any saved state
  useEffect(() => {
    abortRef.current?.abort();
    setProcessing(false);
    setStopping(false);
    stopRequestedRef.current = false;
    setStoppedAt(null);
    setExpanded(null);
    if (loans !== null) {
      setLoanRows([]);
      setSummary(null);
      localStorage.removeItem("maxex_batch_summary");
    }
  }, [loans]);

  function handleStop() {
    stopRequestedRef.current = true;
    setStopping(true);
  }

  // Persist completed batch summary across hard refreshes
  useEffect(() => {
    if (summary) localStorage.setItem("maxex_batch_summary", JSON.stringify(summary));
  }, [summary]);

  async function handleRun() {
    if (!loans) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Clear stale persisted data before a new run starts
    localStorage.removeItem("maxex_batch_summary");
    resultsRef.current = [];
    setSummary(null);
    setStoppedAt(null);
    setExpanded(null);
    setProcessing(true);
    stopRequestedRef.current = false;
    setStopping(false);

    setLoanRows(
      loans.map((loan, i) => ({
        index: i,
        loanData: loan,
        loan_id: ((loan as Record<string, unknown>).loan_id as string) ?? null,
        status: "waiting",
        nodes: makePendingNodes(),
        result: null,
        error: null,
      }))
    );

    for (let i = 0; i < loans.length; i++) {
      if (ctrl.signal.aborted) break;

      // Activate this row
      setLoanRows((prev) =>
        prev.map((r, idx) =>
          idx === i ? { ...r, status: "running", nodes: makePendingNodes() } : r
        )
      );

      let rowResult: BatchLoanResult | null = null;
      let rowError: string | null = null;

      try {
        await validateLoanStream(
          JSON.stringify(loans[i]),
          schemaType,
          (event: StreamEvent) => {
            if (event.type === "node_start" && event.node) {
              setLoanRows((prev) =>
                prev.map((r, idx) =>
                  idx === i
                    ? { ...r, nodes: patchNode(r.nodes, event.node!, { status: "processing", startedAt: Date.now(), completedAt: undefined }) }
                    : r
                )
              );
            } else if (event.type === "node_done" && event.node) {
              setLoanRows((prev) =>
                prev.map((r, idx) =>
                  idx === i
                    ? { ...r, nodes: patchNode(r.nodes, event.node!, { status: "complete", completedAt: Date.now() }) }
                    : r
                )
              );
            } else if (event.type === "node_skip" && event.node) {
              setLoanRows((prev) =>
                prev.map((r, idx) =>
                  idx === i
                    ? { ...r, nodes: patchNode(r.nodes, event.node!, { status: "skipped", completedAt: Date.now() }) }
                    : r
                )
              );
            } else if (event.type === "done" && event.result) {
              const { grade, score } = calculateGrade(event.result.validation);
              rowResult = { index: i, loan_id: event.result.loan_id, response: event.result, grade, score };
            } else if (event.type === "error") {
              rowError = event.message ?? "Unknown error";
              setLoanRows((prev) =>
                prev.map((r, idx) =>
                  idx === i
                    ? {
                        ...r,
                        nodes: r.nodes.map((n) =>
                          n.status === "processing" ? { ...n, status: "failed", completedAt: Date.now() } : n
                        ),
                      }
                    : r
                )
              );
            }
          },
          ctrl.signal
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          rowError = err instanceof Error ? err.message : "Unknown error";
        }
      }

      // Finalize this row
      setLoanRows((prev) =>
        prev.map((r, idx) =>
          idx === i
            ? { ...r, status: rowResult ? "complete" : "error", result: rowResult, error: rowError }
            : r
        )
      );

      if (rowResult) resultsRef.current.push(rowResult);

      // Stop requested — finish this loan, mark remaining as cancelled, exit loop
      if (stopRequestedRef.current) {
        setLoanRows((prev) =>
          prev.map((r) =>
            r.status === "waiting"
              ? { ...r, status: "cancelled", nodes: r.nodes.map((n) => ({ ...n, status: "skipped" as const })) }
              : r
          )
        );
        setStoppedAt({ completed: resultsRef.current.length, total: loans.length });
        break;
      }
    }

    // Build summary from completed results
    const results = resultsRef.current;
    if (results.length > 0) {
      const fieldCounts: Record<string, number> = {};
      for (const r of results) {
        for (const v of r.response.validation.violations) {
          const f = extractField(v);
          if (f) fieldCounts[f] = (fieldCounts[f] ?? 0) + 1;
        }
      }
      setSummary({
        total: results.length,
        passed: results.filter((r) => r.response.validation.is_valid).length,
        failed: results.filter((r) => !r.response.validation.is_valid).length,
        withWarnings: results.filter((r) => r.response.validation.warnings.length > 0).length,
        mostCommonErrorField: Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        results,
      });
    }

    setStopping(false);
    setProcessing(false);
  }

  // ── Empty state — only when there's truly nothing to show ───────────────
  if (!loans && !summary && loanRows.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-400 text-center">
          Upload a CSV or JSON array — each row or element is treated as a separate loan record
        </p>
        <FileUploadZone onFile={onFile} />
      </div>
    );
  }

  const currentIndex = loanRows.findIndex((r) => r.status === "running");

  return (
    <div className="space-y-5">
      {/* Restored-session banner — shown when no file is loaded but old results exist */}
      {!loans && summary && (
        <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-xs text-amber-700">Showing results from last session. Upload a new file to run a fresh batch.</span>
          <button
            onClick={() => { setSummary(null); setLoanRows([]); localStorage.removeItem("maxex_batch_summary"); }}
            className="text-[10px] font-medium text-amber-600 hover:text-amber-800 underline underline-offset-2 shrink-0 ml-3"
          >
            Clear
          </button>
        </div>
      )}

      {/* File info bar — only when a file is loaded */}
      {loans && <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="w-10 h-10 rounded-lg bg-white border border-blue-200 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-900 truncate">{filename ?? "Uploaded file"}</p>
          <p className="text-xs text-blue-600 mt-0.5">
            {loans.length} loan record{loans.length !== 1 ? "s" : ""}
            {fileSize ? ` · ${formatFileSize(fileSize)}` : ""}
            {processing && currentIndex >= 0 && ` · Validating ${currentIndex + 1} of ${loans.length}…`}
            {summary && !processing && ` · ${summary.passed} passed, ${summary.failed} failed`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {summary && !processing && (
            <button
              onClick={() => downloadBatchCsv(summary.results, loanRows)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs font-medium hover:bg-blue-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Report
            </button>
          )}
          {summary && !processing && (
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
              title="Clear all results and upload a new file"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              New Validation
            </button>
          )}
          {processing && !stopping && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="8" height="8" rx="1" />
              </svg>
              Stop Batch
            </button>
          )}
          {processing && stopping && (
            <button disabled className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-400 text-xs font-medium cursor-not-allowed">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Stopping…
            </button>
          )}
          <button
            onClick={handleRun}
            disabled={processing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Validating…
              </>
            ) : summary ? "Re-run" : "Validate All"}
          </button>
        </div>
      </div>}

      {/* Stopped banner */}
      {stoppedAt && !processing && (
        <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="2" width="8" height="8" rx="1" />
          </svg>
          <span className="text-amber-700 font-medium">
            Batch stopped · {stoppedAt.completed} of {stoppedAt.total} loan{stoppedAt.total !== 1 ? "s" : ""} processed
          </span>
        </div>
      )}

      {/* Summary dashboard — shown only after all complete */}
      {summary && !processing && (
        <div className="space-y-3">
          {/* Download button row — shown here when no file info bar is visible */}
          {!loans && (
            <div className="flex justify-end">
              <button
                onClick={() => downloadBatchCsv(summary.results, loanRows)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Report
              </button>
            </div>
          )}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total",    value: summary.total,        color: "text-gray-700",    bg: "bg-gray-50 border-gray-200"       },
              { label: "Passed",   value: summary.passed,       color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
              { label: "Failed",   value: summary.failed,       color: "text-red-700",     bg: "bg-red-50 border-red-200"         },
              { label: "Warnings", value: summary.withWarnings, color: "text-amber-700",   bg: "bg-amber-50 border-amber-200"     },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg}`}>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          {summary.mostCommonErrorField && (
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span>Most common error field:</span>
              <span className="font-mono font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                {summary.mostCommonErrorField}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Per-loan pipeline rows */}
      {loanRows.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Loan Pipeline</p>
          <div className="space-y-1.5">
            {loanRows.map((row) => (
              <LoanRowCard
                key={row.index}
                row={row}
                isExpanded={expanded === row.index}
                onToggle={() => setExpanded(expanded === row.index ? null : row.index)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
