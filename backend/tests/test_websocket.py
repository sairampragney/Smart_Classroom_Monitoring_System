"""Tests for the WebSocket foundation."""

from __future__ import annotations


def test_ws_sends_hello_then_status(ws_client):
    """On connect the server greets with hello + system_status."""
    with ws_client.websocket_connect("/ws") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        assert hello["payload"]["protocol"] == 1
        assert hello["payload"]["mode"] == "REAL_HARDWARE"
        assert "timestamp" in hello

        status = ws.receive_json()
        assert status["type"] == "system_status"
        assert status["payload"]["arduino"] == "DISCONNECTED"
        assert status["payload"]["websocket_clients"] >= 1


def test_ws_answers_ping_with_pong(ws_client):
    with ws_client.websocket_connect("/ws") as ws:
        ws.receive_json()  # hello
        ws.receive_json()  # system_status

        ws.send_json({"type": "ping"})
        reply = ws.receive_json()
        assert reply["type"] == "pong"


def test_ws_rejects_invalid_json_with_error(ws_client):
    with ws_client.websocket_connect("/ws") as ws:
        ws.receive_json()
        ws.receive_json()

        ws.send_text("this-is-not-json")
        reply = ws.receive_json()
        assert reply["type"] == "error"
        assert reply["payload"]["detail"] == "invalid JSON"


def test_ws_rejects_unknown_type_with_error(ws_client):
    with ws_client.websocket_connect("/ws") as ws:
        ws.receive_json()
        ws.receive_json()

        ws.send_json({"type": "definitely_not_a_real_type"})
        reply = ws.receive_json()
        assert reply["type"] == "error"
        assert "unknown message type" in reply["payload"]["detail"]


def test_ws_tracks_and_releases_clients(ws_client):
    """Client count must rise on connect and fall back after disconnect."""
    with ws_client.websocket_connect("/ws") as ws:
        ws.receive_json()
        status = ws.receive_json()
        assert status["payload"]["websocket_clients"] == 1

    # After the context manager exits the server should have deregistered it.
    assert ws_client.get("/health").json()["websocket_clients"] == 0


def test_ws_supports_multiple_concurrent_clients(ws_client):
    with ws_client.websocket_connect("/ws") as a:
        a.receive_json()
        a_status = a.receive_json()
        assert a_status["payload"]["websocket_clients"] == 1

        with ws_client.websocket_connect("/ws") as b:
            b.receive_json()
            b_status = b.receive_json()
            assert b_status["payload"]["websocket_clients"] == 2

        # Closing b must not break a.
        a.send_json({"type": "ping"})
        assert a.receive_json()["type"] == "pong"