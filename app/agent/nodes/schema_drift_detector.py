from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from langsmith import traceable
from app.agent.state import AgentState
from app.schemas import DriftReport
import json

MODEL = "claude-sonnet-4-6"

CANONICAL_SCHEMA = {
    "loan_id": "string",
    "loan_type": "enum[conventional,fha,va,jumbo]",
    "occupancy_type": "enum[primary_residence,second_home,investment_property]",
    "loan_amount": "float>0",
    "ltv_ratio": "float[0,100]",
    "dti_ratio": "float[0,100]",
    "fico_score": "int[300,850]",
    "property_value": "float>0",
    "borrower_income": "float>0",
    "is_self_employed": "bool",
    "units": "int[1,4]",
    "state": "string[2]",
}

_llm = None


def _get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model=MODEL, temperature=0)
    return _llm


SYSTEM_PROMPT = """You are a MAXEX schema drift detector. Compare the incoming loan data's
field structure against the canonical MAXEX schema and identify any drift.

Drift includes:
- Missing required fields from the canonical schema
- Unknown/extra fields not in the canonical schema
- Fields with unexpected data types compared to schema definition
- Fields with values outside expected ranges

Severity levels:
- none: no drift detected
- low: extra unknown fields only
- medium: missing optional fields or minor type mismatches
- high: missing required fields or critical type violations

Return ONLY valid JSON:
{
  "detected": true|false,
  "fields_changed": ["list of drifted field names"],
  "severity": "none|low|medium|high",
  "recommendation": "brief recommendation string"
}"""


@traceable(name="schema_drift_detector", run_type="chain")
def schema_drift_detector_node(state: AgentState) -> AgentState:
    loan_data = state["loan_data"]
    reference_schema = state.get("reference_schema") or CANONICAL_SCHEMA
    llm = _get_llm()

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(
            content=(
                f"Canonical MAXEX schema:\n{json.dumps(reference_schema, indent=2)}\n\n"
                f"Incoming loan data fields and values:\n{json.dumps(loan_data, indent=2)}"
            )
        ),
    ]

    try:
        response = llm.invoke(messages)
        raw = response.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())
        result = DriftReport(**parsed)
    except Exception as exc:
        result = DriftReport(
            detected=False,
            severity="none",
            recommendation=f"Drift detection error: {exc}",
        )

    return {**state, "drift_report": result}
