FROM python:3.12-slim

# Image provenance surfaced by GET /health. CI passes the git ref, sha, and
# build timestamp; local builds fall back to dev markers.
ARG BUILD_VERSION=dev
ARG BUILD_DATE=unknown
ARG BUILD_COMMIT=unknown

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    BUILD_VERSION=$BUILD_VERSION \
    BUILD_DATE=$BUILD_DATE \
    BUILD_COMMIT=$BUILD_COMMIT

# libpq for psycopg2; netcat for the wait-for-db loop in entrypoint.sh
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
