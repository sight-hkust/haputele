from app.database import SessionLocal
from app.models import Account
from app.security import hash_password

PUBLIC = "/auth/account-support"
CONFIG = "/sysadmin/system-config"


def test_public_support_is_opt_in_and_clearable(client, initialized_system):
    # The setup fixture has a real-looking private institute email/phone.
    assert client.get(PUBLIC).json() == {"email": None, "phone": None}
    with SessionLocal() as db:
        db.add(
            Account(
                username="support.settings",
                password=hash_password("A private passphrase"),
                role="sys-admin",
            )
        )
        db.commit()
    assert (
        client.post(
            "/auth/login", json={"username": "support.settings", "password": "A private passphrase"}
        ).status_code
        == 200
    )
    headers = {"X-CSRF-Token": client.cookies["csrf_token"]}
    publish = {
        "publicSupportEmail": "shared+help@example.com",
        "publicSupportPhone": "+94 (11) 555-0123",
    }
    saved = client.patch(CONFIG, json=publish, headers=headers)
    assert saved.status_code == 200, saved.text
    assert client.get(CONFIG).json()["publicSupportPhone"] == publish["publicSupportPhone"]
    public = client.get(PUBLIC)
    assert public.headers["Cache-Control"] == "no-store"
    assert public.json() == {"email": "shared+help@example.com", "phone": "+94 (11) 555-0123"}
    # Identity settings and public contact settings can be edited independently.
    assert (
        client.patch(
            CONFIG, json={"instituteContactEmail": "private@example.com"}, headers=headers
        ).status_code
        == 200
    )
    assert client.get(PUBLIC).json() == public.json()
    for invalid in (
        {"publicSupportPhone": "tel:invalid#1"},
        {"publicSupportEmail": "https://example.com"},
    ):
        assert client.patch(CONFIG, json=invalid, headers=headers).status_code == 422
    assert client.get(PUBLIC).json() == public.json()
    assert (
        client.patch(CONFIG, json={"publicSupportPhone": "  "}, headers=headers).status_code == 200
    )
    assert client.get(PUBLIC).json() == {"email": "shared+help@example.com", "phone": None}
    assert (
        client.patch(CONFIG, json={"publicSupportEmail": None}, headers=headers).status_code == 200
    )
    assert client.get(PUBLIC).json() == {"email": None, "phone": None}
    assert client.get(CONFIG).json()["instituteContactEmail"] == "private@example.com"


def test_ordinary_admin_cannot_publish(admin_client):
    headers = {"X-CSRF-Token": admin_client.cookies["csrf_token"]}
    assert (
        admin_client.patch(
            CONFIG, json={"publicSupportPhone": "1234567"}, headers=headers
        ).status_code
        == 403
    )
    assert admin_client.get(PUBLIC).json() == {"email": None, "phone": None}


def test_signed_out_access_is_read_only(client, initialized_system):
    assert (
        client.patch(CONFIG, json={"publicSupportEmail": "untrusted@example.com"}).status_code
        == 401
    )
    assert client.get(PUBLIC).json() == {"email": None, "phone": None}
