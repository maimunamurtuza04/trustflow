from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DeliveryConfirmation, EvidenceRecord, PurchaseRequest, User, Vendor, utcnow
from app.services.audit import audit


def _utc_naive(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def confirmation_for(db: Session, purchase_id: int) -> DeliveryConfirmation | None:
    return db.scalar(
        select(DeliveryConfirmation).where(DeliveryConfirmation.purchase_request_id == purchase_id)
    )


def snapshot(confirmation: DeliveryConfirmation | None) -> dict | None:
    if confirmation is None:
        return None
    return {
        "status": confirmation.status,
        "dispatch_reference": confirmation.dispatch_reference,
        "dispatched_at": confirmation.dispatched_at.isoformat(timespec="seconds") if confirmation.dispatched_at else None,
        "delivered_at": confirmation.delivered_at.isoformat(timespec="seconds") if confirmation.delivered_at else None,
        "quantity_reported": confirmation.quantity_reported,
        "quantity_received": confirmation.quantity_received,
        "receipt_confirmed_at": (
            confirmation.receipt_confirmed_at.isoformat(timespec="seconds")
            if confirmation.receipt_confirmed_at
            else None
        ),
    }


def submit_vendor_report(
    db: Session,
    purchase: PurchaseRequest,
    vendor_user: User,
    *,
    dispatch_reference: str,
    dispatched_at: datetime | None = None,
    delivered_at: datetime | None = None,
    quantity_reported: int | None = None,
    notes: str | None = None,
    ip: str | None = None,
) -> DeliveryConfirmation:
    if vendor_user.vendor is None or purchase.vendor_id != vendor_user.vendor.id:
        raise ValueError("You cannot report delivery for this purchase.")
    if purchase.status != "paid":
        raise ValueError("Delivery can only be reported for a settled purchase.")

    now = utcnow()
    confirmation = confirmation_for(db, purchase.id)
    if confirmation is not None and confirmation.status in ("confirmed", "disputed"):
        raise ValueError("Delivery and receipt are already recorded for this purchase.")

    dispatch_time = _utc_naive(dispatched_at) or (
        confirmation.dispatched_at if confirmation is not None else now
    )
    delivery_time = _utc_naive(delivered_at) or (
        confirmation.delivered_at if confirmation is not None else None
    )
    if dispatch_time > now:
        raise ValueError("Dispatch time cannot be in the future.")
    if delivery_time is not None and delivery_time > now:
        raise ValueError("Delivery time cannot be in the future.")
    if delivery_time is not None and delivery_time < dispatch_time:
        raise ValueError("Delivery time cannot be before dispatch time.")

    quantity = quantity_reported if quantity_reported is not None else (
        confirmation.quantity_reported if confirmation is not None else purchase.quantity
    )
    if quantity <= 0 or quantity > purchase.quantity:
        raise ValueError(f"Reported quantity must be between 1 and the ordered quantity ({purchase.quantity}).")

    before = snapshot(confirmation)
    status = "delivered" if delivery_time is not None else "in_transit"
    if confirmation is None:
        confirmation = DeliveryConfirmation(
            purchase_request_id=purchase.id,
            reported_value_minor=purchase.total_amount_minor,
            method="vendor_report",
        )
        db.add(confirmation)
    confirmation.status = status
    confirmation.dispatch_reference = dispatch_reference.strip()
    confirmation.dispatched_at = dispatch_time
    confirmation.delivered_at = delivery_time
    confirmation.quantity_reported = quantity
    confirmation.notes = notes.strip() if notes else None
    confirmation.reported_at = now
    db.flush()

    event_type = "delivery_report" if status == "delivered" else "dispatch_report"
    db.add(
        EvidenceRecord(
            purchase_request_id=purchase.id,
            evidence_type=event_type,
            status="collected",
            source="vendor",
            reference=confirmation.dispatch_reference,
            details=(
                f"Vendor reported {'delivery' if status == 'delivered' else 'dispatch'} "
                f"for {quantity} of {purchase.quantity} units."
                + (f" Notes: {confirmation.notes}" if confirmation.notes else "")
            ),
        )
    )
    db.flush()

    audit(
        db,
        action="delivery.reported",
        entity_type="purchase_request",
        entity_id=purchase.id,
        actor=vendor_user,
        before=before,
        after=snapshot(confirmation),
        ip=ip,
    )
    return confirmation


def record_receipt(
    db: Session,
    purchase: PurchaseRequest,
    org_user: User,
    *,
    decision: str,
    notes: str = "",
    quantity_received: int | None = None,
    ip: str | None = None,
) -> DeliveryConfirmation:
    if org_user.organisation is None or purchase.organisation_id != org_user.organisation.id:
        raise ValueError("You cannot record receipt for this purchase.")
    if decision not in ("confirmed", "disputed"):
        raise ValueError("Receipt decision must be 'confirmed' or 'disputed'.")
    if purchase.status != "paid":
        raise ValueError("Receipt can only be recorded for a settled purchase.")

    confirmation = confirmation_for(db, purchase.id)
    if confirmation is None:
        raise ValueError("No vendor delivery report exists for this purchase.")
    if confirmation.status == "in_transit" or confirmation.delivered_at is None:
        raise ValueError("The vendor has not reported delivery yet.")
    if confirmation.status in ("confirmed", "disputed"):
        raise ValueError("A receipt decision has already been recorded for this purchase.")

    cleaned_notes = notes.strip()
    if decision == "disputed" and len(cleaned_notes) < 10:
        raise ValueError("A dispute requires notes of at least 10 characters explaining the problem.")

    quantity = quantity_received if quantity_received is not None else confirmation.quantity_reported
    if quantity <= 0 or quantity > purchase.quantity:
        raise ValueError(f"Received quantity must be between 1 and the ordered quantity ({purchase.quantity}).")

    before = snapshot(confirmation)
    confirmation.status = "confirmed" if decision == "confirmed" else "disputed"
    confirmation.acknowledged = decision == "confirmed"
    confirmation.quantity_received = quantity
    confirmation.receipt_notes = cleaned_notes or None
    confirmation.receipt_confirmed_at = utcnow()
    confirmation.receipt_confirmed_by = org_user.id
    db.flush()

    evidence_type = "receipt_confirmation" if decision == "confirmed" else "receipt_dispute"
    evidence_status = "verified" if decision == "confirmed" else "inconsistent"
    db.add(
        EvidenceRecord(
            purchase_request_id=purchase.id,
            evidence_type=evidence_type,
            status=evidence_status,
            source="organisation",
            reference=confirmation.dispatch_reference,
            details=(
                f"Organisation {decision} receipt of {quantity} units."
                + (f" Notes: {cleaned_notes}" if cleaned_notes else "")
            ),
            verified_at=utcnow() if decision == "confirmed" else None,
        )
    )
    db.flush()

    audit(
        db,
        action="delivery.confirmed" if decision == "confirmed" else "delivery.disputed",
        entity_type="purchase_request",
        entity_id=purchase.id,
        actor=org_user,
        before=before,
        after=snapshot(confirmation),
        ip=ip,
    )
    return confirmation


def metrics_for_vendor(db: Session, vendor_id: int) -> dict:
    confirmations = db.scalars(
        select(DeliveryConfirmation)
        .join(PurchaseRequest, DeliveryConfirmation.purchase_request_id == PurchaseRequest.id)
        .where(PurchaseRequest.vendor_id == vendor_id)
    ).all()
    confirmed = sum(1 for c in confirmations if c.status == "confirmed")
    disputed = sum(1 for c in confirmations if c.status == "disputed")
    in_transit = sum(1 for c in confirmations if c.status == "in_transit")
    awaiting_receipt = sum(1 for c in confirmations if c.status == "delivered")
    reviewed = confirmed + disputed
    return {
        "reported": len(confirmations),
        "confirmed": confirmed,
        "disputed": disputed,
        "in_transit": in_transit,
        "awaiting_receipt": awaiting_receipt,
        "reviewed": reviewed,
        "performance_percent": round(confirmed * 100.0 / reviewed, 1) if reviewed else None,
    }


def performance_for_vendor(db: Session, vendor: Vendor) -> float | None:
    return metrics_for_vendor(db, vendor.id)["performance_percent"]
