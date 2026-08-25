"""GET /health?full=true — optional readiness probe of db / s3 / livekit.

Plain /health stays a pure liveness probe (no dependency touched). The full
variant actively checks the three backing services and reports each one's
wall-clock `latencyMs`. Tests assert the literal wire strings ("ok",
"error", "not_configured", "degraded") on purpose: the module uses
STATUS_* constants internally, and the literals here pin the contract so a
renamed constant can't silently change the API.

The test env (and CI) exposes Postgres and rustfs, so db + s3 are expected
"ok"; LIVEKIT_URL is unset there, which must come back "not_configured"
WITHOUT degrading the overall status — running without LiveKit is a
supported deployment.

Failure paths are injected by monkeypatching the individual checks in
services/health_probe.py. That works because _run_checks() builds its
name→function map per call (module globals read at call time); the client
fixture's importlib.reload(app.main) does not reload the health_probe
module, so the patch target is stable across requests.

These tests all run pre-/setup/initialize: /health (path) is exempt from
the setup gate, and the query string does not change the matched path, so
?full=true must pass through just like plain /health.
"""
import json
import socket
import threading
import time

import pytest

from app.services import health_probe


@pytest.fixture(autouse=True)
def _fresh_probe_cache(monkeypatch):
    """run_full_probe() caches results for CACHE_TTL_S — without this
    reset, one test's (monkeypatched) result would leak into the next
    test that runs within the TTL."""
    monkeypatch.setattr(health_probe, "_last", None)


def _sleep_check(seconds: float):
    def check():
        time.sleep(seconds)
        return {"status": "ok"}

    return check


def test_plain_health_has_no_dependency_block(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert "dependencies" not in r.json()


def test_full_probe_ok_when_dependencies_up(client):
    r = client.get("/health?full=true")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    deps = body["dependencies"]
    assert set(deps) == {"db", "s3", "livekit"}
    assert deps["db"]["status"] == "ok"
    assert deps["s3"]["status"] == "ok"
    # No LIVEKIT_URL in the test env → skipped, not failed — and unprobed,
    # so no latency is reported for it.
    assert deps["livekit"]["status"] == "not_configured"
    assert "latencyMs" not in deps["livekit"]
    # Probed dependencies carry a non-negative latency.
    for name in ("db", "s3"):
        assert isinstance(deps[name]["latencyMs"], (int, float))
        assert deps[name]["latencyMs"] >= 0


def test_full_probe_503_when_a_dependency_fails(client, monkeypatch):
    monkeypatch.setattr(
        health_probe, "_check_db", lambda: {"status": "error", "error": "injected"}
    )
    r = client.get("/health?full=true")
    assert r.status_code == 503
    body = r.json()
    assert body["status"] == "degraded"
    assert body["dependencies"]["db"]["status"] == "error"
    assert body["dependencies"]["db"]["error"] == "injected"
    # Failure still carries latency (time-to-failure is diagnostic).
    assert body["dependencies"]["db"]["latencyMs"] >= 0
    # Non-failing dependencies are still reported individually.
    assert body["dependencies"]["s3"]["status"] == "ok"
    assert body["dependencies"]["livekit"]["status"] == "not_configured"


def test_error_bodies_do_not_leak_exception_detail(client, monkeypatch):
    """The wire carries the exception class only — boto3/psycopg2 messages
    embed internal endpoints, and this endpoint is unauthenticated."""

    def leaking_check():
        raise RuntimeError('Could not connect to "http://rustfs:9000/haputele" TOPSECRET')

    monkeypatch.setattr(health_probe, "_check_s3", leaking_check)
    r = client.get("/health?full=true")
    assert r.status_code == 503
    body = r.json()
    assert body["dependencies"]["s3"]["error"] == "RuntimeError"
    assert "TOPSECRET" not in json.dumps(body)
    assert "rustfs" not in json.dumps(body)


def test_latency_is_measured_per_check(client, monkeypatch):
    """A patched check that sleeps 50ms must report >= 50ms — proves the
    timing wraps the actual check call, not some adjacent bookkeeping."""
    monkeypatch.setattr(health_probe, "_check_db", _sleep_check(0.05))
    r = client.get("/health?full=true")
    assert r.status_code == 200
    assert r.json()["dependencies"]["db"]["latencyMs"] >= 50


def test_gather_cap_abandons_hung_checks(monkeypatch):
    """A check that outlives GATHER_TIMEOUT_S must not stall the response:
    the executor is shut down with wait=False and the check is reported as
    timed out. (The abandoned thread dies on its own timers.)"""
    monkeypatch.setattr(health_probe, "GATHER_TIMEOUT_S", 0.5)
    monkeypatch.setattr(health_probe, "_check_db", _sleep_check(2))
    monkeypatch.setattr(
        health_probe, "_check_livekit", lambda: {"status": "not_configured"}
    )
    t0 = time.perf_counter()
    result = health_probe.run_full_probe()
    elapsed = time.perf_counter() - t0
    deps = result["dependencies"]
    assert deps["db"]["status"] == "error"
    assert deps["db"]["error"] == "timed out"
    # Cap was 0.5s; the hung check wanted 2s. Generous slop for slow CI.
    assert elapsed < 1.5


def test_probe_results_are_single_flight_with_ttl(monkeypatch):
    """Within CACHE_TTL_S a second probe is served from cache (no re-probe);
    with the TTL expired it probes again."""
    calls = []

    def counting_db():
        calls.append(1)
        return {"status": "ok"}

    monkeypatch.setattr(health_probe, "_check_db", counting_db)
    monkeypatch.setattr(
        health_probe, "_check_livekit", lambda: {"status": "not_configured"}
    )

    first = health_probe.run_full_probe()
    second = health_probe.run_full_probe()
    assert calls == [1]  # second call hit the cache
    assert first is second  # same cached object

    monkeypatch.setattr(health_probe, "CACHE_TTL_S", 0.0)
    health_probe.run_full_probe()
    assert calls == [1, 1]  # TTL 0 → always re-probe


def test_concurrent_probes_share_one_in_flight_pass(monkeypatch):
    """Callers arriving while a probe is running wait for it rather than
    each launching their own connections to the backing services."""
    calls = []
    release = threading.Event()

    def slow_db():
        calls.append(1)
        release.wait(2)
        return {"status": "ok"}

    monkeypatch.setattr(health_probe, "_check_db", slow_db)
    monkeypatch.setattr(
        health_probe, "_check_livekit", lambda: {"status": "not_configured"}
    )

    results = []

    def probe():
        results.append(health_probe.run_full_probe())

    threads = [threading.Thread(target=probe) for _ in range(4)]
    for t in threads:
        t.start()
    time.sleep(0.3)  # let them all pile onto the lock
    release.set()
    for t in threads:
        t.join(timeout=5)

    assert len(results) == 4
    assert calls == [1]  # exactly one probe pass served all four callers


def test_check_livekit_unit():
    """Direct unit coverage of the URL handling — no app, no client."""
    monkey = pytest.MonkeyPatch()
    monkey.setattr(health_probe.settings, "LIVEKIT_URL", "")
    try:
        # Empty → not configured.
        assert health_probe._check_livekit() == {"status": "not_configured"}

        # Reachable listener → ok.
        with socket.socket() as srv:
            srv.bind(("127.0.0.1", 0))
            srv.listen(1)
            port = srv.getsockname()[1]
            monkey.setattr(health_probe.settings, "LIVEKIT_URL", f"ws://127.0.0.1:{port}")
            assert health_probe._check_livekit() == {"status": "ok"}

        # Closed port → connection refused → error (class name only).
        with socket.socket() as holder:
            holder.bind(("127.0.0.1", 0))
            dead_port = holder.getsockname()[1]
        monkey.setattr(health_probe.settings, "LIVEKIT_URL", f"ws://127.0.0.1:{dead_port}")
        result = health_probe._check_livekit()
        assert result["status"] == "error"
        assert result["error"] == "ConnectionRefusedError"

        # Scheme-less value gets a ws:// default; unresolvable host is an
        # error (DNS), but the URL parsed fine.
        monkey.setattr(health_probe.settings, "LIVEKIT_URL", "no-host.invalid")
        result = health_probe._check_livekit()
        assert result["status"] == "error"

        # No host at all → structured error, no exception.
        monkey.setattr(health_probe.settings, "LIVEKIT_URL", "ws://")
        assert health_probe._check_livekit() == {
            "status": "error",
            "error": "LIVEKIT_URL has no host",
        }
    finally:
        monkey.undo()


def test_not_configured_livekit_is_not_a_failure(client, monkeypatch):
    monkeypatch.setattr(
        health_probe, "_check_livekit", lambda: {"status": "not_configured"}
    )
    r = client.get("/health?full=true")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_livekit_reachability_counts_as_failure(client, monkeypatch):
    monkeypatch.setattr(
        health_probe,
        "_check_livekit",
        lambda: {"status": "error", "error": "ConnectionRefusedError"},
    )
    r = client.get("/health?full=true")
    assert r.status_code == 503
    assert r.json()["status"] == "degraded"


def test_full_probe_open_before_setup_initialize(client):
    """The setup gate exempts /health by path; ?full=true must pass too."""
    r = client.get("/health?full=true")
    assert r.status_code == 200
    assert r.json()["dependencies"]["db"]["status"] == "ok"
