from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import client_ip, get_current_user, require_roles
from app.models import (
    AuditEvent,
    Donation,
    Project,
    ProjectBudget,
    ProjectPolicy,
    PurchaseRequest,
    User,
    utcnow,
)
from app.schemas import PolicyDraftIn, ProjectCreateIn
from app.serializers import (
    audit_payload,
    donation_payload,
    policy_payload,
    project_payload,
    purchase_payload,
)
from app.services import ledger
from app.services.audit import audit
from app.services.ratelimit import allow

router = APIRouter(prefix="/api", tags=["projects"])


def _project(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _require_owner(db: Session, project: Project, user: User) -> None:
    if user.role == "admin":
        return
    organisation = user.organisation
    if user.role != "organisation" or organisation is None or project.organisation_id != organisation.id:
        raise HTTPException(status_code=403, detail="You do not manage this project.")


@router.get("/projects")
def list_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = select(Project).order_by(Project.created_at.desc())
    if user.role == "organisation":
        org = user.organisation
        if org is None:
            return []
        query = query.where(Project.organisation_id == org.id)
    elif user.role != "admin":
        query = query.where(Project.status == "active")
    projects = db.scalars(query).all()
    return [
        project_payload(db, p, include_pending_policy=user.role in ("admin", "organisation"))
        for p in projects
    ]


@router.post("/projects", status_code=201)
def create_project(
    payload: ProjectCreateIn,
    request: Request,
    user: User = Depends(require_roles("organisation")),
    db: Session = Depends(get_db),
):
    if not allow(f"project-create:{user.id}", limit=20, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many project creation attempts. Try again later.")
    org = user.organisation
    if org is None:
        raise HTTPException(status_code=400, detail="Organisation profile not found.")
    if org.verification_status in ("rejected", "suspended"):
        raise HTTPException(status_code=403, detail="Your organisation cannot create projects while suspended or rejected.")

    approved = {c.strip().lower() for c in payload.approved_categories}
    for line in payload.budgets:
        if line.category.strip().lower() not in approved:
            raise HTTPException(status_code=422, detail=f"Budget category '{line.category}' is not in approved categories.")

    project = Project(
        organisation_id=org.id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        category=payload.category.strip(),
        target_beneficiaries=payload.target_beneficiaries,
        geographic_coverage=payload.geographic_coverage.strip(),
        funding_target_minor=payload.funding_target_minor,
        currency=payload.currency.upper(),
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
        operational_requirements=payload.operational_requirements,
        status="pending_approval",
        verification_status="pending",
    )
    db.add(project)
    db.flush()

    policy = ProjectPolicy(
        project_id=project.id,
        version=1,
        status="draft",
        approved_categories=[c.strip() for c in payload.approved_categories],
        budget_lines=[
            {"category": line.category.strip(), "allocated_minor": line.allocated_minor}
            for line in payload.budgets
        ],
        per_transaction_limit_minor=payload.per_transaction_limit_minor,
        notes="Initial spending policy submitted with the project.",
        created_by=user.id,
    )
    db.add(policy)
    db.flush()

    audit(
        db,
        action="project.created",
        entity_type="project",
        entity_id=project.id,
        actor=user,
        after={
            "name": project.name,
            "funding_target_minor": project.funding_target_minor,
            "status": project.status,
        },
        ip=client_ip(request),
    )
    audit(
        db,
        action="policy.draft_created",
        entity_type="project_policy",
        entity_id=policy.id,
        actor=user,
        after={"version": policy.version, "status": policy.status},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(project)
    return project_payload(db, project, include_pending_policy=True)


@router.get("/projects/{project_id}")
def get_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _project(db, project_id)
    is_owner = user.role == "organisation" and user.organisation and project.organisation_id == user.organisation.id
    is_admin = user.role == "admin"

    if user.role == "donor" and project.status != "active":
        raise HTTPException(status_code=403, detail="This project is not open for public viewing.")
    if user.role == "vendor" and project.status != "active":
        raise HTTPException(status_code=403, detail="This project is not open for vendor viewing.")
    if user.role == "organisation" and not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You do not manage this project.")

    payload = project_payload(db, project, include_pending_policy=is_admin or is_owner)

    purchase_query = select(PurchaseRequest).where(PurchaseRequest.project_id == project.id)
    if user.role == "donor":
        purchase_query = purchase_query.where(PurchaseRequest.status.in_(("authorised", "paid")))
    elif user.role == "vendor":
        if user.vendor is None:
            purchase_query = purchase_query.where(PurchaseRequest.id == -1)
        else:
            purchase_query = purchase_query.where(PurchaseRequest.vendor_id == user.vendor.id)
    purchases = db.scalars(purchase_query.order_by(PurchaseRequest.created_at.desc())).all()
    payload["purchases"] = [purchase_payload(db, p) for p in purchases]

    donation_query = select(Donation).where(Donation.project_id == project.id, Donation.payment_status == "confirmed")
    if user.role == "donor":
        donation_query = donation_query.where(Donation.donor_id == user.id)
        payload["donations"] = {
            "confirmed_minor": payload["donations"]["confirmed_minor"],
            "count": payload["donations"]["count"],
            "mine": [donation_payload(d) for d in db.scalars(donation_query).all()],
            "note": "Donor contributions are pooled into the project's restricted balance. They are not attributed to individual purchases.",
        }
    elif is_admin or is_owner:
        payload["donations"] = {
            "confirmed_minor": payload["donations"]["confirmed_minor"],
            "count": payload["donations"]["count"],
            "records": [donation_payload(d) for d in db.scalars(donation_query).all()],
        }
    else:
        payload["donations"] = {
            "confirmed_minor": payload["donations"]["confirmed_minor"],
            "count": payload["donations"]["count"],
        }

    if is_admin or is_owner:
        payload["ledger"] = [
            {
                "id": event.id,
                "event_type": event.event_type,
                "amount_minor": event.amount_minor,
                "currency": event.currency,
                "reference": event.reference,
                "description": event.description,
                "created_at": event.created_at.isoformat(timespec="seconds") + "Z",
                "idempotency_key": event.idempotency_key,
            }
            for event in db.scalars(
                select(ledger.LedgerEvent)
                .where(ledger.LedgerEvent.project_id == project.id)
                .order_by(ledger.LedgerEvent.id)
            ).all()
        ]
        payload["policies"] = [
            policy_payload(p)
            for p in db.scalars(
                select(ProjectPolicy)
                .where(ProjectPolicy.project_id == project.id)
                .order_by(ProjectPolicy.version.desc())
            ).all()
        ]
    return payload


@router.post("/projects/{project_id}/policies", status_code=201)
def create_policy_draft(
    project_id: int,
    payload: PolicyDraftIn,
    request: Request,
    user: User = Depends(require_roles("organisation")),
    db: Session = Depends(get_db),
):
    project = _project(db, project_id)
    _require_owner(db, project, user)

    latest = ledger.get_latest_policy(db, project.id)
    next_version = (latest.version + 1) if latest else 1
    approved = {c.strip().lower() for c in payload.approved_categories}
    for line in payload.budgets:
        if line.category.strip().lower() not in approved:
            raise HTTPException(status_code=422, detail=f"Budget category '{line.category}' is not in approved categories.")

    policy = ProjectPolicy(
        project_id=project.id,
        version=next_version,
        status="draft",
        approved_categories=[c.strip() for c in payload.approved_categories],
        budget_lines=[
            {"category": line.category.strip(), "allocated_minor": line.allocated_minor}
            for line in payload.budgets
        ],
        per_transaction_limit_minor=payload.per_transaction_limit_minor,
        notes=payload.notes,
        created_by=user.id,
    )
    db.add(policy)
    db.flush()
    audit(
        db,
        action="policy.draft_created",
        entity_type="project_policy",
        entity_id=policy.id,
        actor=user,
        after={"project_id": project.id, "version": policy.version, "status": "draft"},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(policy)
    return policy_payload(policy)


@router.post("/policies/{policy_id}/approve")
def approve_policy(
    policy_id: int,
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    policy = db.get(ProjectPolicy, policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    if policy.status == "approved":
        raise HTTPException(status_code=409, detail="This policy version is already approved.")
    if policy.status == "superseded":
        raise HTTPException(status_code=409, detail="Superseded policy versions cannot be approved again.")

    project = _project(db, policy.project_id)
    if not policy.budget_lines:
        raise HTTPException(status_code=422, detail="Policy must contain at least one category budget.")

    before = policy_payload(policy)
    previous_approved = db.scalars(
        select(ProjectPolicy).where(ProjectPolicy.project_id == project.id, ProjectPolicy.status == "approved")
    ).all()
    for old in previous_approved:
        old.status = "superseded"
        audit(
            db,
            action="policy.superseded",
            entity_type="project_policy",
            entity_id=old.id,
            actor=user,
            before={"status": "approved"},
            after={"status": "superseded", "superseded_by_version": policy.version},
            ip=client_ip(request),
        )

    policy.status = "approved"
    policy.approved_by = user.id
    policy.approved_at = utcnow()
    if project.status in ("pending_approval", "draft"):
        project.status = "active"
    project.verification_status = "verified"

    # Mirror the approved budget lines into reporting rows, recording the previous allocation first.
    previous_budgets = db.scalars(select(ProjectBudget).where(ProjectBudget.project_id == project.id)).all()
    before_budgets = [{"category": b.category, "allocated_minor": b.allocated_minor} for b in previous_budgets]
    for row in previous_budgets:
        db.delete(row)
    db.flush()
    for line in policy.budget_lines:
        db.add(
            ProjectBudget(
                project_id=project.id,
                category=str(line.get("category", "")),
                allocated_minor=int(line.get("allocated_minor", 0)),
                currency=project.currency,
            )
        )
    db.flush()

    audit(
        db,
        action="policy.approved",
        entity_type="project_policy",
        entity_id=policy.id,
        actor=user,
        before=before,
        after={
            **policy_payload(policy),
            "project_id": project.id,
            "previous_budgets": before_budgets,
            "note": "Policy versions are immutable. Changes are recorded as new approved versions.",
        },
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(project)
    return project_payload(db, project, include_pending_policy=True)
