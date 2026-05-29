from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from app.agent.state import AgentState
from app.schemas import ValidationResult
import json

MODEL = "claude-sonnet-4-6"

_llm = None


def _get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model=MODEL, temperature=0)
    return _llm


SCHEMA_RULES: dict[str, str] = {
    "conventional": """\
Conventional Loan Rules (MAXEX):
- loan_id: required, non-empty string
- loan_type: must be "conventional"
- occupancy_type: primary_residence | second_home | investment_property
- loan_amount: positive number
- ltv_ratio: max 97% (warn above 80% — PMI required)
- dti_ratio: max 50%
- fico_score: min 620
- property_value: positive
- borrower_income: positive
- units: 1–4
- state: valid 2-letter US state code""",

    "fha": """\
FHA Loan Rules (MAXEX):
- loan_id: required, non-empty string
- loan_type: must be "fha"
- occupancy_type: must be "primary_residence" (FHA does not allow investment/second home)
- loan_amount: positive; must not exceed FHA county limits (warn if > $498,257 standard limit)
- ltv_ratio: max 96.5% for FICO >= 580; max 90% for FICO 500–579; reject if FICO < 500
- dti_ratio: max 57% (flag above 43% as warning — compensating factors required)
- fico_score: min 580 for 96.5% LTV; min 500 for 90% LTV; reject below 500
- property_value: positive
- borrower_income: positive
- units: 1–4
- state: valid 2-letter US state code
- Note: FHA MIP (Mortgage Insurance Premium) always required — add as warning""",

    "dscr": """\
DSCR (Debt-Service Coverage Ratio) Loan Rules (MAXEX):
- loan_id: required, non-empty string
- loan_type: conventional or jumbo (not fha/va)
- occupancy_type: must be "investment_property" (DSCR is for non-owner-occupied only)
- loan_amount: positive
- ltv_ratio: max 80%
- dti_ratio: NOT used for qualification — personal DTI is not applicable for DSCR loans;
             flag as informational warning if dti_ratio > 50 but do not count as violation
- fico_score: min 640
- property_value: positive
- borrower_income: secondary factor only — personal income verification not required;
                   flag as informational if zero but not a violation
- units: 1–4
- state: valid 2-letter US state code
- Key rule: DSCR (rental income / total debt service) must be >= 1.0 when determinable""",

    "jumbo": """\
Jumbo Loan Rules (MAXEX):
- loan_id: required, non-empty string
- loan_type: must be "jumbo"
- occupancy_type: primary_residence | second_home (investment allowed with stricter terms)
- loan_amount: must exceed $766,550 (2024 conforming limit); violation if <= $766,550
- ltv_ratio: max 80%; max 75% for investment_property or second_home
- dti_ratio: max 43%
- fico_score: min 700
- property_value: positive
- borrower_income: positive; loan-to-income ratio should not exceed 5x (warn if exceeded)
- units: 1–2 for primary residence; 1 only for investment/second home
- state: valid 2-letter US state code
- 12+ months of reserves typically required — add as warning""",
}

OUTPUT_FORMAT = """
Output rules — violations and warnings must be short, factual sentences. Each string must:
- State exactly one rule breach or concern
- Contain no reasoning, hedging, or self-correction
- Use the pattern: "<field>: <observed value> <fails condition>" for violations

Return ONLY this JSON — no markdown, no prose outside it:
{
  "is_valid": true|false,
  "violations": ["one violation per string, empty array if none"],
  "warnings": ["one warning per string, empty array if none"],
  "loan_id": "the loan_id value or null"
}"""


def _build_system_prompt(schema_type: str) -> str:
    rules = SCHEMA_RULES.get(schema_type, SCHEMA_RULES["conventional"])
    return (
        f"You are a MAXEX mortgage schema validator for {schema_type.upper()} loans. "
        "Evaluate the loan data against the rules below and return a JSON result. "
        "Do all reasoning internally — output only the final JSON.\n\n"
        f"{rules}\n\n{OUTPUT_FORMAT}"
    )


def validator_node(state: AgentState) -> AgentState:
    loan_data = state["loan_data"]
    schema_type = state.get("schema_type", "conventional")
    llm = _get_llm()

    messages = [
        SystemMessage(content=_build_system_prompt(schema_type)),
        HumanMessage(content=f"Validate this loan data:\n{json.dumps(loan_data, indent=2)}"),
    ]

    try:
        response = llm.invoke(messages)
        raw = response.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())
        result = ValidationResult(**parsed)
    except Exception as exc:
        result = ValidationResult(
            is_valid=False,
            violations=[f"Validator node error: {exc}"],
            loan_id=loan_data.get("loan_id"),
        )

    return {**state, "validation_result": result}
