# MAXEX Mortgage Schema Validator Agent

A LangGraph-powered AI agent that validates mortgage loan data against MAXEX schema rules, generates purchase contracts for approved loans, and detects schema drift — all streamed in real time via Server-Sent Events.

## Architecture

```
POST /api/v1/validate/stream
           │
           ▼
    ┌─────────────┐
    │  Validator  │  ← Claude Sonnet 4.6 checks loan data against schema rules
    └──────┬──────┘
           │
    ┌──────▼──────────────────────────────────────┐
    │  Conditional edge: is_valid?                 │
    │  YES → Contract Generator                    │
    │  NO  → Schema Drift Detector (skip contract) │
    └──────────────────────────────────────────────┘
           │
    ┌──────▼──────────────┐
    │  Contract Generator │  ← Generates purchase contract (PASS loans only)
    └──────┬──────────────┘
           │
    ┌──────▼──────────────────┐
    │  Schema Drift Detector  │  ← Compares fields against canonical MAXEX schema
    └─────────────────────────┘
           │
           ▼
      SSE: {"type": "done", "result": {...}}
```

## Tech Stack

| Layer | Technology |
|---|---|
| AI Agent Framework | [LangGraph](https://github.com/langchain-ai/langgraph) |
| LLM | Claude Sonnet 4.6 (`claude-sonnet-4-6`) via `langchain-anthropic` |
| API Server | FastAPI + Uvicorn |
| Streaming | Server-Sent Events (SSE) via `StreamingResponse` |
| Input Parsing | JSON · YAML · XML · TOML (auto-detected) |
| Schema Validation | Pydantic v2 |

## Project Structure

```
maxex-agent/
├── main.py                          # FastAPI app entry point
├── requirements.txt
├── .env.example                     # Copy to .env and add your API key
├── app/
│   ├── api/
│   │   └── routes.py                # API endpoints
│   ├── agent/
│   │   ├── graph.py                 # LangGraph graph definition
│   │   ├── state.py                 # AgentState TypedDict
│   │   └── nodes/
│   │       ├── validator.py         # Node 1: schema validation
│   │       ├── contract_generator.py # Node 2: contract generation
│   │       └── schema_drift_detector.py # Node 3: drift detection
│   ├── schemas/
│   │   └── mortgage.py              # Pydantic models
│   └── parser.py                    # Multi-format input parser
└── test_*.{csv,json,yaml,xml}       # Sample loan files
```

## Setup

### Prerequisites

- Python 3.11+
- An [Anthropic API key](https://console.anthropic.com/)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd maxex-agent

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...
```

### Running the API Server

```bash
python main.py
# Server starts at http://localhost:8000
# Interactive docs at http://localhost:8000/docs
```

The server hot-reloads on file changes in development mode.

## API Endpoints

### `POST /api/v1/validate`

Synchronous validation — waits for the full pipeline to complete.

**Request body:**
```json
{
  "loan_data": {
    "loan_id": "MAXEX-001",
    "loan_type": "conventional",
    "occupancy_type": "primary_residence",
    "loan_amount": 450000,
    "ltv_ratio": 78.5,
    "dti_ratio": 34.2,
    "fico_score": 740,
    "property_value": 573248,
    "borrower_income": 145000,
    "is_self_employed": false,
    "units": 1,
    "state": "CA"
  },
  "schema_type": "conventional"
}
```

Alternatively, pass raw markup in any supported format:

```json
{
  "raw_input": "<loan><loan_id>MAXEX-001</loan_id>...</loan>",
  "format": "xml",
  "schema_type": "conventional"
}
```

`format` accepts: `json` · `yaml` · `xml` · `toml` · `auto` (default — auto-detected).

**Response:**
```json
{
  "loan_id": "MAXEX-001",
  "validation": {
    "is_valid": true,
    "violations": [],
    "warnings": ["ltv_ratio: 78.5% exceeds 80% — PMI required"],
    "loan_id": "MAXEX-001"
  },
  "contract": {
    "loan_id": "MAXEX-001",
    "contract_text": "MAXEX MORTGAGE PURCHASE CONTRACT...",
    "contract_version": "1.0"
  },
  "drift_report": {
    "detected": false,
    "fields_changed": [],
    "severity": "none",
    "recommendation": "No schema drift detected."
  },
  "error": null
}
```

---

### `POST /api/v1/validate/stream`

Same request body as `/validate`. Returns a **Server-Sent Events** stream of node lifecycle events:

```
data: {"type": "node_start", "node": "validator"}

data: {"type": "node_done",  "node": "validator"}

data: {"type": "node_start", "node": "contract_generator"}

data: {"type": "node_done",  "node": "contract_generator"}

data: {"type": "node_start", "node": "schema_drift_detector"}

data: {"type": "node_done",  "node": "schema_drift_detector"}

data: {"type": "done", "result": { ...AgentResponse... }}
```

When a loan fails validation, `contract_generator` is skipped:

```
data: {"type": "node_skip", "node": "contract_generator"}
```

On error:
```
data: {"type": "error", "message": "..."}
```

---

### `GET /api/v1/health`

```json
{"status": "ok", "service": "maxex-agent"}
```

---

## The Three LangGraph Nodes

### 1. `validator` — Mortgage Schema Validator

Sends the loan data to Claude with schema-specific rules and asks for a structured JSON verdict. Four schema types are supported:

| Schema | Key Rules |
|---|---|
| `conventional` | FICO ≥ 620, LTV ≤ 97%, DTI ≤ 50%, 1–4 units |
| `fha` | FICO ≥ 580 (or 500 for 90% LTV), occupancy = primary only, MIP always required |
| `dscr` | Investment property only, LTV ≤ 80%, FICO ≥ 640, personal DTI not used |
| `jumbo` | Loan > $766,550, FICO ≥ 700, LTV ≤ 80%, DTI ≤ 43% |

**Output fields:** `is_valid`, `violations[]`, `warnings[]`, `loan_id`

The graph routes on `is_valid`: passing loans proceed to contract generation; failing loans skip directly to drift detection.

---

### 2. `contract_generator` — Purchase Contract Generator

Runs only when `is_valid = true`. Calls Claude with the validated loan data and today's date to produce a structured mortgage purchase contract. The contract includes:

- Borrower and loan details section
- Key terms (loan amount, LTV, DTI, rate type)
- Representations and warranties clause
- Delivery and funding conditions
- Signature block placeholder

**Output fields:** `loan_id`, `contract_text`, `contract_version`

---

### 3. `schema_drift_detector` — Schema Drift Detector

Always runs (final node). Compares the incoming loan's field structure and value ranges against the canonical MAXEX schema:

```
{ "loan_id": "string", "loan_type": "enum[conventional,fha,va,jumbo]",
  "fico_score": "int[300,850]", "ltv_ratio": "float[0,100]", ... }
```

Detects missing fields, unknown extra fields, type mismatches, and out-of-range values. Reports a `severity` of `none | low | medium | high`.

**Output fields:** `detected`, `fields_changed[]`, `severity`, `recommendation`

---

## Supported Input Formats

The `/validate` and `/validate/stream` endpoints accept loan data as structured JSON (`loan_data`) or as a raw string (`raw_input`) in any of these formats, auto-detected by default:

| Format | Detection |
|---|---|
| JSON | Starts with `{` or `[` |
| XML | Starts with `<` |
| TOML | `key = value` pattern (no `:`) |
| YAML | Everything else |

A single XML `<loan>` root element is automatically unwrapped. All XML string values are coerced to the appropriate Python type (bool, int, float).

---

## Sample Test Files

| File | Description |
|---|---|
| `test_single.json` | Single conventional loan (clean) |
| `test_single.yaml` | Single conventional loan in YAML |
| `test_single.xml` | Single conventional loan in XML |
| `test_batch.csv` | 5 conventional loans — mix of clean, high LTV, high DTI |
| `test_batch.json` | 3 loans as a JSON array |

---

## Running with the UI

The React frontend (`maxex-ui`) connects to this server at `http://localhost:8000`. Start both:

```bash
# Terminal 1 — API server
cd maxex-agent
source .venv/bin/activate
python main.py

# Terminal 2 — Frontend
cd maxex-ui
npm install
npm run dev
# Opens at http://localhost:5173
```
