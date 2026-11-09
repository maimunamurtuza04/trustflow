from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import FundAllocation, LedgerEvent, ProjectPolicy, PurchaseRequest, utcnow

DONATION_CONFIRMED = "DONATION_CONFIRMED"
FUNDS_RESERVED = "FUNDS_RESERVED"
RESERVATION_RELEASED = "RESERVATION_RELEASED"
PAYMENT_MADE = "PAYMENT_MADE"
ADJUSTMENT = "ADJUSTMENT"


def record_event(
    db: Session,
    *,
    project_id: int,
    event_type: str,
    amount_minor: int,
    reference: str,
    description: str,
    currency: str = "INR",
    donation_id: int | None = None,
    purchase_request_id: int | None = None,
    payment_id: int | None = None,
    idempotency_key: str | None = None,
    meta: dict | None = None,
) -> LedgerEvent:
    if idempotency_key:
        existing = db.scalar(select(LedgerEvent).where(LedgerEvent.idempotency_key == idempotency_key))
        if existing:
            return existing
    event = LedgerEvent(
        project_id=project_id,
        donation_id=donation_id,
        purchase_request_id=purchase_request_id,
        payment_id=payment_id,
        event_type=event_type,
        amount_minor=amount_minor,
        currency=currency,
        reference=reference,
        description=description,
        idempotency_key=idempotency_key,
        meta=meta or {},
    )
    db.add(event)
    db.flush()
    return event


def project_totals(db: Session, project_id: int) -> dict:
    rows = db.execute(
        select(LedgerEvent.event_type, func.coalesce(func.sum(LedgerEvent.amount_minor), 0))
        .where(LedgerEvent.project_id == project_id)
        .group_by(LedgerEvent.event_type)
    ).all()
    by_type = {row[0]: int(row[1]) for row in rows}

    received = by_type.get(DONATION_CONFIRMED, 0)
    paid = -by_type.get(PAYMENT_MADE, 0)
    available = sum(by_type.values())
    reserved = int(
        db.scalar(
            select(func.coalesce(func.sum(FundAllocation.amount_minor), 0)).where(
                FundAllocation.project_id == project_id, FundAllocation.status == "reserved"
            )
        )
        or 0
    )
    return {
        "received_minor": received,
        "paid_minor": paid,
        "reserved_minor": reserved,
        "available_minor": available,
    }


def category_usage(db: Session, project_id: int) -> dict[str, int]:
    rows = db.execute(
        select(PurchaseRequest.category, func.coalesce(func.sum(PurchaseRequest.total_amount_minor), 0))
        .where(
            PurchaseRequest.project_id == project_id,
            PurchaseRequest.status.in_(("authorised", "paid")),
        )
        .group_by(PurchaseRequest.category)
    ).all()
    return {row[0]: int(row[1]) for row in rows}


def get_approved_policy(db: Session, project_id: int) -> ProjectPolicy | None:
    return db.scalar(
        select(ProjectPolicy)
        .where(ProjectPolicy.project_id == project_id, ProjectPolicy.status == "approved")
        .order_by(ProjectPolicy.version.desc())
    )


def get_latest_policy(db: Session, project_id: int) -> ProjectPolicy | None:
    return db.scalar(
        select(ProjectPolicy).where(ProjectPolicy.project_id == project_id).order_by(ProjectPolicy.version.desc())
    )
