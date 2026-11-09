from sqlalchemy import func, select

from app.models import Donation, LedgerEvent, Payment, ProjectPolicy, Vendor
from helpers import (
    DESTINATION,
    PASSWORD,
    PROJECT_PAYLOAD,
    auth_headers,
    make_user,
    make_world,
)


def purchase_body(world, *, category, description, quantity, unit_price_minor, quotation_reference, destination=None):
    return {
        "project_id": world["project"].id,
        "vendor_id": world["vendor"].id,
        "category": category,
        "description": description,
        "quantity": quantity,
        "unit_price_minor": unit_price_minor,
        "quotation_reference": quotation_reference,
        "payment_destination": destination if destination is not None else DESTINATION,
    }


def test_registration_login_and_role_guards(client, db_session):
    registration = client.post(
        "/api/auth/register",
        json={
            "email": "newdonor@mailtest.io",
            "password": PASSWORD,
            "full_name": "New Donor",
            "role": "donor",
        },
    )
    assert registration.status_code == 201, registration.text
    token = registration.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.post("/api/projects", json=PROJECT_PAYLOAD, headers=headers).status_code == 403
    assert client.get("/api/admin/audit", headers=headers).status_code == 403
    assert client.get("/api/projects").status_code == 401

    duplicate = client.post(
        "/api/auth/register",
        json={
            "email": "newdonor@mailtest.io",
            "password": PASSWORD,
            "full_name": "New Donor",
            "role": "donor",
        },
    )
    assert duplicate.status_code == 409

    bad_login = client.post("/api/auth/login", json={"email": "newdonor@mailtest.io", "password": "wrongpass"})
    assert bad_login.status_code == 401


def test_project_lifecycle_and_policy_approval(client, db_session):
    admin = make_user(db_session, email="admin2@testadmin.io", role="admin", name="Admin Two")
    db_session.commit()

    org_registration = client.post(
        "/api/auth/register",
        json={
            "email": "lifecycle-org@lifecycle.io",
            "password": PASSWORD,
            "full_name": "Lifecycle Org User",
            "role": "organisation",
            "organisation_name": "Lifecycle Relief",
            "registration_number": "REG-LIFE-1",
        },
    )
    assert org_registration.status_code == 201, org_registration.text
    org_headers = {"Authorization": f"Bearer {org_registration.json()['access_token']}"}
    org_id = org_registration.json()["user"]["organisation"]["id"]
    admin_headers = auth_headers(client, admin.email)

    donor_registration = client.post(
        "/api/auth/register",
        json={
            "email": "lifecycle-donor@lifecycle.io",
            "password": PASSWORD,
            "full_name": "Lifecycle Donor",
            "role": "donor",
        },
    )
    assert donor_registration.status_code == 201
    donor_headers = {"Authorization": f"Bearer {donor_registration.json()['access_token']}"}

    created = client.post("/api/projects", json=PROJECT_PAYLOAD, headers=org_headers)
    assert created.status_code == 201, created.text
    project = created.json()
    assert project["status"] == "pending_approval"
    assert project["pending_policy"]["status"] == "draft"
    assert project["policy"] is None

    donation_attempt = client.post(
        "/api/donations", json={"project_id": project["id"], "amount_minor": 500_000}, headers=donor_headers
    )
    assert donation_attempt.status_code == 409

    assert client.post(
        f"/api/policies/{project['pending_policy']['id']}/approve", headers=org_headers
    ).status_code == 403

    verified = client.post(
        f"/api/admin/organisations/{org_id}/verify",
        json={"verification_status": "verified"},
        headers=admin_headers,
    )
    assert verified.status_code == 200

    approved = client.post(
        f"/api/policies/{project['pending_policy']['id']}/approve", headers=admin_headers
    )
    assert approved.status_code == 200, approved.text
    approved_project = approved.json()
    assert approved_project["status"] == "active"
    assert approved_project["policy"]["version"] == 1
    assert approved_project["pending_policy"] is None

    donation = client.post(
        "/api/donations", json={"project_id": project["id"], "amount_minor": 500_000}, headers=donor_headers
    )
    assert donation.status_code == 201, donation.text
    donation_id = donation.json()["donation"]["id"]
    confirmed = client.post(
        f"/api/donations/{donation_id}/confirm",
        json={"idempotency_key": "confirm-lifecycle-1"},
        headers=donor_headers,
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["donation"]["payment_status"] == "confirmed"
    assert confirmed.json()["project_financials"]["received_minor"] == 500_000

    repeat = client.post(
        f"/api/donations/{donation_id}/confirm",
        json={"idempotency_key": "confirm-lifecycle-1"},
        headers=donor_headers,
    )
    assert repeat.status_code == 200
    assert repeat.json()["idempotent"] is True
    assert db_session.scalar(
        select(func.count()).select_from(LedgerEvent).where(LedgerEvent.event_type == "DONATION_CONFIRMED")
    ) == 1


def test_demo_cases_end_to_end(client, db_session):
    world = make_world(db_session)
    org_headers = auth_headers(client, world["org_user"].email)
    admin_headers = auth_headers(client, world["admin"].email)
    donor_headers = auth_headers(client, world["donor"].email)
    vendor_headers = auth_headers(client, world["vendor_user"].email)

    case1 = client.post(
        "/api/purchase-requests",
        json=purchase_body(
            world,
            category="Drinking water",
            description="Drinking water for 300 flood-affected people",
            quantity=10,
            unit_price_minor=30_000,
            quotation_reference="API-WATER-001",
        ),
        headers=org_headers,
    )
    assert case1.status_code == 201, case1.text
    case1_data = case1.json()["purchase"]
    assert case1_data["status"] == "authorised"
    assert case1_data["decision"]["outcome"] == "approved"
    assert case1.json()["ai"]["available"] is False

    paid = client.post(
        f"/api/purchase-requests/{case1_data['id']}/pay",
        json={"idempotency_key": "api-pay-case1"},
        headers=org_headers,
    )
    assert paid.status_code == 200, paid.text
    assert paid.json()["purchase"]["status"] == "paid"
    assert paid.json()["payment"]["simulated"] is True

    case2 = client.post(
        "/api/purchase-requests",
        json=purchase_body(
            world,
            category="Food supplies",
            description="Emergency food supplies for 300 people",
            quantity=2,
            unit_price_minor=100_000,
            quotation_reference="API-FOOD-002",
        ),
        headers=org_headers,
    )
    assert case2.json()["purchase"]["status"] == "authorised"

    case3 = client.post(
        "/api/purchase-requests",
        json=purchase_body(
            world,
            category="Personal electronics",
            description="Personal entertainment tablets",
            quantity=1,
            unit_price_minor=200_000,
            quotation_reference="API-ELEC-003",
        ),
        headers=org_headers,
    )
    assert case3.json()["purchase"]["status"] == "blocked"

    case4 = client.post(
        "/api/purchase-requests",
        json=purchase_body(
            world,
            category="Communications equipment",
            description="Temporary communications equipment for field coordination",
            quantity=1,
            unit_price_minor=150_000,
            quotation_reference="API-COMMS-004",
        ),
        headers=org_headers,
    )
    assert case4.json()["purchase"]["status"] == "review_required"

    blocked_id = case3.json()["purchase"]["id"]
    paid_id = case1_data["id"]
    assert client.get(f"/api/purchase-requests/{blocked_id}", headers=donor_headers).status_code == 404
    assert client.get(f"/api/purchase-requests/{paid_id}", headers=donor_headers).status_code == 200
    assert client.get(f"/api/purchase-requests/{paid_id}", headers=vendor_headers).status_code == 200

    reviewed = client.post(
        f"/api/purchase-requests/{case4.json()['purchase']['id']}/review",
        json={"decision": "approve", "notes": "Field coordination need confirmed by the procurement lead."},
        headers=admin_headers,
    )
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["status"] == "authorised"
    assert "exception" in reviewed.json()["decision"]["reason"].lower()

    project = client.get(f"/api/projects/{world['project'].id}", headers=org_headers)
    assert project.status_code == 200
    financials = project.json()["financials"]
    assert financials["paid_minor"] == 300_000
    assert financials["reserved_minor"] == 350_000
    assert financials["available_minor"] == 350_000

    paid_case2 = client.post(
        f"/api/purchase-requests/{case2.json()['purchase']['id']}/pay",
        json={"idempotency_key": "api-pay-case2"},
        headers=org_headers,
    )
    assert paid_case2.status_code == 200
    repeat = client.post(
        f"/api/purchase-requests/{case2.json()['purchase']['id']}/pay",
        json={"idempotency_key": "api-pay-case2"},
        headers=org_headers,
    )
    assert repeat.status_code == 200
    assert repeat.json()["payment"]["id"] == paid_case2.json()["payment"]["id"]
    different = client.post(
        f"/api/purchase-requests/{case2.json()['purchase']['id']}/pay",
        json={"idempotency_key": "api-pay-case2-retry"},
        headers=org_headers,
    )
    assert different.json()["payment"]["id"] == paid_case2.json()["payment"]["id"]
    assert db_session.scalar(select(func.count()).select_from(Payment)) == 2
    financials = client.get(f"/api/projects/{world['project'].id}", headers=org_headers).json()["financials"]
    assert financials["paid_minor"] == 500_000
    assert financials["reserved_minor"] == 150_000
    assert financials["available_minor"] == 350_000

    duplicate = client.post(
        "/api/purchase-requests",
        json=purchase_body(
            world,
            category="Drinking water",
            description="Drinking water for 300 flood-affected people",
            quantity=10,
            unit_price_minor=30_000,
            quotation_reference="API-WATER-001",
        ),
        headers=org_headers,
    )
    assert duplicate.json()["purchase"]["status"] == "blocked"
    assert "duplicate" in duplicate.json()["purchase"]["decision"]["reason"].lower()

    mismatch = client.post(
        "/api/purchase-requests",
        json=purchase_body(
            world,
            category="Blankets",
            description="Blankets for temporary shelter",
            quantity=1,
            unit_price_minor=100_000,
            quotation_reference="API-BLANKET-005",
            destination="INV-ATTACKER-999",
        ),
        headers=org_headers,
    )
    assert mismatch.json()["purchase"]["status"] == "blocked"

    explanation = client.post(
        f"/api/purchase-requests/{paid_id}/ai-explanation", headers=org_headers
    )
    assert explanation.status_code == 200
    assert explanation.json()["available"] is False
    assert explanation.json()["explanation"] is None
    assert "No AI provider" in explanation.json()["detail"]

    audit = client.get("/api/admin/audit?limit=200", headers=admin_headers)
    assert audit.status_code == 200
    actions = {item["action"] for item in audit.json()["items"]}
    assert "purchase.review_approved" in actions
    assert "payment.settled" in actions
    assert audit.json()["append_only"].startswith("Audit events are immutable")

    assert client.get("/api/admin/audit", headers=donor_headers).status_code == 403
    assert client.get("/api/purchase-requests", headers=donor_headers).json()[0]["status"] in ("paid", "authorised")
    vendor_orders = client.get("/api/purchase-requests", headers=vendor_headers).json()
    assert len(vendor_orders) >= 5


def test_ai_endpoint_is_honest_when_unconfigured(client, db_session):
    world = make_world(db_session)
    headers = auth_headers(client, world["org_user"].email)
    response = client.post(
        "/api/ai/project-requirements",
        json={
            "description": "Provide emergency water and food to 300 people affected by flooding.",
            "project_category": "Flood relief",
            "target_beneficiaries": 300,
            "budget_minor": 1_000_000,
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["available"] is False
    assert body["authoritative"] is False
    assert body["output"] == {}
    assert "No AI provider" in body["detail"]


def test_policy_changes_need_a_new_approved_version(client, db_session):
    world = make_world(db_session)
    org_headers = auth_headers(client, world["org_user"].email)
    admin_headers = auth_headers(client, world["admin"].email)

    before = client.post(
        "/api/purchase-requests",
        json=purchase_body(
            world,
            category="Drinking water",
            description="Water before policy change",
            quantity=1,
            unit_price_minor=100_000,
            quotation_reference="QUO-BEFORE-1",
        ),
        headers=org_headers,
    )
    assert before.json()["purchase"]["status"] == "authorised"

    draft = client.post(
        f"/api/projects/{world['project'].id}/policies",
        json={
            "approved_categories": ["Blankets"],
            "per_transaction_limit_minor": 500_000,
            "budgets": [{"category": "Blankets", "allocated_minor": 500_000}],
            "notes": "Narrowed policy for winter phase.",
        },
        headers=org_headers,
    )
    assert draft.status_code == 201, draft.text
    draft_id = draft.json()["id"]

    still_old_policy = client.post(
        "/api/purchase-requests",
        json=purchase_body(
            world,
            category="Drinking water",
            description="Water while new draft is unapproved",
            quantity=1,
            unit_price_minor=120_000,
            quotation_reference="QUO-DRAFT-2",
        ),
        headers=org_headers,
    )
    assert still_old_policy.json()["purchase"]["status"] == "approved" or still_old_policy.json()["purchase"]["status"] == "authorised"

    approved = client.post(f"/api/policies/{draft_id}/approve", headers=admin_headers)
    assert approved.status_code == 200, approved.text
    assert approved.json()["policy"]["version"] == 2

    policies = db_session.scalars(select(ProjectPolicy).where(ProjectPolicy.project_id == world["project"].id)).all()
    statuses = {p.version: p.status for p in policies}
    assert statuses == {1: "superseded", 2: "approved"}

    after = client.post(
        "/api/purchase-requests",
        json=purchase_body(
            world,
            category="Drinking water",
            description="Water after policy change",
            quantity=1,
            unit_price_minor=130_000,
            quotation_reference="QUO-AFTER-3",
        ),
        headers=org_headers,
    )
    assert after.json()["purchase"]["status"] == "blocked"
    assert "not an approved spending category" in after.json()["purchase"]["decision"]["reason"]


def test_vendor_cannot_see_another_vendors_orders(client, db_session):
    world = make_world(db_session)
    other_vendor = Vendor(
        user_id=make_user(db_session, email="vendor2@testvendor.io", role="vendor", name="Other Vendor").id,
        business_name="Other Supplies",
        registration_number="VEN-TEST-2",
        verification_status="verified",
        categories=["Food supplies"],
        payment_destination_verified=True,
        payment_destination_ref="INV-OTHER-2",
    )
    db_session.add(other_vendor)
    db_session.commit()

    org_headers = auth_headers(client, world["org_user"].email)
    vendor1_headers = auth_headers(client, world["vendor_user"].email)
    created = client.post(
        "/api/purchase-requests",
        json={
            "project_id": world["project"].id,
            "vendor_id": other_vendor.id,
            "category": "Food supplies",
            "description": "Food from the second vendor",
            "quantity": 1,
            "unit_price_minor": 100_000,
            "quotation_reference": "QUO-V2-1",
            "payment_destination": "INV-OTHER-2",
        },
        headers=org_headers,
    )
    assert created.status_code == 201, created.text
    purchase_id = created.json()["purchase"]["id"]
    assert client.get(f"/api/purchase-requests/{purchase_id}", headers=vendor1_headers).status_code == 404

    vendor2_headers = auth_headers(client, "vendor2@testvendor.io")
    assert client.get(f"/api/purchase-requests/{purchase_id}", headers=vendor2_headers).status_code == 200
