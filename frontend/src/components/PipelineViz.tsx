import type { PipelineNode, NodeStatus } from "../types";

interface Props {
  nodes: PipelineNode[];
}

const STATUS_STYLES: Record<NodeStatus, { ring: string; bg: string; text: string; icon: string; label: string }> = {
  idle:       { ring: "border-gray-200",   bg: "bg-gray-50",    text: "text-gray-400",   icon: "○", label: "Idle"       },
  pending:    { ring: "border-gray-300",   bg: "bg-gray-50",    text: "text-gray-500",   icon: "○", label: "Pending"    },
  processing: { ring: "border-blue-400",   bg: "bg-blue-50",    text: "text-blue-600",   icon: "◉", label: "Processing" },
  complete:   { ring: "border-emerald-400",bg: "bg-emerald-50", text: "text-emerald-700",icon: "✓", label: "Complete"   },
  failed:     { ring: "border-red-400",    bg: "bg-red-50",     text: "text-red-700",    icon: "✕", label: "Failed"     },
  skipped:    { ring: "border-gray-200",   bg: "bg-gray-50",    text: "text-gray-400",   icon: "—", label: "Skipped"    },
};

function duration(node: PipelineNode): string | null {
  if (!node.startedAt) return null;
  const end = node.completedAt ?? Date.now();
  const ms = end - node.startedAt;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function NodeCard({ node }: { node: PipelineNode }) {
  const s = STATUS_STYLES[node.status];
  const isProcessing = node.status === "processing";
  const dur = duration(node);

  return (
    <div className={`relative flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border-2 transition-all duration-300 min-w-[130px] ${s.ring} ${s.bg}`}>
      {/* Pulse ring for processing */}
      {isProcessing && (
        <span className="absolute inset-0 rounded-xl border-2 border-blue-400 animate-ping opacity-30" />
      )}

      <span className={`text-lg font-bold leading-none ${s.text} ${isProcessing ? "animate-pulse" : ""}`}>
        {s.icon}
      </span>

      <span className={`text-xs font-semibold text-center leading-tight ${s.text}`}>
        {node.label}
      </span>

      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
        node.status === "processing" ? "bg-blue-100 text-blue-700" :
        node.status === "complete"   ? "bg-emerald-100 text-emerald-700" :
        node.status === "failed"     ? "bg-red-100 text-red-700" :
        "bg-gray-100 text-gray-500"
      }`}>
        {s.label}
      </span>

      {dur && (
        <span className="text-[10px] text-gray-400">{dur}</span>
      )}
    </div>
  );
}

function Arrow({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <div className={`h-0.5 w-8 transition-colors duration-300 ${active ? "bg-blue-400" : "bg-gray-200"}`} />
      <svg className={`w-3 h-3 transition-colors duration-300 ${active ? "text-blue-400" : "text-gray-300"}`} viewBox="0 0 12 12" fill="currentColor">
        <path d="M4 2l5 4-5 4V2z" />
      </svg>
    </div>
  );
}

export function PipelineViz({ nodes }: Props) {
  const allIdle = nodes.every((n) => n.status === "idle");

  return (
    <div className={`transition-all duration-300 ${allIdle ? "opacity-40" : "opacity-100"}`}>
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {nodes.map((node, i) => (
          <div key={node.id} className="flex items-center gap-1">
            {i > 0 && (
              <Arrow
                active={
                  nodes[i - 1].status === "complete" ||
                  node.status === "processing" ||
                  node.status === "complete"
                }
              />
            )}
            <NodeCard node={node} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function makeInitialNodes(): PipelineNode[] {
  return [
    { id: "validator",              label: "Validator",             status: "idle" },
    { id: "contract_generator",     label: "Contract Generator",    status: "idle" },
    { id: "schema_drift_detector",  label: "Schema Drift Detector", status: "idle" },
  ];
}
