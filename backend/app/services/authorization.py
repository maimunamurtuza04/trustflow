from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    FundAllocation,
    Project,
    ProjectPolicy,
    PurchaseRequest,
    ReviewDecision,
    TransactionAuthorization,
    Vendor,
    utcnow,
)
from app.services import ledger
from app.services.audit import audit

STATUS_MAP = {
    "approved": "authorised",
    "blocked": "blocked",
    "review_required": "review_required",
    "pending": "pending_info",
}

HARD_CHECK_KEYS = {
    "project_active",
    "organisation_authorised",
    "vendor_verified",
    "restricted_funding",
    "payment_destination",
    "duplicate_purchase",
}

REVIEW_CATEGORY_KEYWORDS = (
    "communication",
    "logistic",
    "transport",
    "administrative",
    "administration",
    "operational support",
    "warehouse",
    "storage",
    "insurance",
    "coordination",
    "staff safety",
)


class ReviewBlocked(Exception):
    def __init__(self, message: str, checks: list[dict]):
        super().__init__(message)
        self.message = message
        self.checks = checks


@dataclass
class EngineResult:
    outcome: str
    reason: str
    checks: list[dict]
    policy: ProjectPolicy | None


def normalize(value: str) -> str:
    return " ".join(value.strip().lower().split())


def money(minor: int, currency: str = "INR") -> str:
    symbol = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}.get(currency, currency + " ")
    if minor % 100 == 0:
        return f"{symbol}{minor // 100:,}"
    return f"{symbol}{minor / 100:,.2f}"


def _check(key: str, label: str, status: str, detail: str) -> dict:
    return {"key": key, "label": label, "status": status, "detail": detail}


def _is_review_category(category: str) -> bool:
    norm = normalize(category)
    return any(keyword in norm for keyword in REVIEW_CATEGORY_KEYWORDS)


def _approved_policy(db: Session, project_id: int) -> ProjectPolicy | None:
    return ledger.get_approved_policy(db, project_id)


def evaluate(
    db: Session,
    purchase: PurchaseRequest,
    *,
    ai_available: bool = False,
    ai_output: dict | None = None,
) -> EngineResult:
    checks: list[dict] = []
    project = db.get(Project, purchase.project_id)
    organisation = project.organisation if project else None
    vendor = db.get(Vendor, purchase.vendor_id)
    policy = _approved_policy(db, purchase.project_id) if project else None
    currency = purchase.currency

    # 0. Approved spending policy (prerequisite)
    if policy is None:
        checks.append(
            _check(
                "spending_policy",
                "Approved spending policy",
                "pending",
                "No approved spending policy exists for this project. An organisation policy must be approved by an administrator before funds can move.",
            )
        )
    else:
        checks.append(
            _check(
                "spending_policy",
                "Approved spending policy",
                "pass",
                f"Enforcing approved policy v{policy.version}, approved by administrator #{policy.approved_by}.",
            )
        )

    # 1. Project active
    if project is None:
        checks.append(_check("project_active", "Project active", "fail", "Project not found."))
    elif project.status != "active":
        checks.append(
            _check(
                "project_active",
                "Project active",
                "fail",
                f"Project status is '{project.status}'. Only active projects can spend restricted funds.",
            )
        )
    else:
        checks.append(_check("project_active", "Project active", "pass", f"'{project.name}' is active."))

    # 2. Organisation authorised
    if organisation is None or purchase.organisation_id != organisation.id:
        checks.append(
            _check(
                "organisation_authorised",
                "Organisation authorised",
                "fail",
                "The purchase request is not linked to the organisation that owns this project.",
            )
        )
    elif organisation.verification_status != "verified":
        checks.append(
            _check(
                "organisation_authorised",
                "Organisation authorised",
                "fail",
                f"Organisation verification status is '{organisation.verification_status}'.",
            )
        )
    else:
        checks.append(
            _check(
                "organisation_authorised",
                "Organisation authorised",
                "pass",
                f"'{organisation.name}' is a verified organisation.",
            )
        )

    # 3. Vendor verified
    if vendor is None:
        checks.append(_check("vendor_verified", "Vendor verified", "fail", "Vendor not found."))
    elif vendor.verification_status != "verified":
        checks.append(
            _check(
                "vendor_verified",
                "Vendor verified",
                "fail",
                f"Vendor verification status is '{vendor.verification_status}'. Payments can only be routed to verified vendors.",
            )
        )
    else:
        checks.append(
            _check(
                "vendor_verified",
                "Vendor verified",
                "pass",
                f"'{vendor.business_name}' is a verified vendor. Verification does not guarantee delivery.",
            )
        )

    # 4. Product category permitted by approved policy
    canonical_category: str | None = None
    category_status = "skipped"
    if policy is None:
        checks.append(
            _check(
                "category_permitted",
                "Category permitted",
                "skipped",
                "No approved policy to evaluate the category against.",
            )
        )
    else:
        match = next(
            (c for c in policy.approved_categories if normalize(c) == normalize(purchase.category)),
            None,
        )
        if match:
            canonical_category = match
            category_status = "pass"
            checks.append(
                _check(
                    "category_permitted",
                    "Category permitted",
                    "pass",
                    f"'{match}' is an approved spending category in policy v{policy.version}.",
                )
            )
        elif _is_review_category(purchase.category):
            category_status = "review"
            checks.append(
                _check(
                    "category_permitted",
                    "Category permitted",
                    "review",
                    f"'{purchase.category}' is an operational category not listed in the approved policy. Its eligibility is not established and requires human review.",
                )
            )
        else:
            category_status = "fail"
            checks.append(
                _check(
                    "category_permitted",
                    "Category permitted",
                    "fail",
                    f"'{purchase.category}' is not an approved spending category for this project and is not an operational category eligible for review.",
                )
            )

    # 5. Contextual relevance (AI advisory only)
    if category_status == "fail":
        checks.append(
            _check(
                "purchase_relevance",
                "Contextual relevance",
                "skipped",
                "Relevance is not evaluated because the category is outside the approved policy.",
            )
        )
    elif category_status == "review":
        checks.append(
            _check(
                "purchase_relevance",
                "Contextual relevance",
                "skipped",
                "Category eligibility is under human review; AI output cannot override the approved policy.",
            )
        )
    elif ai_available and ai_output:
        verdict = str(ai_output.get("verdict", "")).lower()
        reasoning = str(ai_output.get("reasoning", ""))[:400]
        confidence = ai_output.get("confidence")
        confidence_text = f" (confidence {float(confidence):.0%})" if isinstance(confidence, (int, float)) else ""
        if verdict in ("ambiguous", "unrelated"):
            checks.append(
                _check(
                    "purchase_relevance",
                    "Contextual relevance",
                    "review",
                    f"AI advisory verdict: {verdict}{confidence_text}. This does not block the purchase; a human must decide. {reasoning}",
                )
            )
        elif verdict in ("clearly_relevant", "potentially_relevant"):
            checks.append(
                _check(
                    "purchase_relevance",
                    "Contextual relevance",
                    "pass",
                    f"AI advisory verdict: {verdict}{confidence_text}. The deterministic category policy remains authoritative. {reasoning}",
                )
            )
        else:
            checks.append(
                _check(
                    "purchase_relevance",
                    "Contextual relevance",
                    "pass",
                    "AI advisory returned no usable verdict. Approved category policy applied deterministically.",
                )
            )
    else:
        checks.append(
            _check(
                "purchase_relevance",
                "Contextual relevance",
                "pass",
                "Category is within the approved policy. AI advisory is unavailable, so deterministic policy was applied alone.",
            )
        )

    # 6. Approved category budget
    if policy is None or canonical_category is None:
        checks.append(
            _check(
                "category_budget",
                "Category budget",
                "skipped",
                "No approved category budget applies. Administrator review is required."
                if category_status == "review"
                else "No approved policy budget to evaluate.",
            )
        )
    else:
        budget_line = next(
            (b for b in policy.budget_lines if normalize(str(b.get("category", ""))) == normalize(canonical_category)),
            None,
        )
        if budget_line is None:
            checks.append(
                _check(
                    "category_budget",
                    "Category budget",
                    "fail",
                    f"No approved budget allocation exists for '{canonical_category}'.",
                )
            )
        else:
            allocated = int(budget_line.get("allocated_minor", 0))
            usage = {normalize(k): v for k, v in ledger.category_usage(db, purchase.project_id).items()}
            used = usage.get(normalize(canonical_category), 0)
            if used + purchase.total_amount_minor > allocated:
                checks.append(
                    _check(
                        "category_budget",
                        "Category budget",
                        "fail",
                        f"Category budget exceeded: {money(used, currency)} authorised/paid + {money(purchase.total_amount_minor, currency)} requested exceeds the {money(allocated, currency)} allocation for '{canonical_category}'.",
                    )
                )
            else:
                checks.append(
                    _check(
                        "category_budget",
                        "Category budget",
                        "pass",
                        f"Within '{canonical_category}' budget: {money(used, currency)} committed of {money(allocated, currency)}; {money(purchase.total_amount_minor, currency)} requested.",
                    )
                )

    # 7. Restricted funding available
    totals = ledger.project_totals(db, purchase.project_id)
    if purchase.total_amount_minor > totals["available_minor"]:
        checks.append(
            _check(
                "restricted_funding",
                "Restricted funding",
                "fail",
                f"Insufficient restricted funds: {money(purchase.total_amount_minor, currency)} requested but only {money(totals['available_minor'], currency)} is available.",
            )
        )
    else:
        checks.append(
            _check(
                "restricted_funding",
                "Restricted funding",
                "pass",
                f"Available restricted balance is {money(totals['available_minor'], currency)}; the request reserves {money(purchase.total_amount_minor, currency)}.",
            )
        )

    # 8. Payment destination matches verified vendor destination
    if not purchase.payment_destination.strip():
        checks.append(
            _check(
                "payment_destination",
                "Payment destination",
                "pending",
                "Payment destination is missing from the purchase request.",
            )
        )
    elif vendor is None:
        checks.append(
            _check("payment_destination", "Payment destination", "skipped", "Vendor not found.")
        )
    elif not vendor.payment_destination_verified:
        checks.append(
            _check(
                "payment_destination",
                "Payment destination",
                "fail",
                "The vendor's payout destination has not been verified.",
            )
        )
    elif purchase.payment_destination.strip() != (vendor.payment_destination_ref or "").strip():
        checks.append(
            _check(
                "payment_destination",
                "Payment destination",
                "fail",
                f"Requested destination '{purchase.payment_destination}' does not match the vendor's verified payout reference.",
            )
        )
    else:
        checks.append(
            _check(
                "payment_destination",
                "Payment destination",
                "pass",
                "Payment destination matches the vendor's verified payout reference.",
            )
        )

    # 9. Duplicate purchase / reused quotation
    window_start = utcnow() - timedelta(hours=24)
    duplicate = db.scalar(
        select(PurchaseRequest).where(
            PurchaseRequest.id != purchase.id,
            PurchaseRequest.project_id == purchase.project_id,
            PurchaseRequest.vendor_id == purchase.vendor_id,
            PurchaseRequest.total_amount_minor == purchase.total_amount_minor,
            func.lower(PurchaseRequest.description) == purchase.description.strip().lower(),
            PurchaseRequest.status.in_(("authorised", "paid", "review_required", "pending_info")),
            PurchaseRequest.created_at >= window_start,
        )
    )
    reused_quotation = None
    if purchase.quotation_reference.strip():
        reused_quotation = db.scalar(
            select(PurchaseRequest).where(
                PurchaseRequest.id != purchase.id,
                PurchaseRequest.project_id == purchase.project_id,
                PurchaseRequest.vendor_id == purchase.vendor_id,
                PurchaseRequest.quotation_reference == purchase.quotation_reference.strip(),
                PurchaseRequest.status.notin_(("blocked", "cancelled", "draft")),
            )
        )

    if duplicate is not None:
        checks.append(
            _check(
                "duplicate_purchase",
                "Duplicate check",
                "fail",
                f"Duplicate purchase: an equivalent request (#{duplicate.id}) already exists for this project, vendor and amount within the last 24 hours.",
            )
        )
    elif reused_quotation is not None:
        checks.append(
            _check(
                "duplicate_purchase",
                "Duplicate check",
                "fail",
                f"Quotation reference '{purchase.quotation_reference}' was already used on purchase request #{reused_quotation.id}.",
            )
        )
    elif not purchase.quotation_reference.strip():
        checks.append(
            _check(
                "duplicate_purchase",
                "Duplicate check",
                "pending",
                "Quotation reference is missing. A supplier quotation reference is required.",
            )
        )
    else:
        checks.append(
            _check(
                "duplicate_purchase",
                "Duplicate check",
                "pass",
                "No duplicate purchase or reused quotation was found in the last 24 hours.",
            )
        )

    # 10. Unusual patterns: limit, velocity, splitting
    pattern_status = "pass"
    pattern_issues: list[str] = []
    if policy is not None and policy.per_transaction_limit_minor > 0:
        if purchase.total_amount_minor > policy.per_transaction_limit_minor:
            pattern_status = "fail"
            pattern_issues.append(
                f"request of {money(purchase.total_amount_minor, currency)} exceeds the per-transaction limit of {money(policy.per_transaction_limit_minor, currency)}"
            )
        since = utcnow() - timedelta(hours=24)
        recent_count = int(
            db.scalar(
                select(func.count())
                .select_from(PurchaseRequest)
                .where(
                    PurchaseRequest.organisation_id == purchase.organisation_id,
                    PurchaseRequest.id != purchase.id,
                    PurchaseRequest.created_at >= since,
                    PurchaseRequest.status.notin_(("draft", "cancelled")),
                )
            )
            or 0
        )
        if recent_count >= 6:
            if pattern_status != "fail":
                pattern_status = "review"
            pattern_issues.append(f"{recent_count} requests were submitted by this organisation in the last 24 hours")

        recent_same_category = db.scalars(
            select(PurchaseRequest).where(
                PurchaseRequest.project_id == purchase.project_id,
                PurchaseRequest.id != purchase.id,
                PurchaseRequest.created_at >= since,
                func.lower(PurchaseRequest.category) == normalize(purchase.category),
                PurchaseRequest.status.notin_(("blocked", "cancelled", "draft")),
            )
        ).all()
        if recent_same_category:
            combined = sum(p.total_amount_minor for p in recent_same_category) + purchase.total_amount_minor
            each_small = all(p.total_amount_minor < policy.per_transaction_limit_minor for p in recent_same_category)
            if (
                combined > policy.per_transaction_limit_minor
                and each_small
                and purchase.total_amount_minor < policy.per_transaction_limit_minor
            ):
                if pattern_status != "fail":
                    pattern_status = "review"
                pattern_issues.append(
                    f"possible purchase splitting: {len(recent_same_category)} recent '{canonical_category or purchase.category}' requests total {money(combined, currency)}"
                )
    if pattern_status == "pass":
        checks.append(
            _check(
                "transaction_patterns",
                "Transaction patterns",
                "pass",
                "Within the per-transaction limit; no unusual velocity or splitting patterns detected in the last 24 hours.",
            )
        )
    else:
        checks.append(
            _check(
                "transaction_patterns",
                "Transaction patterns",
                pattern_status,
                ("Pattern flag: " + "; ".join(pattern_issues) + ".") if pattern_issues else "Unusual pattern detected.",
            )
        )

    fails = [c for c in checks if c["status"] == "fail"]
    pendings = [c for c in checks if c["status"] == "pending"]
    reviews = [c for c in checks if c["status"] == "review"]

    if fails:
        outcome = "blocked"
        reason = "Blocked by deterministic policy engine: " + " ".join(c["detail"] for c in fails)
    elif pendings:
        outcome = "pending"
        reason = "Required information is missing: " + " ".join(c["detail"] for c in pendings)
    elif reviews:
        outcome = "review_required"
        reason = "Human review required: " + " ".join(c["detail"] for c in reviews)
    else:
        outcome = "approved"
        policy_text = f"policy v{policy.version}" if policy else "the approved policy"
        reason = (
            f"Approved under {policy_text}: the category is permitted, the vendor is verified, the payout "
            f"destination matches, the category budget and restricted balance are sufficient, and no duplicate "
            f"or unusual pattern was detected. Reserved {money(purchase.total_amount_minor, currency)} from the project's restricted funds."
        )

    return EngineResult(outcome=outcome, reason=reason, checks=checks, policy=policy)


def reserve_funds(db: Session, purchase: PurchaseRequest) -> FundAllocation:
    existing = db.scalar(
        select(FundAllocation).where(FundAllocation.purchase_request_id == purchase.id)
    )
    if existing:
        return existing
    allocation = FundAllocation(
        project_id=purchase.project_id,
        purchase_request_id=purchase.id,
        amount_minor=purchase.total_amount_minor,
        currency=purchase.currency,
        status="reserved",
    )
    db.add(allocation)
    db.flush()
    ledger.record_event(
        db,
        project_id=purchase.project_id,
        event_type=ledger.FUNDS_RESERVED,
        amount_minor=-purchase.total_amount_minor,
        reference=f"AUTH-{purchase.id}",
        description=f"Reserved restricted funds for purchase request #{purchase.id}",
        currency=purchase.currency,
        purchase_request_id=purchase.id,
        idempotency_key=f"reserve:pr:{purchase.id}",
        meta={"allocation_id": allocation.id, "category": purchase.category},
    )
    return allocation


def record_engine_decision(
    db: Session,
    purchase: PurchaseRequest,
    result: EngineResult,
    actor,
) -> TransactionAuthorization:
    purchase.status = STATUS_MAP[result.outcome]
    purchase.submitted_at = purchase.submitted_at or utcnow()
    authorization = TransactionAuthorization(
        purchase_request_id=purchase.id,
        outcome=result.outcome,
        reason=result.reason,
        checks=result.checks,
        policy_id=result.policy.id if result.policy else None,
        policy_version=result.policy.version if result.policy else None,
        decided_by="engine",
    )
    db.add(authorization)
    db.flush()
    if result.outcome == "approved":
        reserve_funds(db, purchase)
    audit(
        db,
        action=f"purchase.{result.outcome}",
        entity_type="purchase_request",
        entity_id=purchase.id,
        actor=actor,
        after={
            "amount_minor": purchase.total_amount_minor,
            "currency": purchase.currency,
            "outcome": result.outcome,
            "reason": result.reason,
            "policy_version": authorization.policy_version,
        },
    )
    return authorization


def reviewer_decide(
    db: Session,
    purchase: PurchaseRequest,
    reviewer,
    decision: str,
    notes: str,
) -> TransactionAuthorization:
    if purchase.status != "review_required":
        raise ValueError("Only purchase requests in review_required status can be reviewed by an administrator.")

    if decision == "approve":
        result = evaluate(db, purchase)
        blocking = [
            c
            for c in result.checks
            if (c["key"] in HARD_CHECK_KEYS and c["status"] in ("fail", "pending"))
            or (c["key"] == "transaction_patterns" and c["status"] == "fail")
            or (c["key"] == "spending_policy" and c["status"] != "pass")
        ]
        if blocking:
            raise ReviewBlocked(
                "This request cannot be authorised even as an exception: "
                + " ".join(c["detail"] for c in blocking),
                result.checks,
            )
        if result.policy is None:
            raise ReviewBlocked("No approved spending policy exists for this project.", result.checks)

        purchase.status = "authorised"
        authorization = TransactionAuthorization(
            purchase_request_id=purchase.id,
            outcome="approved",
            reason=(
                f"Approved by administrator #{reviewer.id} as a logged policy exception after human review. "
                f"Reviewer notes: {notes}"
            ),
            checks=result.checks,
            policy_id=result.policy.id,
            policy_version=result.policy.version,
            decided_by="reviewer",
            reviewer_id=reviewer.id,
        )
        db.add(authorization)
        db.flush()
        reserve_funds(db, purchase)
    else:
        purchase.status = "blocked"
        authorization = TransactionAuthorization(
            purchase_request_id=purchase.id,
            outcome="blocked",
            reason=f"Rejected by administrator #{reviewer.id} after human review. Reviewer notes: {notes}",
            checks=[],
            decided_by="reviewer",
            reviewer_id=reviewer.id,
        )
        db.add(authorization)
        db.flush()

    db.add(
        ReviewDecision(
            purchase_request_id=purchase.id,
            reviewer_id=reviewer.id,
            decision="approved" if decision == "approve" else "rejected",
            notes=notes,
        )
    )
    db.flush()
    audit(
        db,
        action="purchase.review_approved" if decision == "approve" else "purchase.review_rejected",
        entity_type="purchase_request",
        entity_id=purchase.id,
        actor=reviewer,
        before={"status": "review_required"},
        after={"status": purchase.status, "notes": notes, "amount_minor": purchase.total_amount_minor},
    )
    return authorization
