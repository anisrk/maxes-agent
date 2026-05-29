import type { AgentResponse, SchemaType, StreamEvent } from "./types";

const BASE = `${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/api/v1`;

export async function validateLoan(
  rawInput: string,
  schemaType: SchemaType = "conventional",
  schemaVersion = "v1.0"
): Promise<AgentResponse> {
  const res = await fetch(`${BASE}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      raw_input: rawInput,
      format: "auto",
      schema_type: schemaType,
      reference_schema_version: schemaVersion,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function validateLoanStream(
  rawInput: string,
  schemaType: SchemaType,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE}/validate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_input: rawInput, format: "auto", schema_type: schemaType }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          onEvent(JSON.parse(line.slice(6)));
        } catch { /* ignore */ }
      }
    }
  }
}

export async function validateBatch(
  loans: object[],
  schemaType: SchemaType = "conventional"
): Promise<AgentResponse[]> {
  return Promise.all(loans.map((loan) => validateLoan(JSON.stringify(loan), schemaType)));
}
