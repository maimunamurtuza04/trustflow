from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import client_ip, require_roles
from app.models import Organisation, Project, PurchaseRequest, User, Vendor
from app.schemas import PaymentDestinationIn, UserStatusIn, VerificationIn
from app.serializers import organisation_payload, purchase_payload, user_payload, vendor_payload
from app.services.audit import audit

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/review-queue")
def review_queue(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    purchases = db.scalars(
        select(PurchaseRequest)
        .where(PurchaseRequest.status == "review_required")
        .order_by(PurchaseRequest.created_at.asc())
    ).all()
    return [purchase_payload(db, p) for p in purchases]


@router.get("/organisations")
def list_organisations(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    return [organisation_payload(o) for o in db.scalars(select(Organisation).order_by(Organisation.created_at.desc())).all()]


@router.post("/organisations/{organisation_id}/verify")
def verify_organisation(
    organisation_id: int,
    payload: VerificationIn,
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    org = db.get(Organisation, organisation_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation not found")
    before = org.verification_status
    org.verification_status = payload.verification_status
    org.verification_notes = payload.notes
    paused_projects = []
    if payload.verification_status in ("rejected", "suspended"):
        for project in db.scalars(
            select(Project).where(Project.organisation_id == org.id, Project.status == "active")
        ).all():
            project.status = "paused"
            paused_projects.append(project.id)
            audit(
                db,
                action="project.paused",
                entity_type="project",
                entity_id=project.id,
                actor=user,
                before={"status": "active"},
                after={"status": "paused", "reason": f"Organisation verification set to {payload.verification_status}"},
                ip=client_ip(request),
            )
    audit(
        db,
        action="organisation.verified" if payload.verification_status == "verified" else "organisation.verification_updated",
        entity_type="organisation",
        entity_id=org.id,
        actor=user,
        before={"verification_status": before},
        after={
            "verification_status": org.verification_status,
            "notes": payload.notes,
            "paused_projects": paused_projects,
        },
        ip=client_ip(request),
    )
    db.commit()
    return {**organisation_payload(org), "paused_projects": paused_projects}


@router.get("/vendors")
def list_vendors(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    return [vendor_payload(db, v) for v in db.scalars(select(Vendor).order_by(Vendor.created_at.desc())).all()]


@router.post("/vendors/{vendor_id}/verify")
def verify_vendor(
    vendor_id: int,
    payload: VerificationIn,
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    vendor = db.get(Vendor, vendor_id)
    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")
    before = vendor.verification_status
    vendor.verification_status = payload.verification_status
    audit(
        db,
        action="vendor.verified" if payload.verification_status == "verified" else "vendor.verification_updated",
        entity_type="vendor",
        entity_id=vendor.id,
        actor=user,
        before={"verification_status": before},
        after={"verification_status": vendor.verification_status, "notes": payload.notes},
        ip=client_ip(request),
    )
    db.commit()
    return vendor_payload(db, vendor)


@router.post("/vendors/{vendor_id}/payment-destination")
def set_vendor_payment_destination(
    vendor_id: int,
    payload: PaymentDestinationIn,
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    vendor = db.get(Vendor, vendor_id)
    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")
    before = {
        "payment_destination_ref": vendor.payment_destination_ref,
        "payment_destination_verified": vendor.payment_destination_verified,
    }
    vendor.payment_destination_ref = payload.payment_destination_ref.strip()
    vendor.payment_destination_verified = payload.verified
    audit(
        db,
        action="vendor.payment_destination_verified" if payload.verified else "vendor.payment_destination_updated",
        entity_type="vendor",
        entity_id=vendor.id,
        actor=user,
        before=before,
        after={
            "payment_destination_ref": vendor.payment_destination_ref,
            "payment_destination_verified": vendor.payment_destination_verified,
        },
        ip=client_ip(request),
    )
    db.commit()
    return vendor_payload(db, vendor)


@router.get("/users")
def list_users(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    return [user_payload(db, u) for u in db.scalars(select(User).order_by(User.created_at.desc())).all()]


@router.post("/users/{user_id}/status")
def set_user_status(
    user_id: int,
    payload: UserStatusIn,
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == user.id:
        raise HTTPException(status_code=409, detail="Administrators cannot deactivate their own account.")
    target.is_active = payload.is_active
    audit(
        db,
        action="user.activated" if payload.is_active else "user.suspended",
        entity_type="user",
        entity_id=target.id,
        actor=user,
        before={"is_active": not payload.is_active},
        after={"is_active": payload.is_active, "reason": payload.reason},
        ip=client_ip(request),
    )
    db.commit()
    return {"id": target.id, "is_active": target.is_active}
