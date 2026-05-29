import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { validateLoanStream } from "./api";
import { ScoreCard } from "./components/ScoreCard";
import { ContractPanel } from "./components/ContractPanel";
import { DriftPanel } from "./components/DriftPanel";
import { BatchPanel } from "./components/BatchPanel";
import { HistorySidebar } from "./components/HistorySidebar";
import { PipelineViz, makeInitialNodes } from "./components/PipelineViz";
import { FileUploadZone } from "./components/FileUploadZone";
import { detectFormat } from "./detectFormat";
import { calculateGrade } from "./utils/grading";
import { parseCsv } from "./utils/csv";
import type { UploadFormat } from "./utils/csv";
import type {
  AgentResponse, HistoryEntry, MarkupFormat,
  PipelineNode, SchemaType, StreamEvent, Tab,
} from "./types";

const TABS: { id: Tab; label: string }[] = [
  { id: "validate", label: "Validate" },
  { id: "contract", label: "Generate Contract" },
  { id: "drift",    label: "Schema Drift" },
  { id: "batch",    label: "Batch" },
];

const SCHEMA_OPTIONS: { value: SchemaType; label: string; desc: string }[] = [
  { value: "conventional", label: "Conventional", desc: "Standard conforming loans" },
  { value: "fha",          label: "FHA",          desc: "Government-backed, flexible requirements" },
  { value: "dscr",         label: "DSCR",         desc: "Investment property, rental income based" },
  { value: "jumbo",        label: "Jumbo",         desc: "High-value loans above conforming limits" },
];

const FORMAT_COLORS: Record<MarkupFormat, string> = {
  json: "bg-yellow-100 text-yellow-800 border-yellow-200",
  yaml: "bg-purple-100 text-purple-800 border-purple-200",
  xml:  "bg-green-100  text-green-800  border-green-200",
  toml: "bg-orange-100 text-orange-800 border-orange-200",
};

function updateNode(
  nodes: PipelineNode[],
  id: PipelineNode["id"],
  patch: Partial<PipelineNode>
): PipelineNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
}

export default function App() {
  const [activeTab, setActiveTab]         = useState<Tab>("validate");
  const [schemaType, setSchemaType]       = useState<SchemaType>("conventional");
  const [schemaOpen, setSchemaOpen]       = useState(false);
  const [input, setInput]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [response, setResponse] = useState<AgentResponse | null>(() => {
    try {
      const saved = localStorage.getItem("maxex_response");
      return saved ? (JSON.parse(saved) as AgentResponse) : null;
    } catch { return null; }
  });
  const [apiError, setApiError]           = useState<string | null>(null);
  const [history, setHistory]             = useState<HistoryEntry[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [pipelineNodes, setPipelineNodes] = useState<PipelineNode[]>(makeInitialNodes());

  const [batchLoans, setBatchLoans]       = useState<object[] | null>(null);
  const [batchFilename, setBatchFilename] = useState<string>("");
  const [batchFileSize, setBatchFileSize] = useState<number>(0);

  const [cancelled, setCancelled]           = useState(false);

  // Incrementing these keys forces FileUploadZone / BatchPanel to remount clean
  const [uploadResetKey, setUploadResetKey] = useState(0);
  const [batchResetKey,  setBatchResetKey]  = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const detectedFormat = useMemo(() => detectFormat(input), [input]);
  const hasInput = input.trim().length > 0;

  // ── Reset helpers ────────────────────────────────────────────────────────

  function clearValidateState() {
    setInput("");
    setResponse(null);
    setApiError(null);
    setActiveHistoryId(null);
    setPipelineNodes(makeInitialNodes());
    setCancelled(false);
  }

  function handleStop() {
    abortRef.current?.abort();
    setLoading(false);
    setCancelled(true);
    setPipelineNodes(makeInitialNodes());
  }

  function clearBatchState() {
    localStorage.removeItem("maxex_batch_summary");
    setBatchLoans(null);
    setBatchFilename("");
    setBatchFileSize(0);
    setBatchResetKey((k) => k + 1);
  }

  // "New Validation" button — wipes everything, forces both zones to remount clean
  function handleReset() {
    clearValidateState();
    clearBatchState();
    setUploadResetKey((k) => k + 1);
  }

  // Called by FileUploadZone X button (the component already cleared its own display state)
  function handleClearFile() {
    clearValidateState();
    clearBatchState();
  }

  // Persist last single-loan result across hard refreshes
  useEffect(() => {
    if (response) {
      localStorage.setItem("maxex_response", JSON.stringify(response));
    } else {
      localStorage.removeItem("maxex_response");
    }
  }, [response]);

  function handleFileUpload(content: string, format: UploadFormat, filename: string, fileSize: number) {
    // Always wipe all previous results before processing a new file
    setResponse(null);
    setApiError(null);
    setActiveHistoryId(null);
    setPipelineNodes(makeInitialNodes());
    setCancelled(false);

    if (format === "csv") {
      const rows = parseCsv(content);
      if (rows.length === 0) return;
      setBatchLoans(rows);
      setBatchFilename(filename);
      setBatchFileSize(fileSize);
      setActiveTab("batch");
    } else if (format === "json") {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setBatchLoans(parsed);
          setBatchFilename(filename);
          setBatchFileSize(fileSize);
          setActiveTab("batch");
        } else {
          setInput(content);
        }
      } catch {
        setInput(content);
      }
    } else {
      setInput(content);
    }
  }

  const handleEvent = useCallback((event: StreamEvent) => {
    if (event.type === "node_start" && event.node) {
      setPipelineNodes((prev) =>
        updateNode(prev, event.node!, { status: "processing", startedAt: Date.now(), completedAt: undefined })
      );
    } else if (event.type === "node_done" && event.node) {
      setPipelineNodes((prev) =>
        updateNode(prev, event.node!, { status: "complete", completedAt: Date.now() })
      );
    } else if (event.type === "node_skip" && event.node) {
      setPipelineNodes((prev) =>
        updateNode(prev, event.node!, { status: "skipped", completedAt: Date.now() })
      );
    } else if (event.type === "done" && event.result) {
      const result = event.result as AgentResponse;
      setResponse(result);
      setCancelled(false);
      setLoading(false);

      const { grade, score } = calculateGrade(result.validation);
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        loan_id: result.loan_id,
        grade,
        score,
        timestamp: new Date(),
        response: result,
        schemaType,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 5));
      setActiveHistoryId(entry.id);

      if (activeTab === "batch") setActiveTab("validate");
    } else if (event.type === "error") {
      setApiError(event.message ?? "Unknown error");
      setLoading(false);
      setPipelineNodes((prev) =>
        prev.map((n) => (n.status === "processing" ? { ...n, status: "failed", completedAt: Date.now() } : n))
      );
    }
  }, [activeTab, schemaType]);

  async function handleSubmit() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setApiError(null);
    setResponse(null);
    setCancelled(false);
    setActiveHistoryId(null);
    setPipelineNodes(makeInitialNodes().map((n) => ({ ...n, status: "pending" as const })));

    try {
      await validateLoanStream(input, schemaType, handleEvent, controller.signal);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // Handled by handleStop() — loading/cancelled state already set
      } else {
        setApiError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      }
    }
  }

  function restoreHistory(entry: HistoryEntry) {
    setResponse(entry.response);
    setActiveHistoryId(entry.id);
    setApiError(null);
    if (activeTab === "batch") setActiveTab("validate");
  }

  const tabBadge: Record<Tab, string | null> = {
    validate: response ? (response.validation.is_valid ? "✓" : "✕") : null,
    contract: response?.contract
      ? "✓"
      : response?.validation && !response.validation.is_valid ? "—" : null,
    drift: response?.drift_report
      ? response.drift_report.detected ? response.drift_report.severity.toUpperCase() : "✓"
      : null,
    batch: null,
  };

  const selectedSchema = SCHEMA_OPTIONS.find((o) => o.value === schemaType)!;

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      {/* Dark navy header */}
      <header className="bg-[#0a1628] border-b border-white/10 shadow-xl">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-blue-500 rounded-lg px-3 py-2 shadow-lg shadow-blue-500/30">
              <span className="text-white text-sm font-black tracking-[0.2em]">MAXEX</span>
            </div>
            <div className="h-7 w-px bg-white/15" />
            <span className="text-white/90 text-sm font-medium tracking-wide">Mortgage Schema Validator</span>
          </div>

          {/* Schema Registry dropdown */}
          <div className="relative ml-4" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setSchemaOpen(false)}>
            <button
              onClick={() => setSchemaOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/90 text-xs font-medium hover:bg-white/15 transition-colors"
            >
              <span className="text-white/50 text-[10px] font-normal mr-0.5">Schema</span>
              {selectedSchema.label}
              <svg className={`w-3.5 h-3.5 text-white/50 transition-transform ${schemaOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {schemaOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
                {SCHEMA_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSchemaType(opt.value); setSchemaOpen(false); }}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${schemaType === opt.value ? "bg-blue-50" : ""}`}
                  >
                    <div className="flex-1">
                      <div className={`text-sm font-semibold ${schemaType === opt.value ? "text-blue-700" : "text-gray-800"}`}>
                        {opt.label}
                        {schemaType === opt.value && <span className="ml-2 text-[10px] font-medium text-blue-500">Active</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-white/30 text-xs ml-auto hidden sm:block">Claude Sonnet 4.6 · LangGraph</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex gap-6 items-start">

          {/* Main column */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Input panel */}
            {activeTab !== "batch" && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Panel header with reset button */}
                <div className="flex items-center justify-end px-4 pt-3">
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-colors"
                    title="Clear everything and start a new validation"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    New Validation
                  </button>
                </div>

                {/* File upload zone */}
                <div className="p-4 pb-0">
                  <FileUploadZone key={uploadResetKey} onFile={handleFileUpload} onClear={handleClearFile} />
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 shrink-0">or paste manually below</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <textarea
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setResponse(null); setApiError(null); setActiveHistoryId(null); setPipelineNodes(makeInitialNodes()); setCancelled(false); }}
                  spellCheck={false}
                  placeholder="Paste your loan data here — supports JSON, YAML, XML and TOML formats. Auto-detected."
                  className="w-full font-mono text-xs px-5 pb-4 h-44 resize-none focus:outline-none placeholder:font-sans placeholder:text-sm placeholder:text-gray-400"
                />
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-2 min-w-0">
                    {hasInput && !apiError && (
                      <>
                        <span className="text-xs text-gray-400">Detected:</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${FORMAT_COLORS[detectedFormat]}`}>
                          {detectedFormat.toUpperCase()}
                        </span>
                      </>
                    )}
                    {apiError && (
                      <span className="text-xs text-red-600 truncate max-w-sm">Error: {apiError}</span>
                    )}
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={loading || !hasInput}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading && (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    )}
                    {loading ? "Running…" : "Run Agent"}
                  </button>
                </div>
              </div>
            )}

            {/* Pipeline visualization */}
            {activeTab !== "batch" && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Pipeline</p>
                  {loading && (
                    <button
                      onClick={handleStop}
                      className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                        <rect x="2" y="2" width="8" height="8" rx="1" />
                      </svg>
                      Stop
                    </button>
                  )}
                </div>
                <PipelineViz nodes={pipelineNodes} />
              </div>
            )}

            {/* Results panel */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-200 bg-gray-50">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? "text-blue-600 border-b-2 border-blue-600 -mb-px bg-white"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab.label}
                    {tabBadge[tab.id] && (
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                        tabBadge[tab.id] === "✓"
                          ? "bg-emerald-100 text-emerald-700"
                          : tabBadge[tab.id] === "✕" || tabBadge[tab.id] === "HIGH"
                          ? "bg-red-100 text-red-700"
                          : tabBadge[tab.id] === "MEDIUM"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        {tabBadge[tab.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="p-5 min-h-[260px]">
                {activeTab === "batch" ? (
                  <BatchPanel
                    key={batchResetKey}
                    schemaType={schemaType}
                    loans={batchLoans}
                    filename={batchFilename}
                    fileSize={batchFileSize}
                    onFile={handleFileUpload}
                    onReset={clearBatchState}
                  />
                ) : cancelled && !response && !loading ? (
                  <div className="flex flex-col items-center justify-center h-52 text-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                        <rect x="4" y="4" width="12" height="12" rx="2" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Validation cancelled</p>
                      <p className="text-xs text-gray-400 mt-1">The request was stopped before completing</p>
                    </div>
                  </div>
                ) : !response && !loading ? (
                  <div className="flex flex-col items-center justify-center h-52 text-center gap-2">
                    <p className="text-sm text-gray-400">Paste loan data above and click Run Agent</p>
                    <p className="text-xs text-gray-300">or use the Batch tab for multiple loans</p>
                  </div>
                ) : loading && !response ? (
                  <div className="flex flex-col items-center justify-center h-52 gap-2">
                    <p className="text-sm text-gray-500">Agent pipeline running…</p>
                    <p className="text-xs text-gray-400">Results will appear here as nodes complete</p>
                  </div>
                ) : response ? (
                  <>
                    {activeTab === "validate" && <ScoreCard response={response} />}
                    {activeTab === "contract" && (
                      <ContractPanel contract={response.contract} validation={response.validation} />
                    )}
                    {activeTab === "drift" && <DriftPanel report={response.drift_report} />}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* History sidebar */}
          <HistorySidebar
            history={history}
            onSelect={restoreHistory}
            activeId={activeHistoryId}
          />
        </div>
      </div>
    </div>
  );
}
