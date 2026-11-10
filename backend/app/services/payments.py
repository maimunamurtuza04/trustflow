from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EvidenceRecord, FundAllocation, Payment, PaymentEvent, PurchaseRequest, utcnow
from app.services import ledger, psp
from app.services.audit import audit


def settle_simulated_payment(db: Session, purchase: PurchaseRequest, idempotency_key: str, actor):
    existing_by_key = db.scalar(select(Payment).where(Payment.idempotency_key == idempotency_key))
    if existing_by_key is not None:
        if existing_by_key.purchase_request_id != purchase.id:
            raise ValueError("Idempotency key has already been used for a different payment.")
        return existing_by_key

    existing_payment = db.scalar(select(Payment).where(Payment.purchase_request_id == purchase.id))
    if existing_payment is not None:
        return existing_payment

    if purchase.status != "authorised":
        raise ValueError("Only authorised purchase requests can be settled.")

    vendor = purchase.vendor
    if vendor is None or vendor.verification_status != "verified":
        raise ValueError("The vendor is no longer verified. Settlement is blocked.")
    if not vendor.payment_destination_verified:
        raise ValueError("The vendor's payout destination is not verified. Settlement is blocked.")
    if purchase.payment_destination.strip() != (vendor.payment_destination_ref or "").strip():
        raise ValueError("The purchase payment destination no longer matches the vendor's verified payout reference.")

    allocation = db.scalar(select(FundAllocation).where(FundAllocation.purchase_request_id == purchase.id))
    if allocation is None or allocation.status != "reserved":
        raise ValueError("No active reserved allocation exists for this purchase.")

    provider = psp.get_payment_provider()
    try:
        payout = provider.create_payout(
            purchase_ref=f"{purchase.id:06d}",
            amount_minor=purchase.total_amount_minor,
            currency=purchase.currency,
            destination=purchase.payment_destination,
            idempotency_key=idempotency_key,
        )
    except psp.PaymentProviderError as exc:
        raise ValueError(str(exc))

    payment = Payment(
        purchase_request_id=purchase.id,
        provider=provider.name,
        amount_minor=purchase.total_amount_minor,
        currency=purchase.currency,
        status="settled",
        idempotency_key=idempotency_key,
        provider_reference=payout.reference,
        simulated=payout.simulated,
        payload={
            "mode": "simulated" if payout.simulated else provider.name,
            "note": (
                "Simulated settlement. No real money moved. Purpose-restricted vendor settlement is simulated."
                if payout.simulated
                else f"Vendor payout submitted through {provider.name}."
            ),
            "provider_payout_id": payout.payout_id,
            "vendor_payment_destination": purchase.payment_destination,
        },
        settled_at=utcnow(),
    )
    db.add(payment)
    db.flush()

    db.add(
        PaymentEvent(
            payment_id=payment.id,
            event_type=(
                "simulated.provider.settlement_confirmed" if payout.simulated else "provider.payout.submitted"
            ),
            payload={
                "payment_reference": payment.provider_reference,
                "amount_minor": payment.amount_minor,
                "currency": payment.currency,
                "provider": provider.name,
                "simulated": payout.simulated,
            },
            signature_verified=False,
            idempotency_key=f"payment-event:{payment.id}",
        )
    )

    ledger.record_event(
        db,
        project_id=purchase.project_id,
        event_type=ledger.RESERVATION_RELEASED,
        amount_minor=purchase.total_amount_minor,
        reference=f"PAY-{payment.id}",
        description=f"Released reservation as payment settled for purchase #{purchase.id}",
        currency=purchase.currency,
        purchase_request_id=purchase.id,
        payment_id=payment.id,
        idempotency_key=f"release:payment:{payment.id}",
    )
    ledger.record_event(
        db,
        project_id=purchase.project_id,
        event_type=ledger.PAYMENT_MADE,
        amount_minor=-purchase.total_amount_minor,
        reference=f"PAY-{payment.id}",
        description=(
            f"Simulated vendor settlement for purchase #{purchase.id}"
            if payout.simulated
            else f"Vendor payout via {provider.name} for purchase #{purchase.id}"
        ),
        currency=purchase.currency,
        purchase_request_id=purchase.id,
        payment_id=payment.id,
        idempotency_key=f"pay:payment:{payment.id}",
        meta={"simulated": payout.simulated, "vendor_id": purchase.vendor_id, "provider": provider.name},
    )

    allocation.status = "settled"
    allocation.closed_at = utcnow()
    purchase.status = "paid"
    purchase.paid_at = utcnow()

    db.add(
        EvidenceRecord(
            purchase_request_id=purchase.id,
            evidence_type="payment_confirmation",
            status="verified",
            source=f"{provider.name}_provider",
            reference=payment.provider_reference,
            details=(
                f"Simulated provider settlement confirmation for {purchase.currency} "
                f"{purchase.total_amount_minor / 100:,.2f}. No real money moved."
                if payout.simulated
                else f"{provider.name} payout submitted for {purchase.currency} "
                f"{purchase.total_amount_minor / 100:,.2f} to {purchase.payment_destination}."
            ),
        )
    )
    db.flush()

    audit(
        db,
        action="payment.settled",
        entity_type="payment",
        entity_id=payment.id,
        actor=actor,
        after={
            "purchase_request_id": purchase.id,
            "amount_minor": payment.amount_minor,
            "currency": payment.currency,
            "provider": payment.provider,
            "simulated": payout.simulated,
            "provider_reference": payment.provider_reference,
        },
    )
    return payment
