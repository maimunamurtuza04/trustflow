import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import client_ip, get_current_user, require_roles
from app.models import Donation, Project, User, utcnow
from app.schemas import DonationConfirmIn, DonationCreateIn
from app.serializers import donation_payload, iso
from app.services import ledger, psp
from app.services.audit import audit
from app.services.ratelimit import allow

router = APIRouter(prefix="/api/donations", tags=["donations"])


@router.post("", status_code=201)
def create_donation(
    payload: DonationCreateIn,
    request: Request,
    user: User = Depends(require_roles("donor")),
    db: Session = Depends(get_db),
):
    if not allow(f"donate:{user.id}", limit=30, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many donation attempts. Try again later.")
    project = db.get(Project, payload.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status != "active":
        raise HTTPException(status_code=409, detail="This project is not accepting donations.")
    if payload.currency.upper() != project.currency:
        raise HTTPException(status_code=422, detail=f"This project accepts {project.currency} only.")

    donation_ref = uuid.uuid4().hex[:12].upper()
    provider = psp.get_payment_provider()
    order = provider.create_donation_order(
        donation_ref=donation_ref,
        amount_minor=payload.amount_minor,
        currency=payload.currency.upper(),
        idempotency_key=f"donation-order:{donation_ref}",
    )
    donation = Donation(
        donor_id=user.id,
        project_id=project.id,
        amount_minor=payload.amount_minor,
        currency=payload.currency.upper(),
        provider=provider.name,
        payment_reference=order.reference,
        payment_status="pledged",
        simulated=order.simulated,
    )
    db.add(donation)
    db.flush()
    audit(
        db,
        action="donation.pledged",
        entity_type="donation",
        entity_id=donation.id,
        actor=user,
        after={
            "project_id": project.id,
            "amount_minor": donation.amount_minor,
            "provider": provider.name,
            "simulated": order.simulated,
        },
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(donation)
    return {
        "donation": donation_payload(donation),
        "checkout": {
            "provider": provider.name,
            "simulated": order.simulated,
            "order_id": order.order_id,
            "note": (
                "This is a simulated donation checkout. No real money moves. "
                "Restricted balances in this prototype are simulated."
                if order.simulated
                else "Redirect the donor to PayPal using the returned order id, then confirm capture."
            ),
            "confirm_endpoint": f"/api/donations/{donation.id}/confirm",
        },
    }


@router.post("/{donation_id}/confirm")
def confirm_donation(
    donation_id: int,
    payload: DonationConfirmIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    donation = db.get(Donation, donation_id)
    if donation is None:
        raise HTTPException(status_code=404, detail="Donation not found")
    if user.role != "admin" and donation.donor_id != user.id:
        raise HTTPException(status_code=403, detail="You cannot confirm another donor's payment.")
    if donation.payment_status == "confirmed":
        return {"donation": donation_payload(donation), "idempotent": True}

    key_owner = db.scalar(select(Donation).where(Donation.confirmation_key == payload.idempotency_key))
    if key_owner is not None and key_owner.id != donation.id:
        raise HTTPException(status_code=409, detail="This idempotency key was already used for another donation.")

    provider = psp.get_payment_provider()
    if provider.name != donation.provider:
        raise HTTPException(
            status_code=409,
            detail=f"This donation was created with provider '{donation.provider}' and cannot be captured by '{provider.name}'.",
        )
    try:
        capture = provider.capture_donation(donation.payment_reference, idempotency_key=payload.idempotency_key)
    except psp.PaymentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    donation.payment_status = "confirmed"
    donation.confirmation_key = payload.idempotency_key
    donation.confirmed_at = utcnow()
    ledger.record_event(
        db,
        project_id=donation.project_id,
        event_type=ledger.DONATION_CONFIRMED,
        amount_minor=donation.amount_minor,
        reference=donation.payment_reference,
        description=(
            f"Simulated donation confirmed for project #{donation.project_id}"
            if capture.simulated
            else f"Donation captured via {provider.name} for project #{donation.project_id}"
        ),
        currency=donation.currency,
        donation_id=donation.id,
        idempotency_key=f"donation-confirmed:{donation.id}",
        meta={"simulated": capture.simulated, "provider": provider.name, "capture_id": capture.capture_id},
    )
    audit(
        db,
        action="donation.confirmed",
        entity_type="donation",
        entity_id=donation.id,
        actor=user,
        before={"payment_status": "pledged"},
        after={
            "payment_status": "confirmed",
            "amount_minor": donation.amount_minor,
            "reference": donation.payment_reference,
            "provider": provider.name,
            "simulated": capture.simulated,
        },
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(donation)

    project = db.get(Project, donation.project_id)
    from app.serializers import project_payload

    return {
        "donation": donation_payload(donation),
        "project_financials": project_payload(db, project)["financials"],
        "simulated": capture.simulated,
    }


@router.get("/mine")
def my_donations(user: User = Depends(require_roles("donor")), db: Session = Depends(get_db)):
    donations = db.scalars(
        select(Donation).where(Donation.donor_id == user.id).order_by(Donation.created_at.desc())
    ).all()
    return [donation_payload(d) for d in donations]
