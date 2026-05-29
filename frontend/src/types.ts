export interface ValidationResult {
  is_valid: boolean;
  violations: string[];
  warnings: string[];
  loan_id: string | null;
}

export interface ContractResult {
  loan_id: string;
  contract_text: string;
  contract_version: string;
}

export interface DriftReport {
  detected: boolean;
  fields_changed: string[];
  severity: "none" | "low" | "medium" | "high";
  recommendation: string;
}

export interface AgentResponse {
  loan_id: string | null;
  validation: ValidationResult;
  contract: ContractResult | null;
  drift_report: DriftReport | null;
  error: string | null;
}

export type Tab = "validate" | "contract" | "drift" | "batch";
export type MarkupFormat = "json" | "yaml" | "xml" | "toml";
export type Grade = "A" | "B" | "C" | "D" | "F";
export type SchemaType = "conventional" | "fha" | "dscr" | "jumbo";

export interface GradeResult {
  grade: Grade;
  score: number;
}

export interface HistoryEntry {
  id: string;
  loan_id: string | null;
  grade: Grade;
  score: number;
  timestamp: Date;
  response: AgentResponse;
  schemaType: SchemaType;
}

export interface BatchLoanResult {
  index: number;
  loan_id: string | null;
  response: AgentResponse;
  grade: Grade;
  score: number;
}

export interface BatchSummary {
  total: number;
  passed: number;
  failed: number;
  withWarnings: number;
  mostCommonErrorField: string | null;
  results: BatchLoanResult[];
}

// Pipeline visualization
export type NodeStatus = "idle" | "pending" | "processing" | "complete" | "failed" | "skipped";

export interface PipelineNode {
  id: "validator" | "contract_generator" | "schema_drift_detector";
  label: string;
  status: NodeStatus;
  startedAt?: number;
  completedAt?: number;
}

export interface StreamEvent {
  type: "node_start" | "node_done" | "node_skip" | "done" | "error";
  node?: "validator" | "contract_generator" | "schema_drift_detector";
  result?: AgentResponse;
  message?: string;
}
