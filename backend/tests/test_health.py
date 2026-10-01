"""Tests for the health and status endpoints."""

from __future__ import annotations

REQUIRED_COMPONENTS = {
    "backend",
    "websocket",
    "arduino",
    "serial",
    "camera",
    "cv_detector",
    "ml_model",
}


def test_root_returns_service_metadata(client):
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert "Smart Classroom" in body["app"]
    assert body["health"] == "/health"
    assert body["websocket"] == "/ws"


def test_health_returns_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["phase"] == "2"
    assert isinstance(body["uptime_s"], (int, float))
    assert isinstance(body["server_time"], str)


def test_health_reports_real_hardware_mode_by_default(client):
    """Demo mode must be OFF unless explicitly configured."""
    body = client.get("/health").json()
    assert body["demo_mode"] is False
    assert body["mode"] == "REAL_HARDWARE"


def test_health_components_cover_all_subsystems(client):
    body = client.get("/health").json()
    names = {c["name"] for c in body["components"]}
    assert REQUIRED_COMPONENTS.issubset(names)


def test_health_does_not_fake_hardware_states(client):
    """With nothing wired up yet, hardware components must report NOT connected."""
    body = client.get("/health").json()
    services = body["services"]
    assert services["arduino"] == "DISCONNECTED"
    assert services["serial"] == "DISCONNECTED"
    assert services["camera"] == "DISCONNECTED"
    assert services["cv"] == "STOPPED"
    assert services["ml"] == "NOT_LOADED"
    assert services["monitoring_running"] is False
    assert body["websocket_clients"] == 0


def test_api_status_alias_matches_health(client):
    assert client.get("/api/status").json()["status"] == "ok"


def test_openapi_schema_generates_without_error(client):
    """Regression: a malformed 'examples' scalar used to 500 this endpoint."""
    r = client.get("/openapi.json")
    assert r.status_code == 200
    paths = r.json()["paths"]
    assert "/health" in paths
    assert "/api/status" in paths


def test_swagger_docs_are_served(client):
    assert client.get("/docs").status_code == 200


def test_cors_allows_local_frontend(client):
    r = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_does_not_wildcard_unknown_origin(client):
    r = client.get("/health", headers={"Origin": "http://evil.example.com"})
    assert "access-control-allow-origin" not in {k.lower() for k in r.headers} or (
        r.headers.get("access-control-allow-origin") != "*"
    )