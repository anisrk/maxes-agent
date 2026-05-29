from typing import Optional
from typing_extensions import TypedDict
from app.schemas import ValidationResult, ContractResult, DriftReport


class AgentState(TypedDict):
    loan_data: dict
    reference_schema_version: str
    reference_schema: Optional[dict]
    schema_type: str

    validation_result: Optional[ValidationResult]
    contract_result: Optional[ContractResult]
    drift_report: Optional[DriftReport]
    error: Optional[str]
