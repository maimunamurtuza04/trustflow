from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AIAssessment,
    AuditEvent,
    Donation,
    EvidenceRecord,
    FundAllocation,
    Payment,
    Project,
    ProjectPolicy,
    PurchaseRequest,
    TransactionAuthorization,
    User,
    Vendor,
)
from app.services import delivery, ledger


def iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds") + "Z"
    return value.isoformat()


def organisation_payload(org) -> dict | None:
    if org is None:
        return None
    return {
        "id": org.id,
        "name": org.name,
        "registration_number": org.registration_number,
        "country": org.country,
        "verification_status": org.verification_status,
        "created_at": iso(org.created_at),
    }


def vendor_payload(
    db: Session,
    vendor: Vendor,
    include_products: bool = False,
    include_metrics: bool = True,
) -> dict:
    metrics = delivery.metrics_for_vendor(db, vendor.id) if include_metrics else None
    payload = {
        "id": vendor.id,
        "business_name": vendor.business_name,
        "registration_number": vendor.registration_number,
        "country": vendor.country,
        "categories": vendor.categories or [],
        "verification_status": vendor.verification_status,
        "payment_destination_verified": vendor.payment_destination_verified,
        "payment_destination_ref": vendor.payment_destination_ref,
        "delivery_performance": metrics["performance_percent"] if metrics else None,
        "delivery_metrics": metrics,
        "complaint_count": vendor.complaint_count,
    }
    if include_products:
        payload["products"] = [
            {
                "id": p.id,
                "name": p.name,
                "category": p.category,
                "description": p.description,
                "unit_price_minor": p.unit_price_minor,
                "currency": p.currency,
                "active": p.active,
            }
            for p in vendor.products
            if p.active
        ]
    return payload


def user_payload(db: Session, user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": iso(user.created_at),
        "organisation": organisation_payload(user.organisation),
        "vendor": vendor_payload(db, user.vendor) if user.vendor else None,
    }


def policy_payload(policy: ProjectPolicy | None) -> dict | None:
    if policy is None:
        return None
    return {
        "id": policy.id,
        "version": policy.version,
        "status": policy.status,
        "approved_categories": policy.approved_categories or [],
        "per_transaction_limit_minor": policy.per_transaction_limit_minor,
        "budget_lines": policy.budget_lines or [],
        "notes": policy.notes,
        "approved_by": policy.approved_by,
        "approved_at": iso(policy.approved_at),
        "created_at": iso(policy.created_at),
    }


def project_payload(db: Session, project: Project, *, include_pending_policy: bool = False) -> dict:
    totals = ledger.project_totals(db, project.id)
    policy = ledger.get_approved_policy(db, project.id)
    usage = {k.strip().lower(): v for k, v in ledger.category_usage(db, project.id).items()}
    budgets = []
    if policy:
        for line in policy.budget_lines or []:
            category = str(line.get("category", ""))
            allocated = int(line.get("allocated_minor", 0))
            committed = usage.get(category.strip().lower(), 0)
            budgets.append(
                {
                    "category": category,
                    "allocated_minor": allocated,
                    "committed_minor": committed,
                    "available_minor": max(0, allocated - committed),
                }
            )

    counts = dict(
        db.execute(
            select(PurchaseRequest.status, func.count())
            .where(PurchaseRequest.project_id == project.id)
            .group_by(PurchaseRequest.status)
        ).all()
    )
    donations_count, donations_total = db.execute(
        select(func.count(Donation.id), func.coalesce(func.sum(Donation.amount_minor), 0)).where(
            Donation.project_id == project.id, Donation.payment_status == "confirmed"
        )
    ).one()

    pending_policy = None
    if include_pending_policy:
        draft = db.scalar(
            select(ProjectPolicy)
            .where(ProjectPolicy.project_id == project.id, ProjectPolicy.status == "draft")
            .order_by(ProjectPolicy.version.desc())
        )
        pending_policy = policy_payload(draft)

    target = project.funding_target_minor or 0
    progress = round(min(100, (totals["received_minor"] / target) * 100), 1) if target else 0

    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "category": project.category,
        "target_beneficiaries": project.target_beneficiaries,
        "geographic_coverage": project.geographic_coverage,
        "funding_target_minor": project.funding_target_minor,
        "currency": project.currency,
        "starts_on": iso(project.starts_on),
        "ends_on": iso(project.ends_on),
        "status": project.status,
        "verification_status": project.verification_status,
        "operational_requirements": project.operational_requirements,
        "created_at": iso(project.created_at),
        "organisation": organisation_payload(project.organisation),
        "financials": {
            **totals,
            "funding_target_minor": project.funding_target_minor,
            "progress_percent": progress,
        },
        "policy": policy_payload(policy),
        "pending_policy": pending_policy,
        "budgets": budgets,
        "purchase_counts": {str(k): int(v) for k, v in counts.items()},
        "donations": {"count": int(donations_count), "confirmed_minor": int(donations_total)},
    }


def donation_payload(donation: Donation) -> dict:
    return {
        "id": donation.id,
        "amount_minor": donation.amount_minor,
        "currency": donation.currency,
        "provider": donation.provider,
        "payment_reference": donation.payment_reference,
        "payment_status": donation.payment_status,
        "allocation_status": donation.allocation_status,
        "simulated": donation.simulated,
        "created_at": iso(donation.created_at),
        "confirmed_at": iso(donation.confirmed_at),
        "donor": {"id": donation.donor.id, "full_name": donation.donor.full_name} if donation.donor else None,
        "project": {"id": donation.project.id, "name": donation.project.name} if donation.project else None,
    }


def authorization_payload(auth: TransactionAuthorization | None, include_checks: bool = True) -> dict | None:
    if auth is None:
        return None
    payload = {
        "id": auth.id,
        "outcome": auth.outcome,
        "reason": auth.reason,
        "policy_id": auth.policy_id,
        "policy_version": auth.policy_version,
        "decided_by": auth.decided_by,
        "reviewer_id": auth.reviewer_id,
        "created_at": iso(auth.created_at),
    }
    if include_checks:
        payload["checks"] = auth.checks or []
    return payload


def ai_payload(db: Session, purchase_id: int, service: str) -> dict | None:
    row = db.scalar(
        select(AIAssessment)
        .where(AIAssessment.purchase_request_id == purchase_id, AIAssessment.service == service)
        .order_by(AIAssessment.id.desc())
    )
    if row is None:
        return None
    output = row.output or {}
    return {
        "id": row.id,
        "available": row.available,
        "model": row.model,
        "confidence": row.confidence,
        "detail": row.detail,
        "verdict": output.get("verdict"),
        "reasoning": output.get("reasoning"),
        "signals": output.get("signals") or [],
        "explanation": output.get("explanation"),
        "created_at": iso(row.created_at),
    }


def purchase_payload(db: Session, purchase: PurchaseRequest, *, detail: bool = False) -> dict:
    authorization = db.scalar(
        select(TransactionAuthorization)
        .where(TransactionAuthorization.purchase_request_id == purchase.id)
        .order_by(TransactionAuthorization.id.desc())
    )
    payment = db.scalar(select(Payment).where(Payment.purchase_request_id == purchase.id))
    allocation = db.scalar(select(FundAllocation).where(FundAllocation.purchase_request_id == purchase.id))
    payload = {
        "id": purchase.id,
        "category": purchase.category,
        "description": purchase.description,
        "quantity": purchase.quantity,
        "unit_price_minor": purchase.unit_price_minor,
        "total_amount_minor": purchase.total_amount_minor,
        "currency": purchase.currency,
        "quotation_reference": purchase.quotation_reference,
        "payment_destination": purchase.payment_destination,
        "status": purchase.status,
        "created_at": iso(purchase.created_at),
        "submitted_at": iso(purchase.submitted_at),
        "paid_at": iso(purchase.paid_at),
        "project": {
            "id": purchase.project.id,
            "name": purchase.project.name,
            "category": purchase.project.category,
            "status": purchase.project.status,
        },
        "organisation": organisation_payload(purchase.organisation),
        "vendor": vendor_payload(db, purchase.vendor, include_metrics=detail),
        "decision": authorization_payload(authorization, include_checks=detail),
        "allocation": {
            "status": allocation.status,
            "amount_minor": allocation.amount_minor,
            "created_at": iso(allocation.created_at),
            "closed_at": iso(allocation.closed_at),
        }
        if allocation
        else None,
        "payment": {
            "id": payment.id,
            "provider": payment.provider,
            "status": payment.status,
            "amount_minor": payment.amount_minor,
            "currency": payment.currency,
            "simulated": payment.simulated,
            "provider_reference": payment.provider_reference,
            "created_at": iso(payment.created_at),
            "settled_at": iso(payment.settled_at),
        }
        if payment
        else None,
    }
    if detail:
        payload["ai_relevance"] = ai_payload(db, purchase.id, "purchase_relevance")
        payload["ai_explanation"] = ai_payload(db, purchase.id, "explanation")
        confirmation = delivery.confirmation_for(db, purchase.id)
        payload["delivery"] = (
            {
                "status": confirmation.status,
                "dispatch_reference": confirmation.dispatch_reference,
                "dispatched_at": iso(confirmation.dispatched_at),
                "delivered_at": iso(confirmation.delivered_at),
                "quantity_reported": confirmation.quantity_reported,
                "quantity_received": confirmation.quantity_received,
                "notes": confirmation.notes,
                "receipt_notes": confirmation.receipt_notes,
                "acknowledged": confirmation.acknowledged,
                "reported_at": iso(confirmation.reported_at),
                "receipt_confirmed_at": iso(confirmation.receipt_confirmed_at),
                "receipt_confirmed_by": confirmation.receipt_confirmed_by,
            }
            if confirmation
            else None
        )
        payload["evidence"] = [
            {
                "id": e.id,
                "evidence_type": e.evidence_type,
                "status": e.status,
                "source": e.source,
                "reference": e.reference,
                "details": e.details,
                "created_at": iso(e.created_at),
                "verified_at": iso(e.verified_at),
            }
            for e in db.scalars(
                select(EvidenceRecord)
                .where(EvidenceRecord.purchase_request_id == purchase.id)
                .order_by(EvidenceRecord.id)
            ).all()
        ]
    return payload


def audit_payload(event: AuditEvent, actor: User | None = None) -> dict:
    return {
        "id": event.id,
        "action": event.action,
        "entity_type": event.entity_type,
        "entity_id": event.entity_id,
        "actor": {
            "id": actor.id,
            "full_name": actor.full_name,
            "role": actor.role,
        }
        if actor
        else {"id": event.actor_user_id, "full_name": "System", "role": event.actor_role},
        "before": event.before,
        "after": event.after,
        "created_at": iso(event.created_at),
    }
