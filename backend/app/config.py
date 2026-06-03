import os
from typing import Literal

from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
    YamlConfigSettingsSource,
)


# Optional YAML config file. Path is overridable via env so ops can point at
# /etc/haputele/config.yaml (or anywhere mounted into the container) without
# a code change. Missing file is fine — the source just contributes nothing
# and we fall back to .env / env vars / defaults.
_CONFIG_FILE = os.environ.get("CONFIG_FILE", "config.yaml")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        yaml_file=_CONFIG_FILE,
        yaml_file_encoding="utf-8",
        extra="ignore",
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Precedence (highest → lowest): env vars > .env > YAML > defaults.
        # Existing env/.env-driven deploys keep working unchanged; YAML is
        # an additional fallback layer for ops who prefer a single config
        # file over a long list of env vars.
        return (
            init_settings,
            env_settings,
            dotenv_settings,
            YamlConfigSettingsSource(settings_cls),
            file_secret_settings,
        )

    DATABASE_URL: str = "postgresql+psycopg2://hapu:hapu@localhost:5432/haputele"
    JWT_SECRET: str = "dev-secret-change-me"
    JWT_ALG: str = "HS256"
    JWT_EXPIRE_MIN: int = 480

    # Session cookie controls. Auth lives in an HttpOnly cookie; CSRF defence
    # is the double-submit pattern (a non-HttpOnly companion cookie echoed
    # back as `X-CSRF-Token` on unsafe verbs). `COOKIE_SECURE=false` is for
    # local HTTP dev only — every prod deploy must keep it true.
    COOKIE_SECURE: bool = True
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    COOKIE_DOMAIN: str = ""  # empty → host-only cookie (recommended)

    # CORS for credentialed requests. When the frontend and API share an
    # origin (the default `/api` rewrite in next.config.mjs) this is unused;
    # set it when the browser talks to the API on a different origin. Wildcard
    # is rejected because `allow_credentials=True` forbids it.
    CORS_ALLOW_ORIGINS: str = ""  # comma-separated; empty = no cross-origin

    # First-run wizard prefill defaults. After /setup/initialize succeeds,
    # runtime config (timezones, master_consent_version) is read from the
    # system_config table; these env vars are NOT consulted at request
    # time. See backend/app/services/system_config.py.
    MASTER_CONSENT_VERSION: str = "v1"
    APP_TIMEZONE: str = "Asia/Colombo"

    # LiveKit (video transport). LIVEKIT_URL is the wss:// endpoint
    # exposed to the browser; KEY/SECRET stay server-side and are used
    # only to mint short-lived JWTs.
    LIVEKIT_URL: str = ""
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""

    # Object storage (S3-compatible). In dev the compose `rustfs` service
    # serves at http://rustfs:9000; for real AWS S3 leave S3_ENDPOINT_URL
    # empty so boto3 hits the regional AWS endpoint. S3_FORCE_PATH_STYLE
    # must be true for rustfs/minio/most non-AWS endpoints.
    S3_ENDPOINT_URL: str = "http://rustfs:9000"
    S3_REGION: str = "us-east-1"
    S3_BUCKET: str = "haputele"
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_FORCE_PATH_STYLE: bool = True

    # Resend (transactional email). API key stays server-side. RESEND_FROM
    # must use a domain you've verified in the Resend dashboard; until a
    # domain is verified, set RESEND_FROM to "onboarding@resend.dev" and
    # note that delivery is restricted to the account-owner's email.
    # RESEND_WEBHOOK_SECRET is the Svix signing secret shown when you add
    # a webhook endpoint; required to accept POSTs on /resend/webhook.
    # When RESEND_API_KEY is empty, send_email() raises a clean 422 so
    # callers can branch on `email_not_configured` in dev/test.
    RESEND_API_KEY: str = ""
    RESEND_FROM: str = ""
    RESEND_REPLY_TO: str = ""
    RESEND_WEBHOOK_SECRET: str = ""

    # Where the frontend lives — used by the email service to build absolute
    # URLs in transactional templates (e.g. doctor invite links). No trailing
    # slash. In dev with the Next.js dev server at :3000 set
    # FRONTEND_BASE_URL=http://localhost:3000; in prod set it to your real
    # https origin. If empty, send_templated() refuses to render any template
    # that needs a link, because relative URLs in email don't resolve.
    FRONTEND_BASE_URL: str = ""

    # How long a doctor invite token is valid for, in hours. Default 72h
    # (long weekend) gives a busy clinician enough slack but is short
    # enough that a leaked link doesn't sit usable for weeks.
    DOCTOR_INVITE_TTL_HOURS: int = 72


settings = Settings()
