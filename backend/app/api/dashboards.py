from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_roles
from app.models import (
    AuditEvent,
    Donation,
    Organisation,
    Project,
    ProjectPolicy,
    PurchaseRequest,
    User,
    Vendor,
)
from app.serializers import (
    audit_payload,
    donation_payload,
    organisation_payload,
    policy_payload,
    project_payload,
    purchase_payload,
    vendor_payload,
)

router = APIRouter(prefix="/api", tags=["dashboards"])


@router.get("/donor/overview")
def donor_overview(user: User = Depends(require_roles("donor")), db: Session = Depends(get_db)):
    donations = db.scalars(
        select(Donation).where(Donation.donor_id == user.id).order_by(Donation.created_at.desc())
    ).all()
    confirmed = [d for d in donations if d.payment_status == "confirmed"]
    pledged = [d for d in donations if d.payment_status == "pledged"]
    funded_ids = sorted({d.project_id for d in confirmed})

    projects = []
    purchases = []
    if funded_ids:
        projects = [
            project_payload(db, p)
            for p in db.scalars(select(Project).where(Project.id.in_(funded_ids))).all()
        ]
        purchases = [
            purchase_payload(db, p)
            for p in db.scalars(
                select(PurchaseRequest)
                .where(
                    PurchaseRequest.project_id.in_(funded_ids),
                    PurchaseRequest.status.in_(("authorised", "paid")),
                )
                .order_by(PurchaseRequest.created_at.desc())
                .limit(20)
            ).all()
        ]

    return {
        "donor": {"id": user.id, "full_name": user.full_name, "email": user.email},
        "stats": {
            "confirmed_donated_minor": sum(d.amount_minor for d in confirmed),
            "pledged_minor": sum(d.amount_minor for d in pledged),
            "projects_funded": len(funded_ids),
            "paid_to_suppliers_minor": sum(p["financials"]["paid_minor"] for p in projects),
            "remaining_restricted_minor": sum(p["financials"]["available_minor"] for p in projects),
        },
        "donations": [donation_payload(d) for d in donations],
        "projects": projects,
        "purchases": purchases,
        "attribution_note": (
            "Donations are pooled into each project's restricted balance. Individual donations are not attributed "
            "to individual purchases; every payment is traceable to the project pool, policy decision and evidence."
        ),
    }


@router.get("/org/overview")
def org_overview(user: User = Depends(require_roles("organisation")), db: Session = Depends(get_db)):
    org = user.organisation
    if org is None:
        return {"organisation": None, "projects": [], "purchases": [], "stats": {}}
    projects = db.scalars(
        select(Project).where(Project.organisation_id == org.id).order_by(Project.created_at.desc())
    ).all()
    payloads = [project_payload(db, p, include_pending_policy=True) for p in projects]
    purchases = db.scalars(
        select(PurchaseRequest)
        .where(PurchaseRequest.organisation_id == org.id)
        .order_by(PurchaseRequest.created_at.desc())
    ).all()
    pending_policies = db.scalars(
        select(ProjectPolicy)
        .join(Project, Project.id == ProjectPolicy.project_id)
        .where(Project.organisation_id == org.id, ProjectPolicy.status == "draft")
        .order_by(ProjectPolicy.created_at.desc())
    ).all()
    vendor_count = int(db.scalar(select(func.count()).select_from(Vendor).where(Vendor.verification_status == "verified")) or 0)

    return {
        "organisation": organisation_payload(org),
        "projects": payloads,
        "purchases": [purchase_payload(db, p) for p in purchases],
        "pending_policies": [
            {**policy_payload(policy), "project": {"id": policy.project.id, "name": policy.project.name}}
            for policy in pending_policies
        ],
        "stats": {
            "received_minor": sum(p["financials"]["received_minor"] for p in payloads),
            "available_minor": sum(p["financials"]["available_minor"] for p in payloads),
            "reserved_minor": sum(p["financials"]["reserved_minor"] for p in payloads),
            "paid_minor": sum(p["financials"]["paid_minor"] for p in payloads),
            "active_projects": sum(1 for p in projects if p.status == "active"),
            "review_required": sum(1 for p in purchases if p.status == "review_required"),
            "awaiting_payment": sum(1 for p in purchases if p.status == "authorised"),
            "verified_vendors": vendor_count,
        },
    }


@router.get("/admin/overview")
def admin_overview(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    review_queue = db.scalars(
        select(PurchaseRequest)
        .where(PurchaseRequest.status == "review_required")
        .order_by(PurchaseRequest.created_at.asc())
    ).all()
    pending_policies = db.scalars(
        select(ProjectPolicy).where(ProjectPolicy.status == "draft").order_by(ProjectPolicy.created_at.asc())
    ).all()
    organisations = db.scalars(select(Organisation).order_by(Organisation.created_at.desc())).all()
    vendors = db.scalars(select(Vendor).order_by(Vendor.created_at.desc())).all()
    recent = db.scalars(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(8)).all()
    actors = _actor_map(db, recent)

    return {
        "stats": {
            "review_queue": len(review_queue),
            "pending_policies": len(pending_policies),
            "pending_organisations": sum(1 for o in organisations if o.verification_status == "pending"),
            "pending_vendors": sum(1 for v in vendors if v.verification_status == "pending"),
            "active_projects": int(db.scalar(select(func.count()).select_from(Project).where(Project.status == "active")) or 0),
            "users": int(db.scalar(select(func.count()).select_from(User)) or 0),
        },
        "review_queue": [purchase_payload(db, p) for p in review_queue],
        "pending_policies": [
            {**policy_payload(policy), "project": {"id": policy.project.id, "name": policy.project.name}}
            for policy in pending_policies
        ],
        "organisations": [organisation_payload(o) for o in organisations],
        "vendors": [vendor_payload(db, v) for v in vendors],
        "recent_audit": [audit_payload(e, actors.get(e.actor_user_id)) for e in recent],
    }


def _actor_map(db: Session, events: list[AuditEvent]) -> dict[int, User]:
    ids = {e.actor_user_id for e in events if e.actor_user_id}
    if not ids:
        return {}
    users = db.scalars(select(User).where(User.id.in_(ids))).all()
    return {u.id: u for u in users}


@router.get("/admin/audit")
def list_audit(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    query = select(AuditEvent)
    count_query = select(func.count()).select_from(AuditEvent)
    if action:
        query = query.where(AuditEvent.action == action)
        count_query = count_query.where(AuditEvent.action == action)
    if entity_type:
        query = query.where(AuditEvent.entity_type == entity_type)
        count_query = count_query.where(AuditEvent.entity_type == entity_type)
    total = int(db.scalar(count_query) or 0)
    events = db.scalars(query.order_by(AuditEvent.id.desc()).offset(offset).limit(limit)).all()
    actors = _actor_map(db, events)
    return {
        "total": total,
        "items": [audit_payload(e, actors.get(e.actor_user_id)) for e in events],
        "append_only": "Audit events are immutable. Corrections are recorded as new events.",
    }
