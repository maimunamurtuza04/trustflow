from helpers import auth_headers, make_world


def test_security_posture_requires_authentication(client):
    assert client.get("/api/security/posture").status_code == 401


def test_security_posture_reports_only_existing_controls(client, db_session):
    make_world(db_session)
    headers = auth_headers(client, "donor@testdonor.io")

    response = client.get("/api/security/posture", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["summary"]["enforced_controls"] == len(body["enforced"])
    assert body["summary"]["open_gaps"] == len(body["not_implemented"])
    assert body["summary"]["simulated_boundaries"] == len(body["simulated"])

    # The trust page must never imply that real money moves.
    assert body["payments"]["real_payments"] is False
    assert body["payments"]["mode"] == "simulated"
    assert "SIMPAY-" in body["payments"]["reference_prefixes"]

    # A control cannot be claimed as enforced and open at the same time.
    enforced = {item["title"] for item in body["enforced"]}
    gaps = {item["title"] for item in body["not_implemented"]}
    assert enforced.isdisjoint(gaps)

    # Every enforced entry must cite the module that implements it.
    assert all(item["evidence"].startswith("app/") for item in body["enforced"])

    # MFA and session revocation are prototype gaps and must stay listed as such.
    gap_titles = " ".join(gaps)
    assert "Multi-factor authentication" in gap_titles
    assert "Session revocation" in gap_titles


def test_security_posture_is_available_to_every_role(client, db_session):
    make_world(db_session)
    for email in ("donor@testdonor.io", "org@testorg.io", "vendor@testvendor.io", "admin@testadmin.io"):
        headers = auth_headers(client, email)
        assert client.get("/api/security/posture", headers=headers).status_code == 200
