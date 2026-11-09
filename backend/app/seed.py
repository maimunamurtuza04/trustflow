"""Seed the TrustFlow demo scenario.

Usage (from backend/, with the venv active):
    python -m app.seed            # create the demo dataset if the database is empty
    python -m app.seed --reset    # DESTRUCTIVE: drop all tables and recreate the demo dataset
"""

import argparse
from datetime import date, timedelta

from sqlalchemy import select

from app.database import SessionLocal, engine
from app.models import (
    Base,
    Donation,
    Organisation,
    Project,
    ProjectBudget,
    ProjectPolicy,
    PurchaseRequest,
    Quotation,
    User,
    Vendor,
    VendorProduct,
    utcnow,
)
from app.security import hash_password
from app.serializers import project_payload
from app.services import authorization, delivery, ledger, payments
from app.services import ai as ai_service
from app.services.audit import audit

APPROVED_CATEGORIES = [
    "Food supplies",
    "Drinking water",
    "Medical supplies",
    "Blankets",
    "Transportation",
    "Rescue equipment",
]

BUDGETS = [
    {"category": "Food supplies", "allocated_minor": 400_000},
    {"category": "Drinking water", "allocated_minor": 300_000},
    {"category": "Medical supplies", "allocated_minor": 150_000},
    {"category": "Blankets", "allocated_minor": 100_000},
    {"category": "Transportation", "allocated_minor": 50_000},
]


def _user(db, *, email: str, password: str, full_name: str, role: str) -> User:
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        role=role,
    )
    db.add(user)
    db.flush()
    audit(db, action="seed.user_created", entity_type="user", entity_id=user.id, actor_role="system")
    return user


def _submit(db, project, org_user, vendor, *, category, description, quantity, unit_price, quotation_reference):
    purchase = PurchaseRequest(
        project_id=project.id,
        organisation_id=project.organisation_id,
        created_by=org_user.id,
        vendor_id=vendor.id,
        category=category,
        description=description,
        quantity=quantity,
        unit_price_minor=unit_price,
        total_amount_minor=quantity * unit_price,
        currency=project.currency,
        quotation_reference=quotation_reference,
        payment_destination=vendor.payment_destination_ref,
        status="draft",
        submitted_at=utcnow(),
    )
    db.add(purchase)
    db.flush()
    db.add(
        Quotation(
            purchase_request_id=purchase.id,
            vendor_id=vendor.id,
            reference=quotation_reference,
            amount_minor=purchase.total_amount_minor,
            currency=project.currency,
            source="vendor_portal",
        )
    )
    db.flush()
    ai_service.persist_assessment(
        db,
        ai_service.unavailable(
            "purchase_relevance",
            detail=(
                "Seed dataset: no AI provider was called. The deterministic policy decision stored for this "
                "request is authoritative; AI is advisory only."
            ),
        ),
        purchase_request_id=purchase.id,
        project_id=project.id,
    )
    result = authorization.evaluate(db, purchase)
    authorization.record_engine_decision(db, purchase, result, org_user)
    return purchase, result


def seed(reset: bool = False) -> None:
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        if db.scalar(select(User).limit(1)) is not None:
            print("Database already contains users. Re-run with --reset to rebuild the demo dataset.")
            return

        admin = _user(
            db,
            email="admin@trustflow.demo",
            password="Admin123!",
            full_name="Platform Administrator",
            role="admin",
        )
        org_user = _user(
            db,
            email="org@reliefa.demo",
            password="Demo1234!",
            full_name="Priya Sharma",
            role="organisation",
        )
        donor_a = _user(
            db, email="donor@trustflow.demo", password="Demo1234!", full_name="Asha Kumar", role="donor"
        )
        donor_b = _user(
            db, email="donor2@trustflow.demo", password="Demo1234!", full_name="Rahul Mehta", role="donor"
        )
        vendor_user = _user(
            db, email="vendor@aqua.demo", password="Demo1234!", full_name="Ravi Menon", role="vendor"
        )

        organisation = Organisation(
            user_id=org_user.id,
            name="Relief Organisation A",
            registration_number="REG-2026-001",
            country="India",
            verification_status="verified",
            verification_notes="Registration documents and governance records reviewed.",
        )
        db.add(organisation)
        db.flush()
        audit(
            db,
            action="organisation.verified",
            entity_type="organisation",
            entity_id=organisation.id,
            actor=admin,
            after={"verification_status": "verified"},
        )

        vendor = Vendor(
            user_id=vendor_user.id,
            business_name="AquaPure Supplies",
            registration_number="VEN-2026-4417",
            country="India",
            categories=[
                *APPROVED_CATEGORIES,
                "Communications equipment",
                "Personal electronics",
            ],
            verification_status="verified",
            payment_destination_verified=True,
            payment_destination_ref="INV-AQUA-4417",
            complaint_count=1,
        )
        db.add(vendor)
        db.flush()
        audit(
            db,
            action="vendor.verified",
            entity_type="vendor",
            entity_id=vendor.id,
            actor=admin,
            after={
                "verification_status": "verified",
                "payment_destination_ref": vendor.payment_destination_ref,
                "payment_destination_verified": True,
            },
        )

        products = [
            ("20L drinking water case", "Drinking water", "Sealed 20-litre drinking water cases.", 30_000),
            ("Family food ration kit", "Food supplies", "Rice, lentils, oil and dry rations for one family for a week.", 100_000),
            ("Basic medical kit", "Medical supplies", "First-aid and primary care supplies for a relief camp.", 75_000),
            ("Thermal blanket", "Blankets", "Insulated blanket for temporary shelter.", 50_000),
            ("Rescue rope kit", "Rescue equipment", "Rope, harness and floatation equipment for rescue teams.", 250_000),
            ("Portable radio handset", "Communications equipment", "Short-range handset for field coordination.", 150_000),
            ("Personal tablet", "Personal electronics", "Consumer tablet device.", 200_000),
        ]
        for name, category, description, price in products:
            db.add(
                VendorProduct(
                    vendor_id=vendor.id,
                    name=name,
                    category=category,
                    description=description,
                    unit_price_minor=price,
                    currency="INR",
                )
            )
        db.flush()

        project = Project(
            organisation_id=organisation.id,
            name="Flood Relief 2026",
            description=(
                "Provide emergency assistance to 300 people affected by flooding in Assam, including drinking water, "
                "food, medical supplies, blankets, rescue equipment and transport of relief materials."
            ),
            category="Flood relief",
            target_beneficiaries=300,
            geographic_coverage="Assam, India",
            funding_target_minor=1_000_000,
            currency="INR",
            starts_on=date.today() - timedelta(days=30),
            ends_on=date.today() + timedelta(days=90),
            status="active",
            verification_status="verified",
            operational_requirements=(
                "Field staff require transport and short-range communications for distribution coordination."
            ),
        )
        db.add(project)
        db.flush()
        audit(
            db,
            action="project.created",
            entity_type="project",
            entity_id=project.id,
            actor=org_user,
            after={"name": project.name, "status": project.status},
        )

        policy = ProjectPolicy(
            project_id=project.id,
            version=1,
            status="approved",
            approved_categories=APPROVED_CATEGORIES,
            budget_lines=BUDGETS,
            per_transaction_limit_minor=500_000,
            notes="Flood response procurement policy. Communication equipment requires human review.",
            created_by=org_user.id,
            approved_by=admin.id,
            approved_at=utcnow(),
        )
        db.add(policy)
        db.flush()
        for line in BUDGETS:
            db.add(
                ProjectBudget(
                    project_id=project.id,
                    category=line["category"],
                    allocated_minor=line["allocated_minor"],
                    currency=project.currency,
                )
            )
        db.flush()
        audit(
            db,
            action="policy.draft_created",
            entity_type="project_policy",
            entity_id=policy.id,
            actor=org_user,
            after={"version": 1, "status": "draft"},
        )
        audit(
            db,
            action="policy.approved",
            entity_type="project_policy",
            entity_id=policy.id,
            actor=admin,
            before={"version": 1, "status": "draft"},
            after={
                "version": 1,
                "status": "approved",
                "approved_categories": APPROVED_CATEGORIES,
                "budget_lines": BUDGETS,
                "per_transaction_limit_minor": policy.per_transaction_limit_minor,
                "note": "Policy versions are immutable. Changes are recorded as new approved versions.",
            },
        )

        donations = [
            (donor_a, 600_000, "SIMDON-SEED-0001"),
            (donor_b, 400_000, "SIMDON-SEED-0002"),
        ]
        for index, (donor, amount, reference) in enumerate(donations, start=1):
            donation = Donation(
                donor_id=donor.id,
                project_id=project.id,
                amount_minor=amount,
                currency=project.currency,
                provider="simulated",
                payment_reference=reference,
                payment_status="confirmed",
                simulated=True,
                confirmation_key=f"seed-confirm-{index}",
                confirmed_at=utcnow() - timedelta(days=2, hours=index),
                created_at=utcnow() - timedelta(days=2, hours=index),
            )
            db.add(donation)
            db.flush()
            ledger.record_event(
                db,
                project_id=project.id,
                event_type=ledger.DONATION_CONFIRMED,
                amount_minor=amount,
                reference=reference,
                description=f"Simulated donation confirmed ({donor.full_name})",
                currency=project.currency,
                donation_id=donation.id,
                idempotency_key=f"donation-confirmed:{donation.id}",
                meta={"simulated": True, "provider": "simulated"},
            )
            audit(
                db,
                action="donation.confirmed",
                entity_type="donation",
                entity_id=donation.id,
                actor=donor,
                after={"amount_minor": amount, "reference": reference, "simulated": True},
            )
        db.flush()

        # CASE 1: approved then settled to the verified vendor.
        case1, _ = _submit(
            db,
            project,
            org_user,
            vendor,
            category="Drinking water",
            description="Drinking water for 300 flood-affected people",
            quantity=10,
            unit_price=30_000,
            quotation_reference="QUO-WATER-001",
        )
        payments.settle_simulated_payment(db, case1, "seed-payment-case1", org_user)
        delivery.submit_vendor_report(
            db,
            case1,
            vendor_user,
            dispatch_reference="LR-AQUA-1001",
            dispatched_at=utcnow() - timedelta(hours=8),
            delivered_at=utcnow() - timedelta(hours=2),
            notes="10 cases of 20L water delivered to the Ernakulam relief warehouse.",
        )
        delivery.record_receipt(
            db,
            case1,
            org_user,
            decision="confirmed",
            notes="All 10 cases received in good condition and counted at the warehouse.",
            quantity_received=10,
        )

        # CASE 2: approved, awaiting payment.
        _submit(
            db,
            project,
            org_user,
            vendor,
            category="Food supplies",
            description="Emergency food supplies for 300 people",
            quantity=2,
            unit_price=100_000,
            quotation_reference="QUO-FOOD-002",
        )

        # CASE 3: blocked because the category is outside the approved policy.
        _submit(
            db,
            project,
            org_user,
            vendor,
            category="Personal electronics",
            description="Personal entertainment tablets",
            quantity=1,
            unit_price=200_000,
            quotation_reference="QUO-ELEC-003",
        )

        # CASE 4: ambiguous operational purchase requiring human review.
        _submit(
            db,
            project,
            org_user,
            vendor,
            category="Communications equipment",
            description="Temporary communications equipment for field coordination",
            quantity=1,
            unit_price=150_000,
            quotation_reference="QUO-COMMS-004",
        )

        db.commit()
        financials = project_payload(db, project)["financials"]

        print("TrustFlow demo dataset created.")
        print("")
        print("  Admin     admin@trustflow.demo / Admin123!")
        print("  Org       org@reliefa.demo / Demo1234!")
        print("  Donor     donor@trustflow.demo / Demo1234!")
        print("  Donor 2   donor2@trustflow.demo / Demo1234!")
        print("  Vendor    vendor@aqua.demo / Demo1234!")
        print("")
        print("  Project   Flood Relief 2026 (Restricted INR pool)")
        print(
            "  Balances  received=%s paid=%s reserved=%s available=%s"
            % (
                financials["received_minor"],
                financials["paid_minor"],
                financials["reserved_minor"],
                financials["available_minor"],
            )
        )
        print("  Cases     1 approved+paid, 2 approved+reserved, 3 blocked, 4 review required")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed TrustFlow demo data")
    parser.add_argument("--reset", action="store_true", help="Drop all tables before seeding (destructive)")
    args = parser.parse_args()
    seed(reset=args.reset)
