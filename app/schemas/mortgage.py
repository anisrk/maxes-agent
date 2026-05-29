from pydantic import BaseModel, Field
from typing import Optional, Literal
from enum import Enum


class LoanType(str, Enum):
    conventional = "conventional"
    fha = "fha"
    va = "va"
    jumbo = "jumbo"


class OccupancyType(str, Enum):
    primary = "primary_residence"
    second = "second_home"
    investment = "investment_property"


class SchemaType(str, Enum):
    conventional = "conventional"
    fha = "fha"
    dscr = "dscr"
    jumbo = "jumbo"


class MaxexLoanSchema(BaseModel):
    loan_id: str = Field(..., description="Unique loan identifier")
    loan_type: LoanType
    occupancy_type: OccupancyType
    loan_amount: float = Field(..., gt=0, description="Loan amount in USD")
    ltv_ratio: float = Field(..., gt=0, le=100, description="Loan-to-value ratio as percentage")
    dti_ratio: float = Field(..., gt=0, le=100, description="Debt-to-income ratio as percentage")
    fico_score: int = Field(..., ge=300, le=850)
    property_value: float = Field(..., gt=0)
    borrower_income: float = Field(..., gt=0)
    is_self_employed: bool = False
    units: int = Field(default=1, ge=1, le=4)
    state: str = Field(..., min_length=2, max_length=2, description="Two-letter state code")


class ValidationRequest(BaseModel):
    loan_data: dict
    reference_schema_version: Optional[str] = "v1.0"


class ValidationResult(BaseModel):
    is_valid: bool
    violations: list[str] = []
    warnings: list[str] = []
    loan_id: Optional[str] = None


class ContractRequest(BaseModel):
    loan_id: str
    validated_loan: dict


class ContractResult(BaseModel):
    loan_id: str
    contract_text: str
    contract_version: str


class DriftReport(BaseModel):
    detected: bool
    fields_changed: list[str] = []
    severity: Literal["none", "low", "medium", "high"] = "none"
    recommendation: str = ""


class AgentRequest(BaseModel):
    loan_data: Optional[dict] = None
    raw_input: Optional[str] = None
    format: Literal["json", "yaml", "xml", "toml", "auto"] = "auto"
    schema_type: SchemaType = SchemaType.conventional
    reference_schema_version: Optional[str] = "v1.0"
    reference_schema: Optional[dict] = None


class AgentResponse(BaseModel):
    loan_id: Optional[str]
    validation: ValidationResult
    contract: Optional[ContractResult] = None
    drift_report: Optional[DriftReport] = None
    error: Optional[str] = None
