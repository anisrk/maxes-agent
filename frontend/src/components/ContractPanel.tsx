import type { ContractResult, ValidationResult } from "../types";
import { StatusBadge } from "./StatusBadge";
import { downloadContractPDF } from "../utils/pdf";

interface Props {
  contract: ContractResult | null;
  validation: ValidationResult | null;
}

export function ContractPanel({ contract, validation }: Props) {
  if (!validation) return null;

  if (!validation.is_valid) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <div className="text-4xl">🚫</div>
        <p className="text-sm font-medium text-gray-600">Contract generation skipped</p>
        <p className="text-xs text-gray-400 max-w-sm">
          The loan failed validation. Fix all violations before a purchase contract can be generated.
        </p>
      </div>
    );
  }

  if (!contract) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <StatusBadge label="Generated" variant="success" />
        <span className="text-xs text-gray-400 font-mono">{contract.loan_id}</span>
        <span className="text-xs text-gray-400">v{contract.contract_version}</span>
        <button
          onClick={() => downloadContractPDF(contract!)}
          className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Contract
        </button>
      </div>

      <div className="relative">
        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-700 font-mono whitespace-pre-wrap overflow-auto max-h-[520px] leading-relaxed">
          {contract.contract_text}
        </pre>
        <button
          onClick={() => navigator.clipboard.writeText(contract.contract_text)}
          className="absolute top-2 right-2 text-xs text-gray-400 hover:text-gray-600 bg-white border border-gray-200 rounded px-2 py-1 transition-colors"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
