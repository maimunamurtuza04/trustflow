from helpers import auth_headers, make_world


def test_onboarding_starts_unseen(client, db_session):
    make_world(db_session)
    headers = auth_headers(client, "donor@testdonor.io")

    response = client.get("/api/onboarding/donor", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "not_started"
    assert body["should_auto_start"] is True


def test_onboarding_skip_is_remembered(client, db_session):
    make_world(db_session)
    headers = auth_headers(client, "donor@testdonor.io")

    skipped = client.put("/api/onboarding/donor", json={"status": "skipped", "current_step": 2}, headers=headers)
    assert skipped.status_code == 200, skipped.text
    assert skipped.json()["status"] == "skipped"

    again = client.get("/api/onboarding/donor", headers=headers)
    assert again.json()["status"] == "skipped"
    assert again.json()["should_auto_start"] is False


def test_onboarding_completion_and_replay(client, db_session):
    make_world(db_session)
    headers = auth_headers(client, "org@testorg.io")

    done = client.put("/api/onboarding/organisation", json={"status": "completed", "current_step": 5}, headers=headers)
    assert done.status_code == 200
    assert done.json()["status"] == "completed"
    assert done.json()["completed_at"] is not None

    replay = client.put("/api/onboarding/organisation", json={"status": "in_progress", "current_step": 0}, headers=headers)
    assert replay.status_code == 200
    assert replay.json()["status"] == "in_progress"
    assert replay.json()["completed_at"] is None


def test_onboarding_is_scoped_to_the_users_role(client, db_session):
    make_world(db_session)
    headers = auth_headers(client, "donor@testdonor.io")

    assert client.get("/api/onboarding/admin", headers=headers).status_code == 403
    assert client.get("/api/onboarding/unknown", headers=headers).status_code == 404
    assert client.get("/api/onboarding/donor").status_code == 401
