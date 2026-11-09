from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=160)
    role: Literal["donor", "organisation", "vendor"]
    organisation_name: str | None = None
    business_name: str | None = None
    registration_number: str | None = None
    country: str = "India"

    @model_validator(mode="after")
    def validate_role_fields(self) -> "RegisterIn":
        if self.role in ("organisation", "vendor") and not self.registration_number:
            raise ValueError("registration_number is required for organisation and vendor accounts")
        if self.role == "organisation" and not self.organisation_name:
            raise ValueError("organisation_name is required")
        if self.role == "vendor" and not self.business_name:
            raise ValueError("business_name is required")
        return self


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class BudgetLineIn(BaseModel):
    category: str = Field(min_length=2, max_length=120)
    allocated_minor: int = Field(gt=0)


class ProjectCreateIn(BaseModel):
    name: str = Field(min_length=4, max_length=200)
    description: str = Field(min_length=20, max_length=5000)
    category: str = Field(min_length=3, max_length=100)
    target_beneficiaries: int = Field(ge=1, le=10_000_000)
    geographic_coverage: str = Field(min_length=2, max_length=200)
    funding_target_minor: int = Field(gt=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    starts_on: date | None = None
    ends_on: date | None = None
    operational_requirements: str | None = Field(default=None, max_length=5000)
    approved_categories: list[str] = Field(min_length=1, max_length=30)
    per_transaction_limit_minor: int = Field(gt=0)
    budgets: list[BudgetLineIn] = Field(min_length=1, max_length=30)

    @field_validator("approved_categories")
    @classmethod
    def clean_categories(cls, values: list[str]) -> list[str]:
        cleaned = [v.strip() for v in values if v.strip()]
        if len({c.lower() for c in cleaned}) != len(cleaned):
            raise ValueError("approved_categories must be unique")
        return cleaned

    @model_validator(mode="after")
    def budgets_match_categories(self) -> "ProjectCreateIn":
        approved = {c.lower() for c in self.approved_categories}
        budgeted = {b.category.strip().lower() for b in self.budgets}
        unknown = budgeted - approved
        if unknown:
            raise ValueError(f"Budget lines must reference approved categories: {', '.join(sorted(unknown))}")
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("ends_on must be after starts_on")
        return self


class PolicyDraftIn(BaseModel):
    approved_categories: list[str] = Field(min_length=1, max_length=30)
    per_transaction_limit_minor: int = Field(gt=0)
    budgets: list[BudgetLineIn] = Field(min_length=1, max_length=30)
    notes: str | None = Field(default=None, max_length=5000)


class DonationCreateIn(BaseModel):
    project_id: int = Field(gt=0)
    amount_minor: int = Field(gt=0, le=10_000_000_000)
    currency: str = Field(default="INR", min_length=3, max_length=3)


class DonationConfirmIn(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=120)


class PurchaseCreateIn(BaseModel):
    project_id: int = Field(gt=0)
    vendor_id: int = Field(gt=0)
    category: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=3, max_length=1000)
    quantity: int = Field(gt=0, le=1_000_000)
    unit_price_minor: int = Field(gt=0)
    quotation_reference: str = Field(default="", max_length=120)
    payment_destination: str = Field(default="", max_length=120)


class PaymentIn(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=120)


class DeliveryReportIn(BaseModel):
    dispatch_reference: str = Field(min_length=3, max_length=160)
    dispatched_at: datetime | None = None
    delivered_at: datetime | None = None
    quantity_reported: int | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=2000)


class ReceiptIn(BaseModel):
    decision: Literal["confirmed", "disputed"]
    notes: str = Field(default="", max_length=2000)
    quantity_received: int | None = Field(default=None, gt=0)


class ReviewIn(BaseModel):
    decision: Literal["approve", "reject"]
    notes: str = Field(min_length=10, max_length=2000)


class VerificationIn(BaseModel):
    verification_status: Literal["verified", "rejected", "suspended"]
    notes: str | None = Field(default=None, max_length=2000)


class PaymentDestinationIn(BaseModel):
    payment_destination_ref: str = Field(min_length=3, max_length=80)
    verified: bool = True


class UserStatusIn(BaseModel):
    is_active: bool
    reason: str = Field(min_length=5, max_length=1000)


class ProjectRequirementsIn(BaseModel):
    description: str = Field(min_length=20, max_length=5000)
    project_category: str | None = Field(default=None, max_length=100)
    target_beneficiaries: int | None = Field(default=None, ge=1)
    budget_minor: int | None = Field(default=None, gt=0)
