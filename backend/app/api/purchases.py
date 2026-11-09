from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import client_ip, get_current_user, require_roles
from app.models import Donation, Project, PurchaseRequest, Quotation, TransactionAuthorization, User, Vendor, utcnow
from app.schemas import DeliveryReportIn, PaymentIn, PurchaseCreateIn, ReceiptIn, ReviewIn
from app.serializers import purchase_payload
from app.services import ai, authorization, delivery, payments
from app.services.audit import audit
from app.services.ratelimit import allow

router = APIRouter(prefix="/api/purchase-requests", tags=["purchase-requests"])


def _purchase(db: Session, purchase_id: int) -> PurchaseRequest:
    purchase = db.get(PurchaseRequest, purchase_id)
    if purchase is None:
        raise HTTPException(status_code=404, detail="Purchase request not found")
    return purchase


def _can_view(db: Session, user: User, purchase: PurchaseRequest) -> bool:
    if user.role == "admin":
        return True
    if user.role == "organisation":
        return bool(user.organisation and purchase.organisation_id == user.organisation.id)
    if user.role == "vendor":
        return bool(user.vendor and purchase.vendor_id == user.vendor.id)
    if user.role == "donor":
        if purchase.status not in ("authorised", "paid"):
            return False
        funded = db.scalar(
            select(Donation.id).where(
                Donation.project_id == purchase.project_id,
                Donation.donor_id == user.id,
                Donation.payment_status == "confirmed",
            )
        )
        return funded is not None
    return False


def _require_view(db: Session, user: User, purchase: PurchaseRequest) -> None:
    if not _can_view(db, user, purchase):
        raise HTTPException(status_code=404, detail="Purchase request not found")


@router.post("", status_code=201)
async def create_purchase_request(
    payload: PurchaseCreateIn,
    request: Request,
    user: User = Depends(require_roles("organisation")),
    db: Session = Depends(get_db),
):
    if not allow(f"purchase-submit:{user.id}", limit=30, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many purchase submissions. Try again later.")
    org = user.organisation
    if org is None:
        raise HTTPException(status_code=400, detail="Organisation profile not found.")
    project = db.get(Project, payload.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.organisation_id != org.id:
        raise HTTPException(status_code=403, detail="You cannot request purchases for this project.")
    vendor = db.get(Vendor, payload.vendor_id)
    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")

    total = payload.quantity * payload.unit_price_minor
    purchase = PurchaseRequest(
        project_id=project.id,
        organisation_id=org.id,
        created_by=user.id,
        vendor_id=vendor.id,
        category=payload.category.strip(),
        description=payload.description.strip(),
        quantity=payload.quantity,
        unit_price_minor=payload.unit_price_minor,
        total_amount_minor=total,
        currency=project.currency,
        quotation_reference=payload.quotation_reference.strip(),
        payment_destination=payload.payment_destination.strip(),
        status="draft",
        submitted_at=utcnow(),
    )
    db.add(purchase)
    db.flush()

    if purchase.quotation_reference:
        db.add(
            Quotation(
                purchase_request_id=purchase.id,
                vendor_id=vendor.id,
                reference=purchase.quotation_reference,
                amount_minor=total,
                currency=project.currency,
                source="vendor_portal",
                notes=f"Quotation submitted with purchase request #{purchase.id}",
            )
        )
        db.flush()

    policy_for_ai = authorization._approved_policy(db, project.id)
    ai_result = await ai.assess_purchase_relevance(
        project_name=project.name,
        project_category=project.category,
        project_description=project.description,
        purchase_category=purchase.category,
        purchase_description=purchase.description,
        approved_categories=(policy_for_ai.approved_categories if policy_for_ai else []),
    )
    ai.persist_assessment(db, ai_result, purchase_request_id=purchase.id, project_id=project.id)

    result = authorization.evaluate(
        db,
        purchase,
        ai_available=ai_result.available,
        ai_output=ai_result.output,
    )
    authorization.record_engine_decision(db, purchase, result, user)
    audit(
        db,
        action="purchase.submitted",
        entity_type="purchase_request",
        entity_id=purchase.id,
        actor=user,
        after={
            "project_id": project.id,
            "vendor_id": vendor.id,
            "category": purchase.category,
            "total_amount_minor": total,
            "outcome": result.outcome,
            "ai_available": ai_result.available,
        },
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(purchase)
    return {
        "purchase": purchase_payload(db, purchase, detail=True),
        "ai": {
            "available": ai_result.available,
            "detail": ai_result.detail,
            "verdict": ai_result.output.get("verdict") if ai_result.available else None,
            "authoritative": False,
        },
    }


@router.get("")
def list_purchases(
    project_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(PurchaseRequest).order_by(PurchaseRequest.created_at.desc())
    if user.role == "organisation":
        if user.organisation is None:
            return []
        query = query.where(PurchaseRequest.organisation_id == user.organisation.id)
    elif user.role == "vendor":
        if user.vendor is None:
            return []
        query = query.where(PurchaseRequest.vendor_id == user.vendor.id)
    elif user.role == "donor":
        query = query.where(PurchaseRequest.status.in_(("authorised", "paid")))
        funded_projects = select(Donation.project_id).where(
            Donation.donor_id == user.id, Donation.payment_status == "confirmed"
        )
        query = query.where(PurchaseRequest.project_id.in_(funded_projects))
    if project_id is not None:
        query = query.where(PurchaseRequest.project_id == project_id)
    if status_filter:
        query = query.where(PurchaseRequest.status == status_filter)
    purchases = db.scalars(query.limit(200)).all()
    return [purchase_payload(db, p) for p in purchases]


@router.get("/{purchase_id}")
def get_purchase(purchase_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    purchase = _purchase(db, purchase_id)
    _require_view(db, user, purchase)
    return purchase_payload(db, purchase, detail=True)


@router.post("/{purchase_id}/delivery")
def report_delivery(
    purchase_id: int,
    payload: DeliveryReportIn,
    request: Request,
    user: User = Depends(require_roles("vendor")),
    db: Session = Depends(get_db),
):
    purchase = _purchase(db, purchase_id)
    if user.vendor is None or purchase.vendor_id != user.vendor.id:
        raise HTTPException(status_code=404, detail="Purchase request not found")
    try:
        delivery.submit_vendor_report(
            db,
            purchase,
            user,
            dispatch_reference=payload.dispatch_reference,
            dispatched_at=payload.dispatched_at,
            delivered_at=payload.delivered_at,
            quantity_reported=payload.quantity_reported,
            notes=payload.notes,
            ip=client_ip(request),
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    db.commit()
    db.refresh(purchase)
    return purchase_payload(db, purchase, detail=True)


@router.post("/{purchase_id}/receipt")
def record_receipt(
    purchase_id: int,
    payload: ReceiptIn,
    request: Request,
    user: User = Depends(require_roles("organisation")),
    db: Session = Depends(get_db),
):
    purchase = _purchase(db, purchase_id)
    if user.organisation is None or purchase.organisation_id != user.organisation.id:
        raise HTTPException(status_code=404, detail="Purchase request not found")
    try:
        delivery.record_receipt(
            db,
            purchase,
            user,
            decision=payload.decision,
            notes=payload.notes,
            quantity_received=payload.quantity_received,
            ip=client_ip(request),
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    db.commit()
    db.refresh(purchase)
    return purchase_payload(db, purchase, detail=True)


@router.post("/{purchase_id}/review")
def review_purchase(
    purchase_id: int,
    payload: ReviewIn,
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    purchase = _purchase(db, purchase_id)
    try:
        authorization.reviewer_decide(db, purchase, user, payload.decision, payload.notes.strip())
    except authorization.ReviewBlocked as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail={"message": exc.message, "checks": exc.checks})
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    db.commit()
    db.refresh(purchase)
    return purchase_payload(db, purchase, detail=True)


@router.post("/{purchase_id}/pay")
def pay_purchase(
    purchase_id: int,
    payload: PaymentIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    purchase = _purchase(db, purchase_id)
    if user.role == "organisation":
        if user.organisation is None or purchase.organisation_id != user.organisation.id:
            raise HTTPException(status_code=403, detail="You cannot settle this purchase.")
    elif user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the organisation or an administrator can settle payments.")
    try:
        payment = payments.settle_simulated_payment(db, purchase, payload.idempotency_key, user)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    db.commit()
    db.refresh(purchase)
    return {
        "purchase": purchase_payload(db, purchase, detail=True),
        "payment": {
            "id": payment.id,
            "status": payment.status,
            "provider": payment.provider,
            "provider_reference": payment.provider_reference,
            "simulated": True,
            "settled_at": payment.settled_at.isoformat(timespec="seconds") + "Z",
        },
    }


@router.post("/{purchase_id}/ai-explanation")
async def explain_purchase(
    purchase_id: int,
    user: User = Depends(require_roles("organisation", "admin")),
    db: Session = Depends(get_db),
):
    purchase = _purchase(db, purchase_id)
    if user.role == "organisation" and (
        user.organisation is None or purchase.organisation_id != user.organisation.id
    ):
        raise HTTPException(status_code=404, detail="Purchase request not found")
    decision = db.scalar(
        select(TransactionAuthorization)
        .where(TransactionAuthorization.purchase_request_id == purchase.id)
        .order_by(TransactionAuthorization.id.desc())
    )
    if decision is None:
        raise HTTPException(status_code=409, detail="No authorization decision exists for this purchase.")
    result = await ai.explain_authorization(
        project_name=purchase.project.name,
        purchase_description=purchase.description,
        outcome=decision.outcome,
        reason=decision.reason,
        checks=decision.checks or [],
    )
    ai.persist_assessment(db, result, purchase_request_id=purchase.id, project_id=purchase.project_id)
    db.commit()
    return {
        "available": result.available,
        "detail": result.detail,
        "explanation": result.output.get("explanation") if result.available else None,
        "authoritative": False,
    }


@router.post("/{purchase_id}/ai-assessment")
async def refresh_ai_assessment(
    purchase_id: int,
    user: User = Depends(require_roles("organisation", "admin")),
    db: Session = Depends(get_db),
):
    purchase = _purchase(db, purchase_id)
    if user.role == "organisation" and (
        user.organisation is None or purchase.organisation_id != user.organisation.id
    ):
        raise HTTPException(status_code=404, detail="Purchase request not found")
    policy = authorization._approved_policy(db, purchase.project_id)
    result = await ai.assess_purchase_relevance(
        project_name=purchase.project.name,
        project_category=purchase.project.category,
        project_description=purchase.project.description,
        purchase_category=purchase.category,
        purchase_description=purchase.description,
        approved_categories=(policy.approved_categories if policy else []),
    )
    ai.persist_assessment(db, result, purchase_request_id=purchase.id, project_id=purchase.project_id)
    db.commit()
    return {
        "available": result.available,
        "detail": result.detail,
        "verdict": result.output.get("verdict") if result.available else None,
        "confidence": result.confidence,
        "reasoning": result.output.get("reasoning") if result.available else None,
        "authoritative": False,
    }
