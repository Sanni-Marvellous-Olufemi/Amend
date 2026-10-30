import pytest
from fastapi.testclient import TestClient

from app import main
from app.services import mock

ORIGIN = "chrome-extension://" + "a" * 32
HEADERS = {"origin": ORIGIN, "x-amend-client": "1"}


@pytest.fixture(autouse=True)
def fast_mock(monkeypatch):
    original = mock.mock_analyze

    async def instant(hint, delay_s=0):
        return await original(hint, delay_s=0)

    monkeypatch.setattr(main, "mock_analyze", instant)


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def analyze_body(hint: str):
    return {
        "op_id": "op-1",
        "image_b64": "data:image/jpeg;base64," + "A" * 64,
        "captured_at": "2026-10-30T15:00:00-05:00",
        "timezone": "America/Chicago",
        "source_hint": hint,
    }


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200 and res.json()["mock"] is True


def test_rejects_foreign_origin(client):
    res = client.post("/analyze", json=analyze_body("x"), headers={"origin": "https://evil.example", "x-amend-client": "1"})
    assert res.status_code == 403


def test_rejects_missing_client_header(client):
    res = client.post("/analyze", json=analyze_body("x"), headers={"origin": ORIGIN})
    assert res.status_code == 403


def test_analyze_create(client):
    res = client.post("/analyze", json=analyze_body("AMEND demo: create"), headers=HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert body["op_id"] == "op-1"
    (p,) = body["proposals"]
    assert p["intent"] == "CREATE"
    assert p["start"] == "2026-11-12T15:00:00-06:00"


def test_analyze_and_match_reschedule(client):
    res = client.post("/analyze", json=analyze_body("AMEND demo: rescheduled"), headers=HEADERS)
    (p,) = res.json()["proposals"]
    assert p["intent"] == "UPDATE" and p["partial"]["start_time"] == "17:30"
    match = client.post(
        "/match",
        json={
            "op_id": "op-1",
            "proposal": p,
            "candidates": [
                {"id": "a", "title": "ACM Tech Night", "start": "2026-11-06T16:00:00-06:00"},
                {"id": "b", "title": "Dentist", "start": "2026-11-06T09:00:00-06:00"},
            ],
        },
        headers=HEADERS,
    )
    assert match.status_code == 200
    assert match.json()["decision"] == "single" and match.json()["chosen_id"] == "a"


def test_cors_preflight(client):
    res = client.options(
        "/analyze",
        headers={
            "origin": ORIGIN,
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type,x-amend-client",
        },
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == ORIGIN
