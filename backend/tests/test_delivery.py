from datetime import datetime, timedelta, timezone

from helpers import DESTINATION, auth_headers, make_user, make_world
from app.models import Vendor


def report_body(*, delivered: bool = False, reference: str = "LR-TEST-1001") -> dict:
    now = datetime.now(timezone.utc)
    body = {
        "dispatch_reference": reference,
        "dispatched_at": (now - timedelta(hours=6)).isoformat(),
        "quantity_reported": 10,
        "notes": "Ten cases handed to the relief warehouse.",
    }
    if delivered:
        body["delivered_at"] = (now - timedelta(hours=1)).isoformat()
    return body


def create_paid_purchase(client, world, org_headers, *, category: str, description: str, quantity: int, price: int, quote: str):
    created = client.post(
        "/api/purchase-requests",
        json={
            "project_id": world["project"].id,
            "vendor_id": world["vendor"].id,
            "category": category,
            "description": description,
            "quantity": quantity,
            "unit_price_minor": price,
            "quotation_reference": quote,
            "payment_destination": DESTINATION,
        },
        headers=org_headers,
    )
    assert created.status_code == 201, created.text
    purchase = created.json()["purchase"]
    assert purchase["status"] == "authorised"
    paid = client.post(
        f"/api/purchase-requests/{purchase['id']}/pay",
        json={"idempotency_key": f"delivery-pay-{purchase['id']}"},
        headers=org_headers,
    )
    assert paid.status_code == 200, paid.text
    assert paid.json()["purchase"]["status"] == "paid"
    return purchase["id"]


def test_delivery_and_receipt_flow_derives_performance(client, db_session):
    world = make_world(db_session)
    org_headers = auth_headers(client, world["org_user"].email)
    vendor_headers = auth_headers(client, world["vendor_user"].email)
    admin_headers = auth_headers(client, world["admin"].email)

    purchase_id = create_paid_purchase(
        client,
        world,
        org_headers,
        category="Drinking water",
        description="Drinking water for the relief warehouse",
        quantity=10,
        price=30_000,
        quote="DEL-WATER-001",
    )

    dispatch = client.post(
        f"/api/purchase-requests/{purchase_id}/delivery",
        json=report_body(reference="LR-TEST-1001"),
        headers=vendor_headers,
    )
    assert dispatch.status_code == 200, dispatch.text
    assert dispatch.json()["delivery"]["status"] == "in_transit"

    vendor_public = client.get(f"/api/vendors/{world['vendor'].id}", headers=org_headers)
    assert vendor_public.status_code == 200
    assert vendor_public.json()["delivery_performance"] is None
    assert vendor_public.json()["delivery_metrics"]["in_transit"] == 1

    early_receipt = client.post(
        f"/api/purchase-requests/{purchase_id}/receipt",
        json={"decision": "confirmed", "notes": "Delivered to warehouse."},
        headers=org_headers,
    )
    assert early_receipt.status_code == 409
    assert "not reported delivery" in early_receipt.json()["detail"]

    delivered = client.post(
        f"/api/purchase-requests/{purchase_id}/delivery",
        json=report_body(delivered=True, reference="LR-TEST-1001"),
        headers=vendor_headers,
    )
    assert delivered.status_code == 200, delivered.text
    assert delivered.json()["delivery"]["status"] == "delivered"

    vendor_public = client.get(f"/api/vendors/{world['vendor'].id}", headers=org_headers).json()
    assert vendor_public["delivery_metrics"]["awaiting_receipt"] == 1
    assert vendor_public["delivery_performance"] is None

    confirmed = client.post(
        f"/api/purchase-requests/{purchase_id}/receipt",
        json={"decision": "confirmed", "notes": "All 10 cases counted and accepted.", "quantity_received": 10},
        headers=org_headers,
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["delivery"]["status"] == "confirmed"
    assert confirmed.json()["delivery"]["acknowledged"] is True

    vendor_public = client.get(f"/api/vendors/{world['vendor'].id}", headers=org_headers).json()
    assert vendor_public["delivery_performance"] == 100.0
    assert vendor_public["delivery_metrics"]["confirmed"] == 1
    assert vendor_public["delivery_metrics"]["reviewed"] == 1

    evidence_types = {item["evidence_type"]: item["status"] for item in confirmed.json()["evidence"]}
    assert evidence_types["delivery_report"] == "collected"
    assert evidence_types["receipt_confirmation"] == "verified"
    assert evidence_types["payment_confirmation"] == "verified"

    repeated = client.post(
        f"/api/purchase-requests/{purchase_id}/receipt",
        json={"decision": "confirmed", "notes": "Already accepted."},
        headers=org_headers,
    )
    assert repeated.status_code == 409

    vendor_resubmit = client.post(
        f"/api/purchase-requests/{purchase_id}/delivery",
        json=report_body(delivered=True, reference="LR-TEST-1001"),
        headers=vendor_headers,
    )
    assert vendor_resubmit.status_code == 409

    audit = client.get("/api/admin/audit?limit=200", headers=admin_headers).json()
    actions = {item["action"] for item in audit["items"]}
    assert {"delivery.reported", "delivery.confirmed"} <= actions


def test_delivery_permissions_and_dispute_metrics(client, db_session):
    world = make_world(db_session)
    org_headers = auth_headers(client, world["org_user"].email)
    vendor_headers = auth_headers(client, world["vendor_user"].email)
    donor_headers = auth_headers(client, world["donor"].email)
    admin_headers = auth_headers(client, world["admin"].email)

    purchase_id = create_paid_purchase(
        client,
        world,
        org_headers,
        category="Food supplies",
        description="Emergency food supplies for the warehouse",
        quantity=2,
        price=100_000,
        quote="DEL-FOOD-002",
    )

    assert client.post(
        f"/api/purchase-requests/{purchase_id}/delivery", json=report_body(), headers=org_headers
    ).status_code == 403
    assert client.post(
        f"/api/purchase-requests/{purchase_id}/receipt", json={"decision": "confirmed", "notes": "x"}, headers=donor_headers
    ).status_code == 403

    other_vendor = Vendor(
        user_id=make_user(db_session, email="other@delivery.io", role="vendor", name="Other Vendor").id,
        business_name="Other Delivery Supplies",
        registration_number="VEN-DEL-OTHER",
        verification_status="verified",
        categories=["Food supplies"],
        payment_destination_verified=True,
        payment_destination_ref=DESTINATION,
    )
    db_session.add(other_vendor)
    db_session.commit()
    other_headers = auth_headers(client, "other@delivery.io")
    assert client.post(
        f"/api/purchase-requests/{purchase_id}/delivery", json=report_body(), headers=other_headers
    ).status_code == 404

    delivered = client.post(
        f"/api/purchase-requests/{purchase_id}/delivery",
        json={**report_body(delivered=True, reference="LR-FOOD-2002"), "quantity_reported": 2},
        headers=vendor_headers,
    )
    assert delivered.status_code == 200, delivered.text

    short_dispute = client.post(
        f"/api/purchase-requests/{purchase_id}/receipt",
        json={"decision": "disputed", "notes": "short"},
        headers=org_headers,
    )
    assert short_dispute.status_code == 409

    disputed = client.post(
        f"/api/purchase-requests/{purchase_id}/receipt",
        json={
            "decision": "disputed",
            "notes": "Only one of the two food kits arrived; one box was damaged.",
            "quantity_received": 1,
        },
        headers=org_headers,
    )
    assert disputed.status_code == 200, disputed.text
    assert disputed.json()["delivery"]["status"] == "disputed"
    assert disputed.json()["delivery"]["acknowledged"] is False

    metrics = client.get(f"/api/vendors/{world['vendor'].id}", headers=org_headers).json()["delivery_metrics"]
    assert metrics["confirmed"] == 0
    assert metrics["disputed"] == 1
    assert metrics["performance_percent"] == 0.0

    evidence_types = {item["evidence_type"]: item["status"] for item in disputed.json()["evidence"]}
    assert evidence_types["receipt_dispute"] == "inconsistent"

    assert client.post(
        f"/api/purchase-requests/{purchase_id}/receipt",
        json={"decision": "confirmed", "notes": "Trying to reverse a dispute."},
        headers=admin_headers,
    ).status_code == 403


def test_delivery_requires_settlement(client, db_session):
    world = make_world(db_session)
    org_headers = auth_headers(client, world["org_user"].email)
    vendor_headers = auth_headers(client, world["vendor_user"].email)

    created = client.post(
        "/api/purchase-requests",
        json={
            "project_id": world["project"].id,
            "vendor_id": world["vendor"].id,
            "category": "Blankets",
            "description": "Blankets awaiting settlement before dispatch",
            "quantity": 1,
            "unit_price_minor": 100_000,
            "quotation_reference": "DEL-UNPAID-003",
            "payment_destination": DESTINATION,
        },
        headers=org_headers,
    )
    assert created.status_code == 201, created.text
    purchase_id = created.json()["purchase"]["id"]
    assert created.json()["purchase"]["status"] == "authorised"

    response = client.post(
        f"/api/purchase-requests/{purchase_id}/delivery",
        json=report_body(),
        headers=vendor_headers,
    )
    assert response.status_code == 409
    assert "settled purchase" in response.json()["detail"]
