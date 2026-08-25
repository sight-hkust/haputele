"""Dump the OpenAPI schema for the frontend type generator.

Usage:
    python backend/app/scripts/export_openapi.py frontend/openapi.json

No DB/S3 needed: importing the app does not run the lifespan hook (that
only fires on server startup), and `app.openapi()` builds the schema
entirely from the declared routes and Pydantic models.

The script writes to a file argument instead of stdout because
observability.configure_logging() installs a `sys.stdout` handler at app
construction — any future import-time log line would silently corrupt a
shell-redirected file.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.main import app  # noqa: E402
def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python backend/app/scripts/export_openapi.py <output-path>")
    out = Path(sys.argv[1])
    out.write_text(json.dumps(app.openapi(), indent=2) + "\n")
    print(f"wrote {out}", file=sys.stderr)
if __name__ == "__main__":
    main()
