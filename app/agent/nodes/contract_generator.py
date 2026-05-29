from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from app.agent.state import AgentState
from app.schemas import ContractResult
import json
from datetime import date

MODEL = "claude-sonnet-4-6"

_llm = None


def _get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model=MODEL, temperature=0.2)
    return _llm


SYSTEM_PROMPT = """You are a MAXEX mortgage contract generator. Given validated loan data,
generate a concise mortgage purchase contract summary in plain English.

The contract must include:
- Header with loan ID, date, and schema version
- Borrower and loan details section
- Key terms (loan amount, LTV, DTI, rate type placeholder)
- Representations and warranties clause
- Delivery and funding conditions
- Signature block placeholder

Return ONLY valid JSON in this format:
{
  "loan_id": "...",
  "contract_text": "full contract text here",
  "contract_version": "1.0"
}"""


def contract_generator_node(state: AgentState) -> AgentState:
    validation = state.get("validation_result")
    if not validation or not validation.is_valid:
        return state  # Skip if validation failed

    loan_data = state["loan_data"]
    schema_version = state.get("reference_schema_version", "v1.0")
    llm = _get_llm()

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(
            content=(
                f"Generate a mortgage purchase contract for this validated loan.\n"
                f"Schema version: {schema_version}\n"
                f"Today's date: {date.today().isoformat()}\n"
                f"Loan data:\n{json.dumps(loan_data, indent=2)}"
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
        result = ContractResult(**parsed)
    except Exception as exc:
        loan_id = loan_data.get("loan_id", "UNKNOWN")
        result = ContractResult(
            loan_id=loan_id,
            contract_text=f"Contract generation failed: {exc}",
            contract_version="error",
        )

    return {**state, "contract_result": result}
