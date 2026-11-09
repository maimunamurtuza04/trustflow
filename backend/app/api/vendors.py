from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import Payment, PurchaseRequest, User, Vendor
from app.serializers import purchase_payload, vendor_payload

router = APIRouter(prefix="/api", tags=["vendors"])


@router.get("/vendors")
def list_vendors(
    category: str | None = Query(default=None),
    user: User = Depends(require_roles("organisation", "admin")),
    db: Session = Depends(get_db),
):
    query = select(Vendor).where(Vendor.verification_status == "verified").order_by(Vendor.business_name)
    vendors = db.scalars(query).all()
    if category:
        needle = category.strip().lower()
        vendors = [v for v in vendors if any(needle in str(c).lower() for c in (v.categories or []))]
    return [vendor_payload(db, v, include_products=True) for v in vendors]


@router.get("/vendors/{vendor_id}")
def get_vendor(
    vendor_id: int,
    user: User = Depends(require_roles("organisation", "admin")),
    db: Session = Depends(get_db),
):
    vendor = db.get(Vendor, vendor_id)
    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor_payload(db, vendor, include_products=True)


@router.get("/vendor/profile")
def vendor_profile(user: User = Depends(require_roles("vendor")), db: Session = Depends(get_db)):
    if user.vendor is None:
        raise HTTPException(status_code=404, detail="Vendor profile not found")
    return vendor_payload(db, user.vendor, include_products=True)


@router.get("/vendor/overview")
def vendor_overview(user: User = Depends(require_roles("vendor")), db: Session = Depends(get_db)):
    vendor = user.vendor
    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor profile not found")
    requests = db.scalars(
        select(PurchaseRequest)
        .where(PurchaseRequest.vendor_id == vendor.id)
        .order_by(PurchaseRequest.created_at.desc())
    ).all()
    order_ids = [r.id for r in requests]
    paid_total = 0
    if order_ids:
        payments = db.scalars(
            select(Payment).where(Payment.purchase_request_id.in_(order_ids), Payment.status == "settled")
        ).all()
        paid_total = sum(p.amount_minor for p in payments)
    return {
        "vendor": vendor_payload(db, vendor, include_products=True),
        "orders": [purchase_payload(db, r) for r in requests],
        "stats": {
            "orders_total": len(requests),
            "open_orders": sum(1 for r in requests if r.status in ("authorised", "review_required", "pending_info")),
            "paid_orders": sum(1 for r in requests if r.status == "paid"),
            "settled_minor": paid_total,
        },
    }
