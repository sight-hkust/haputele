from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest

from app.database import SessionLocal
from app.models import Account, Doctor
from app.services import doctor_invites, password_recovery


@pytest.fixture(autouse=True)
def fresh_request_budget(monkeypatch):
    monkeypatch.setattr(password_recovery, "_source_counts", {})


def verified(doctor):
    with SessionLocal() as db:
        _, token = doctor_invites.issue_rotation(db, doctor_id=doctor.doctor_id)
        doctor_invites.consume_rotation(db, raw_token=token, new_password="Original passphrase")


def request_link(client, doctor, captured):
    assert (
        client.post(
            "/auth/doctor-recovery/request", json={"email": doctor.email.upper()}
        ).status_code
        == 202
    )
    return captured[-1][1]["context"]["link"].split("#token=")[1]


def redeem(client, token):
    return client.post(
        "/auth/doctor-recovery/reset", json={"token": token, "password": "Replacement passphrase"}
    )


def test_verified_doctor_reset_and_revocation(client, seeded_doctor, captured_emails, email_env):
    doctor = seeded_doctor
    verified(doctor)
    login = lambda password: client.post(
        "/auth/login", json={"username": doctor.username, "password": password}
    )
    assert login("Original passphrase").status_code == 200
    token = request_link(client, doctor, captured_emails)
    assert request_link(client, doctor, captured_emails) == token
    assert len(captured_emails) == 1
    assert redeem(client, token).status_code == 204
    assert client.get("/auth/me").status_code == 401
    assert redeem(client, token).status_code == 422
    assert login("Original passphrase").status_code == 401
    assert login("Replacement passphrase").status_code == 200


@pytest.mark.parametrize(
    "condition",
    ["unknown", "unverified", "different_mailbox", "disabled", "pending", "rejected", "inactive"],
)
def test_indistinguishable_ineligible_requests(
    client, seeded_doctor, captured_emails, email_env, condition
):
    with SessionLocal() as db:
        doctor = db.get(Doctor, seeded_doctor.doctor_id)
        doctor.verified_email = doctor.email
        address = doctor.email
        if condition == "unknown":
            address = "nobody@example.invalid"
        elif condition == "unverified":
            doctor.verified_email = None
        elif condition == "different_mailbox":
            doctor.email = "different@example.invalid"
        elif condition == "pending":
            doctor.approved_at = None
        elif condition == "rejected":
            doctor.rejected_at = datetime.now(timezone.utc)
        elif condition == "inactive":
            doctor.active = False
        elif condition == "disabled":
            db.get(Account, doctor.username).disabled_at = datetime.now(timezone.utc)
        db.commit()
    res = client.post("/auth/doctor-recovery/request", json={"email": address})
    assert (res.status_code, res.content, captured_emails) == (202, b"", [])


def test_expired_link(client, seeded_doctor, captured_emails, email_env):
    verified(seeded_doctor)
    token = request_link(client, seeded_doctor, captured_emails)
    with SessionLocal() as db:
        db.get(Account, seeded_doctor.username).reset_expires_at = datetime.now(
            timezone.utc
        ) - timedelta(seconds=1)
        db.commit()
    assert redeem(client, token).status_code == 422


def test_racing_redemptions(client, seeded_doctor, captured_emails, email_env):
    verified(seeded_doctor)
    token = request_link(client, seeded_doctor, captured_emails)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: redeem(client, token).status_code, range(2)))
    assert sorted(results) == [204, 422]


def test_request_budget():
    for _ in range(10):
        assert password_recovery.allow_request("source")
    assert not password_recovery.allow_request("source")
    assert password_recovery.allow_request("other")


def test_reset_invalidates_existing_rotation(client, seeded_doctor, email_env, captured_emails):
    from fastapi import HTTPException

    verified(seeded_doctor)
    with SessionLocal() as db:
        _, old_invite = doctor_invites.issue_rotation(db, doctor_id=seeded_doctor.doctor_id)
        token = request_link(client, seeded_doctor, captured_emails)
        assert redeem(client, token).status_code == 204
        with pytest.raises(HTTPException, match="invite_not_found"):
            doctor_invites.consume_rotation(
                db, raw_token=old_invite, new_password="Another password"
            )


def test_signed_in_change_invalidates_reset(client, seeded_doctor, email_env, captured_emails):
    verified(seeded_doctor)
    token = request_link(client, seeded_doctor, captured_emails)
    assert (
        client.post(
            "/auth/login",
            json={"username": seeded_doctor.username, "password": "Original passphrase"},
        ).status_code
        == 200
    )
    headers = {"X-CSRF-Token": client.cookies["csrf_token"]}
    data = {"currentPassword": "Wrong password", "newPassword": "New correct password"}
    assert (
        client.post("/auth/doctor-password/change", json=data, headers=headers).status_code == 422
    )
    data["currentPassword"] = "Original passphrase"
    assert (
        client.post("/auth/doctor-password/change", json=data, headers=headers).status_code == 204
    )
    assert redeem(client, token).status_code == 422
    assert client.get("/auth/me").status_code == 401


def test_missing_token_redacts_password(client, initialized_system):
    response = client.post("/auth/doctor-recovery/reset", json={"password": "SENSITIVE-PASSWORD"})
    assert response.status_code == 422
    assert "SENSITIVE-PASSWORD" not in response.text


def test_suppressed_delivery_clears_link(client, seeded_doctor, email_env, monkeypatch):
    verified(seeded_doctor)
    monkeypatch.setattr(password_recovery, "send_templated", lambda *a, **kw: None)
    assert (
        client.post(
            "/auth/doctor-recovery/request", json={"email": seeded_doctor.email}
        ).status_code
        == 202
    )
    with SessionLocal() as db:
        assert db.get(Account, seeded_doctor.username).reset_digest is None
