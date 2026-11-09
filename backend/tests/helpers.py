from datetime import date, timedelta

from app.models import (
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
from app.services import ledger

PASSWORD = "Demo1234!"
DESTINATION = "INV-TEST-001"

CATEGORIES = [
    "Food supplies",
    "Drinking water",
    "Medical supplies",
    "Blankets",
    "Transportation",
    "Rescue equipment",
]

DEFAULT_BUDGETS = {
    "Food supplies": 400_000,
    "Drinking water": 300_000,
    "Medical supplies": 150_000,
    "Blankets": 100_000,
    "Transportation": 50_000,
}


def make_user(db, *, email: str, role: str, name: str) -> User:
    user = User(email=email, password_hash=hash_password(PASSWORD), full_name=name, role=role)
    db.add(user)
    db.flush()
    return user


def make_world(
    db,
    *,
    donation_minor: int = 1_000_000,
    budgets: dict[str, int] | None = None,
    per_transaction_limit_minor: int | None = 500_000,
    categories: list[str] | None = None,
):
    admin = make_user(db, email="admin@testadmin.io", role="admin", name="Test Admin")
    org_user = make_user(db, email="org@testorg.io", role="organisation", name="Test Org User")
    vendor_user = make_user(db, email="vendor@testvendor.io", role="vendor", name="Test Vendor User")
    donor = make_user(db, email="donor@testdonor.io", role="donor", name="Test Donor")

    organisation = Organisation(
        user_id=org_user.id,
        name="Test Relief Org",
        registration_number="REG-TEST-1",
        verification_status="verified",
    )
    db.add(organisation)
    db.flush()

    vendor = Vendor(
        user_id=vendor_user.id,
        business_name="Test Supplies",
        registration_number="VEN-TEST-1",
        verification_status="verified",
        categories=[*(categories or CATEGORIES), "Communications equipment", "Personal electronics"],
        payment_destination_verified=True,
        payment_destination_ref=DESTINATION,
    )
    db.add(vendor)
    db.flush()
    for name, category, price in (
        ("Water case", "Drinking water", 30_000),
        ("Food kit", "Food supplies", 100_000),
        ("Medical kit", "Medical supplies", 75_000),
        ("Radio", "Communications equipment", 150_000),
        ("Tablet", "Personal electronics", 200_000),
    ):
        db.add(VendorProduct(vendor_id=vendor.id, name=name, category=category, unit_price_minor=price))
    db.flush()

    project = Project(
        organisation_id=organisation.id,
        name="Test Flood Relief",
        description="Provide emergency assistance to 300 people affected by flooding.",
        category="Flood relief",
        target_beneficiaries=300,
        geographic_coverage="Test Region",
        funding_target_minor=1_000_000,
        currency="INR",
        starts_on=date.today() - timedelta(days=5),
        ends_on=date.today() + timedelta(days=60),
        status="active",
        verification_status="verified",
    )
    db.add(project)
    db.flush()

    lines = budgets if budgets is not None else DEFAULT_BUDGETS
    policy = ProjectPolicy(
        project_id=project.id,
        version=1,
        status="approved",
        approved_categories=categories or CATEGORIES,
        budget_lines=[{"category": c, "allocated_minor": a} for c, a in lines.items()],
        per_transaction_limit_minor=per_transaction_limit_minor or 0,
        created_by=org_user.id,
        approved_by=admin.id,
        approved_at=utcnow(),
    )
    db.add(policy)
    db.flush()
    for category, allocated in lines.items():
        db.add(ProjectBudget(project_id=project.id, category=category, allocated_minor=allocated))
    db.flush()

    donation = Donation(
        donor_id=donor.id,
        project_id=project.id,
        amount_minor=donation_minor,
        currency="INR",
        provider="simulated",
        payment_reference="SIMDON-TEST-1",
        payment_status="confirmed",
        simulated=True,
        confirmation_key="test-confirm-1",
        confirmed_at=utcnow(),
    )
    db.add(donation)
    db.flush()
    ledger.record_event(
        db,
        project_id=project.id,
        event_type=ledger.DONATION_CONFIRMED,
        amount_minor=donation_minor,
        reference=donation.payment_reference,
        description="Test donation",
        donation_id=donation.id,
        idempotency_key=f"donation-confirmed:{donation.id}",
    )
    db.commit()

    return {
        "admin": admin,
        "org_user": org_user,
        "vendor_user": vendor_user,
        "donor": donor,
        "organisation": organisation,
        "vendor": vendor,
        "project": project,
        "policy": policy,
        "donation": donation,
    }


def make_purchase(
    db,
    world,
    *,
    category: str,
    description: str,
    quantity: int = 1,
    unit_price_minor: int = 200_000,
    quotation_reference: str | None = None,
    payment_destination: str | None = None,
    vendor=None,
) -> PurchaseRequest:
    vendor = vendor or world["vendor"]
    quote = quotation_reference or f"QUO-{db.query(PurchaseRequest).count() + 1}-{abs(hash(description)) % 10000}"
    purchase = PurchaseRequest(
        project_id=world["project"].id,
        organisation_id=world["organisation"].id,
        created_by=world["org_user"].id,
        vendor_id=vendor.id,
        category=category,
        description=description,
        quantity=quantity,
        unit_price_minor=unit_price_minor,
        total_amount_minor=quantity * unit_price_minor,
        currency="INR",
        quotation_reference=quote,
        payment_destination=payment_destination if payment_destination is not None else vendor.payment_destination_ref,
        status="draft",
        submitted_at=utcnow(),
    )
    db.add(purchase)
    db.flush()
    db.add(
        Quotation(
            purchase_request_id=purchase.id,
            vendor_id=vendor.id,
            reference=quote,
            amount_minor=purchase.total_amount_minor,
        )
    )
    db.flush()
    return purchase


def auth_headers(client, email: str, password: str = PASSWORD) -> dict:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


PROJECT_PAYLOAD = {
    "name": "New Flood Response",
    "description": "Provide emergency shelter and food to displaced families in the district.",
    "category": "Flood relief",
    "target_beneficiaries": 150,
    "geographic_coverage": "Test District",
    "funding_target_minor": 2_000_000,
    "currency": "INR",
    "approved_categories": ["Food supplies", "Drinking water", "Transportation"],
    "per_transaction_limit_minor": 500_000,
    "budgets": [
        {"category": "Food supplies", "allocated_minor": 800_000},
        {"category": "Drinking water", "allocated_minor": 600_000},
        {"category": "Transportation", "allocated_minor": 600_000},
    ],
}
