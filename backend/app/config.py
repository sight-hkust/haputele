from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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

    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin"
    HEALTHWORKER_USERNAME: str = "healthworker"
    HEALTHWORKER_PASSWORD: str = "H"

    # SETUP-SEED VALUES — used only by the first-run wizard as default form
    # values, and by `seed.py` to upsert dev accounts. After /setup/initialize
    # succeeds, runtime config (timezones, master_consent_version) is read
    # from the system_config table; these env vars are NOT consulted at
    # request time. See backend/app/services/system_config.py.
    MASTER_CONSENT_VERSION: str = "v1"
    APP_TIMEZONE: str = "Asia/Colombo"

    # When truthy ("1"/"true"/"yes"/"on"), seed.py skips its upserts. Set
    # this in production-style deployments so first-run setup is the only
    # way to land accounts. Read directly from os.environ in seed.py to
    # keep the precedence rules explicit there.

    # LiveKit (video transport). LIVEKIT_URL is the wss:// endpoint
    # exposed to the browser; KEY/SECRET stay server-side and are used
    # only to mint short-lived JWTs.
    LIVEKIT_URL: str = ""
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""


settings = Settings()
