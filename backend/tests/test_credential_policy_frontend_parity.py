"""The frontend's copy of the password minimum must match the backend's.

There is no frontend test runner in this repo (package.json has lint and
typecheck, nothing else), so this gate lives here — and it is the only place
it *can* live: a JavaScript test cannot read a Python constant, so it would
have to re-encode the number a third time and would enforce "the frontend
agrees with itself" rather than "the frontend agrees with the server."

The drift is not hypothetical. frontend/src/app/doctor-onboarding/[token]/
page.tsx shipped `const MIN_PASSWORD_LEN = 8` while validate_new_password
enforced 10: the placeholder promised 8 was enough, `minLength` let 9 through,
and the API then returned 422. Four other frontend files carried their own
copy of the number as well.

CI note: .github/workflows/docker.yml adds frontend/src/lib/credentials.ts to
the `backend` path filter, so a frontend-only PR that edits the mirror still
runs this test.
"""
import re
from pathlib import Path

import pytest

from app.services.credentials import MIN_PASSWORD_LEN

_REPO_ROOT = Path(__file__).resolve().parents[2]
_FRONTEND_SRC = _REPO_ROOT / "frontend" / "src"
_CREDENTIALS_TS = _FRONTEND_SRC / "lib" / "credentials.ts"

# Matches the declaration only, anchored to the start of a line, so the
# module's own explanatory comment about the old `= 8` cannot satisfy it.
_DECLARATION = re.compile(r"^export const MIN_PASSWORD_LEN = (\d+);$", re.M)

# Any binding of that name anywhere — used to prove no OTHER file reintroduces
# a local copy. Deliberately looser than the declaration regex above.
_ANY_BINDING = re.compile(r"\bMIN_PASSWORD_LEN\s*=\s*\d+")


def test_frontend_mirrors_the_backend_minimum_password_length():
    if not _CREDENTIALS_TS.exists():
        pytest.fail(
            f"{_CREDENTIALS_TS} is missing. This test needs a full checkout — "
            "if the module moved, move this assertion with it rather than "
            "deleting it."
        )

    found = _DECLARATION.findall(_CREDENTIALS_TS.read_text(encoding="utf-8"))

    # Zero matches is a failure, not a skip: a rename or a reshape of the
    # declaration must break loudly rather than silently stop checking.
    assert len(found) == 1, (
        "expected exactly one `export const MIN_PASSWORD_LEN = <n>;` line in "
        f"{_CREDENTIALS_TS.name}, found {len(found)}"
    )
    assert int(found[0]) == MIN_PASSWORD_LEN, (
        f"frontend says {found[0]}, backend enforces {MIN_PASSWORD_LEN}. "
        "A user would be told one number and refused by the other."
    )


def test_no_other_frontend_file_declares_a_password_minimum():
    """One constant, one file. Every credential form imports it from there."""
    offenders = []
    for path in _FRONTEND_SRC.rglob("*.ts*"):
        if path == _CREDENTIALS_TS:
            continue
        if _ANY_BINDING.search(path.read_text(encoding="utf-8")):
            offenders.append(path.relative_to(_REPO_ROOT).as_posix())

    assert offenders == [], (
        "these files declare their own password minimum instead of importing "
        f"MIN_PASSWORD_LEN from lib/credentials.ts: {offenders}"
    )
