import pytest
from sqlalchemy import func, select

from app.models import FundAllocation, LedgerEvent, Payment, PurchaseRequest, ReviewDecision
from app.services import authorization, ledger, payments
from helpers import make_purchase, make_world


def submit(db, world, **kwargs):
    purchase = make_purchase(db, world, **kwargs)
    result = authorization.evaluate(db, purchase)
    authorization.record_engine_decision(db, purchase, result, world["org_user"])
    db.commit()
    return purchase, result


def check(result, key):
    return next(c for c in result.checks if c["key"] == key)


def test_approved_purchase_reserves_funds_and_settles_once(db_session):
    world = make_world(db_session)
    purchase, result = submit(
        db_session,
        world,
        category="Drinking water",
        description="Drinking water for affected families",
        unit_price_minor=200_000,
    )
    assert result.outcome == "approved"
    assert purchase.status == "authorised"
    totals = ledger.project_totals(db_session, world["project"].id)
    assert totals == {
        "received_minor": 1_000_000,
        "paid_minor": 0,
        "reserved_minor": 200_000,
        "available_minor": 800_000,
    }

    payment = payments.settle_simulated_payment(db_session, purchase, "idem-key-0001", world["org_user"])
    db_session.commit()
    assert payment.status == "settled"
    assert purchase.status == "paid"
    totals = ledger.project_totals(db_session, world["project"].id)
    assert totals == {
        "received_minor": 1_000_000,
        "paid_minor": 200_000,
        "reserved_minor": 0,
        "available_minor": 800_000,
    }

    again = payments.settle_simulated_payment(db_session, purchase, "idem-key-0001", world["org_user"])
    different_key = payments.settle_simulated_payment(db_session, purchase, "idem-key-0002", world["org_user"])
    db_session.commit()
    assert again.id == payment.id == different_key.id
    assert db_session.scalar(select(func.count()).select_from(Payment)) == 1
    assert (
        db_session.scalar(
            select(func.count()).select_from(LedgerEvent).where(LedgerEvent.purchase_request_id == purchase.id)
        )
        == 3  # reservation + release + payment
    )
    assert ledger.project_totals(db_session, world["project"].id)["available_minor"] == 800_000


def test_blocked_category_cannot_be_approved_by_ai(db_session):
    world = make_world(db_session)
    purchase = make_purchase(
        db_session,
        world,
        category="Personal electronics",
        description="Personal entertainment tablets",
        unit_price_minor=200_000,
    )
    result = authorization.evaluate(
        db_session,
        purchase,
        ai_available=True,
        ai_output={"verdict": "clearly_relevant", "confidence": 0.99, "reasoning": "AI says it is fine"},
    )
    assert result.outcome == "blocked"
    assert check(result, "category_permitted")["status"] == "fail"
    assert "not an approved spending category" in result.reason


def test_operational_category_requires_human_review(db_session):
    world = make_world(db_session)
    _, result = submit(
        db_session,
        world,
        category="Communications equipment",
        description="Temporary communications equipment",
        unit_price_minor=150_000,
    )
    assert result.outcome == "review_required"
    assert check(result, "category_permitted")["status"] == "review"
    assert check(result, "category_budget")["status"] == "skipped"


def test_ai_ambiguity_escalates_but_ai_cannot_approve(db_session):
    world = make_world(db_session)
    purchase = make_purchase(
        db_session,
        world,
        category="Drinking water",
        description="Water purification supplies",
        unit_price_minor=100_000,
    )
    result = authorization.evaluate(
        db_session,
        purchase,
        ai_available=True,
        ai_output={"verdict": "ambiguous", "confidence": 0.4, "reasoning": "Unclear from description"},
    )
    assert result.outcome == "review_required"
    assert check(result, "purchase_relevance")["status"] == "review"


def test_category_budget_is_enforced(db_session):
    world = make_world(db_session)
    _, result = submit(
        db_session,
        world,
        category="Drinking water",
        description="Bulk water tanks",
        quantity=4,
        unit_price_minor=100_000,
    )
    assert result.outcome == "blocked"
    assert check(result, "category_budget")["status"] == "fail"


def test_insufficient_restricted_funds_blocks(db_session):
    world = make_world(db_session, donation_minor=100_000)
    _, result = submit(
        db_session,
        world,
        category="Drinking water",
        description="Water for one camp",
        unit_price_minor=200_000,
    )
    assert result.outcome == "blocked"
    assert check(result, "restricted_funding")["status"] == "fail"
    assert "Insufficient restricted funds" in result.reason


def test_payment_destination_mismatch_blocks(db_session):
    world = make_world(db_session)
    _, result = submit(
        db_session,
        world,
        category="Drinking water",
        description="Water delivery",
        unit_price_minor=100_000,
        payment_destination="INV-ATTACKER-999",
    )
    assert result.outcome == "blocked"
    assert check(result, "payment_destination")["status"] == "fail"


def test_duplicate_purchase_blocks(db_session):
    world = make_world(db_session)
    first, first_result = submit(
        db_session,
        world,
        category="Food supplies",
        description="Food rations for 300 people",
        unit_price_minor=200_000,
        quotation_reference="QUO-DUP-1",
    )
    assert first_result.outcome == "approved"
    second, second_result = submit(
        db_session,
        world,
        category="Food supplies",
        description="Food rations for 300 people",
        unit_price_minor=200_000,
        quotation_reference="QUO-DUP-2",
    )
    assert second_result.outcome == "blocked"
    assert check(second_result, "duplicate_purchase")["status"] == "fail"
    assert first.id != second.id


def test_reused_quotation_blocks(db_session):
    world = make_world(db_session)
    submit(
        db_session,
        world,
        category="Food supplies",
        description="First food order",
        unit_price_minor=100_000,
        quotation_reference="QUO-REUSE-1",
    )
    _, result = submit(
        db_session,
        world,
        category="Medical supplies",
        description="Medical kits",
        unit_price_minor=100_000,
        quotation_reference="QUO-REUSE-1",
    )
    assert result.outcome == "blocked"
    assert "Quotation reference" in check(result, "duplicate_purchase")["detail"]


def test_reviewer_approval_reserves_funds_and_is_audited(db_session):
    world = make_world(db_session)
    purchase, result = submit(
        db_session,
        world,
        category="Communications equipment",
        description="Field communications handset",
        unit_price_minor=150_000,
    )
    assert result.outcome == "review_required"

    authorization.reviewer_decide(
        db_session,
        purchase,
        world["admin"],
        "approve",
        "Eligibility confirmed by procurement lead for field coordination.",
    )
    db_session.commit()
    assert purchase.status == "authorised"
    allocation = db_session.scalar(
        select(FundAllocation).where(FundAllocation.purchase_request_id == purchase.id)
    )
    assert allocation.status == "reserved"
    assert db_session.scalar(select(func.count()).select_from(ReviewDecision)) == 1
    assert ledger.project_totals(db_session, world["project"].id)["reserved_minor"] == 150_000


def test_reviewer_rejection_blocks(db_session):
    world = make_world(db_session)
    purchase, _ = submit(
        db_session,
        world,
        category="Communications equipment",
        description="Satellite handset",
        quantity=2,
        unit_price_minor=100_000,
    )
    authorization.reviewer_decide(db_session, purchase, world["admin"], "reject", "Not required for this project phase.")
    db_session.commit()
    assert purchase.status == "blocked"
    assert ledger.project_totals(db_session, world["project"].id)["reserved_minor"] == 0


def test_reviewer_cannot_approve_when_funds_are_gone(db_session):
    world = make_world(db_session, donation_minor=200_000)
    purchase, result = submit(
        db_session,
        world,
        category="Communications equipment",
        description="Field radio equipment",
        unit_price_minor=150_000,
    )
    assert result.outcome == "review_required"

    other, other_result = submit(
        db_session,
        world,
        category="Drinking water",
        description="Water for the same camp",
        unit_price_minor=100_000,
        quotation_reference="QUO-DRAIN-1",
    )
    assert other_result.outcome == "approved"
    assert ledger.project_totals(db_session, world["project"].id)["available_minor"] == 100_000

    with pytest.raises(authorization.ReviewBlocked):
        authorization.reviewer_decide(
            db_session,
            purchase,
            world["admin"],
            "approve",
            "Attempted approval after funds were committed elsewhere.",
        )
    db_session.rollback()


def test_cannot_review_a_non_escalated_purchase(db_session):
    world = make_world(db_session)
    purchase, result = submit(
        db_session,
        world,
        category="Drinking water",
        description="Water",
        unit_price_minor=100_000,
    )
    assert result.outcome == "approved"
    with pytest.raises(ValueError):
        authorization.reviewer_decide(db_session, purchase, world["admin"], "approve", "Should not be allowed.")
