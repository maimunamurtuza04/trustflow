from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(20), index=True)  # donor | organisation | vendor | admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    organisation: Mapped[Optional["Organisation"]] = relationship(back_populates="user", uselist=False)
    vendor: Mapped[Optional["Vendor"]] = relationship(back_populates="user", uselist=False)


class Organisation(Base):
    __tablename__ = "organisations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    registration_number: Mapped[str] = mapped_column(String(100), unique=True)
    country: Mapped[str] = mapped_column(String(80), default="India")
    verification_status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    verification_notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped["User"] = relationship(back_populates="organisation")
    projects: Mapped[list["Project"]] = relationship(back_populates="organisation")


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    business_name: Mapped[str] = mapped_column(String(200), unique=True)
    registration_number: Mapped[str] = mapped_column(String(100), unique=True)
    country: Mapped[str] = mapped_column(String(80), default="India")
    categories: Mapped[list] = mapped_column(JSON, default=list)
    verification_status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    payment_destination_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    payment_destination_ref: Mapped[Optional[str]] = mapped_column(String(80))
    complaint_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped["User"] = relationship(back_populates="vendor")
    products: Mapped[list["VendorProduct"]] = relationship(back_populates="vendor")


class VendorProduct(Base):
    __tablename__ = "vendor_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    unit_price_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    vendor: Mapped["Vendor"] = relationship(back_populates="products")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    organisation_id: Mapped[int] = mapped_column(ForeignKey("organisations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(100), index=True)
    target_beneficiaries: Mapped[int] = mapped_column(Integer, default=0)
    geographic_coverage: Mapped[str] = mapped_column(String(200))
    funding_target_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    starts_on: Mapped[Optional[date]] = mapped_column(Date)
    ends_on: Mapped[Optional[date]] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)
    verification_status: Mapped[str] = mapped_column(String(20), default="pending")
    operational_requirements: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    organisation: Mapped["Organisation"] = relationship(back_populates="projects")
    policies: Mapped[list["ProjectPolicy"]] = relationship(back_populates="project", order_by="ProjectPolicy.version")
    budgets: Mapped[list["ProjectBudget"]] = relationship(back_populates="project")


class ProjectPolicy(Base):
    __tablename__ = "project_policies"
    __table_args__ = (UniqueConstraint("project_id", "version", name="uq_policy_project_version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)  # draft | approved | superseded
    approved_categories: Mapped[list] = mapped_column(JSON, default=list)
    budget_lines: Mapped[list] = mapped_column(JSON, default=list)
    per_transaction_limit_minor: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    approved_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    project: Mapped["Project"] = relationship(back_populates="policies")


class ProjectBudget(Base):
    __tablename__ = "project_budgets"
    __table_args__ = (UniqueConstraint("project_id", "category", name="uq_budget_project_category"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    category: Mapped[str] = mapped_column(String(120))
    allocated_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    project: Mapped["Project"] = relationship(back_populates="budgets")


class Donation(Base):
    __tablename__ = "donations"

    id: Mapped[int] = mapped_column(primary_key=True)
    donor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    provider: Mapped[str] = mapped_column(String(40), default="simulated")
    payment_reference: Mapped[str] = mapped_column(String(80), unique=True)
    payment_status: Mapped[str] = mapped_column(String(20), default="pledged", index=True)
    allocation_status: Mapped[str] = mapped_column(String(24), default="pooled")
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    confirmation_key: Mapped[Optional[str]] = mapped_column(String(120), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    donor: Mapped["User"] = relationship()
    project: Mapped["Project"] = relationship()


class LedgerEvent(Base):
    """Append-only financial ledger. Amounts are signed effects on the project's available balance."""

    __tablename__ = "ledger_events"
    __table_args__ = (Index("ix_ledger_project_type", "project_id", "event_type"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    donation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("donations.id"), index=True)
    purchase_request_id: Mapped[Optional[int]] = mapped_column(ForeignKey("purchase_requests.id"), index=True)
    payment_id: Mapped[Optional[int]] = mapped_column(ForeignKey("payments.id"))
    event_type: Mapped[str] = mapped_column(String(40), index=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    reference: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(160), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class FundAllocation(Base):
    __tablename__ = "fund_allocations"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), unique=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    status: Mapped[str] = mapped_column(String(20), default="reserved", index=True)  # reserved | settled | released
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)


class Quotation(Base):
    __tablename__ = "quotations"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_request_id: Mapped[Optional[int]] = mapped_column(ForeignKey("purchase_requests.id"), index=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"))
    reference: Mapped[str] = mapped_column(String(120), index=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    source: Mapped[str] = mapped_column(String(30), default="vendor_portal")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PurchaseRequest(Base):
    __tablename__ = "purchase_requests"
    __table_args__ = (Index("ix_purchase_project_status", "project_id", "status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    organisation_id: Mapped[int] = mapped_column(ForeignKey("organisations.id"), index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True)
    category: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str] = mapped_column(Text)
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price_minor: Mapped[int] = mapped_column(Integer)
    total_amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    quotation_reference: Mapped[str] = mapped_column(String(120))
    payment_destination: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    project: Mapped["Project"] = relationship()
    organisation: Mapped["Organisation"] = relationship()
    vendor: Mapped["Vendor"] = relationship()


class TransactionAuthorization(Base):
    __tablename__ = "transaction_authorizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), index=True)
    outcome: Mapped[str] = mapped_column(String(24), index=True)  # approved | blocked | review_required | pending
    reason: Mapped[str] = mapped_column(Text)
    checks: Mapped[list] = mapped_column(JSON, default=list)
    policy_id: Mapped[Optional[int]] = mapped_column(ForeignKey("project_policies.id"))
    policy_version: Mapped[Optional[int]] = mapped_column(Integer)
    decided_by: Mapped[str] = mapped_column(String(40), default="engine")
    reviewer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), index=True)
    provider: Mapped[str] = mapped_column(String(40), default="simulated")
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    idempotency_key: Mapped[str] = mapped_column(String(160), unique=True)
    provider_reference: Mapped[Optional[str]] = mapped_column(String(120), unique=True)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    settled_at: Mapped[Optional[datetime]] = mapped_column(DateTime)


class PaymentEvent(Base):
    __tablename__ = "payment_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(60))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    signature_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(160), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class EvidenceRecord(Base):
    __tablename__ = "evidence_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), index=True)
    evidence_type: Mapped[str] = mapped_column(String(60), index=True)
    status: Mapped[str] = mapped_column(String(24), default="collected")  # pending | collected | verified | inconsistent
    source: Mapped[str] = mapped_column(String(40), default="system")
    reference: Mapped[Optional[str]] = mapped_column(String(160))
    details: Mapped[Optional[str]] = mapped_column(Text)
    file_ref: Mapped[Optional[str]] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime)


class DeliveryConfirmation(Base):
    __tablename__ = "delivery_confirmations"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), unique=True)
    status: Mapped[str] = mapped_column(String(24), default="in_transit", index=True)  # in_transit | delivered | confirmed | disputed
    dispatch_reference: Mapped[Optional[str]] = mapped_column(String(160))
    dispatched_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    reported_value_minor: Mapped[int] = mapped_column(Integer)
    quantity_reported: Mapped[int] = mapped_column(Integer, default=0)
    quantity_received: Mapped[Optional[int]] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(60), default="vendor_report")
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    receipt_notes: Mapped[Optional[str]] = mapped_column(Text)
    reported_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    receipt_confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    receipt_confirmed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))


class AnomalyFlag(Base):
    __tablename__ = "anomaly_flags"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), index=True)
    flag_type: Mapped[str] = mapped_column(String(60), index=True)
    severity: Mapped[str] = mapped_column(String(20), default="medium")
    details: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    resolved_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ReviewDecision(Base):
    __tablename__ = "review_decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[str] = mapped_column(String(20))  # approved | rejected
    notes: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditEvent(Base):
    """Append-only audit trail. Corrections are new events; rows are never edited or deleted."""

    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_entity", "entity_type", "entity_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    actor_role: Mapped[str] = mapped_column(String(30), default="system")
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[Optional[str]] = mapped_column(String(60))
    before: Mapped[Optional[dict]] = mapped_column(JSON)
    after: Mapped[Optional[dict]] = mapped_column(JSON)
    ip: Mapped[Optional[str]] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AIAssessment(Base):
    __tablename__ = "ai_assessments"

    id: Mapped[int] = mapped_column(primary_key=True)
    service: Mapped[str] = mapped_column(String(60), index=True)
    purchase_request_id: Mapped[Optional[int]] = mapped_column(ForeignKey("purchase_requests.id"), index=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), index=True)
    available: Mapped[bool] = mapped_column(Boolean, default=False)
    model: Mapped[Optional[str]] = mapped_column(String(80))
    output: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class OnboardingState(Base):
    """Per-account tour progress. One row per user and tour key."""

    __tablename__ = "onboarding_states"
    __table_args__ = (UniqueConstraint("user_id", "tour_key", name="uq_onboarding_user_tour"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    tour_key: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="not_started")  # not_started | in_progress | completed | skipped
    current_step: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
