"""Tests for the Phase 5 state broadcaster.

These verify BROADCASTER LOGIC (change detection, message shape, suppression
of duplicates). They inject readings into the StateStore; they do NOT prove
that a physical Arduino produces them.
"""

from __future__ import annotations

import pytest

from app.models.sensors import SensorReading
from app.services.broadcaster import StateBroadcaster
from app.services.state import StateStore


class FakeWSManager:
    """Captures broadcasts instead of touching real sockets."""

    def __init__(self) -> None:
        self.client_count = 1  # pretend one client is connected
        self.messages: list = []

    async def broadcast(self, message) -> int:
        self.messages.append(message)
        return 1


@pytest.fixture()
def store(monkeypatch):
    s = StateStore()
    from app.services import broadcaster as mod

    monkeypatch.setattr(mod, "state_store", s)
    return s


@pytest.fixture()
def bc(monkeypatch, store):
    fake = FakeWSManager()
    from app.services import broadcaster as mod

    monkeypatch.setattr(mod, "ws_manager", fake)
    b = StateBroadcaster()
    b.reset_tracking()
    b.fake = fake  # type: ignore[attr-defined]
    return b


def reading(**kw) -> SensorReading:
    base = dict(temperature=28.6, humidity=57.2, light=642, motion=True)
    base.update(kw)
    return SensorReading(**base)


@pytest.mark.asyncio
async def test_first_tick_broadcasts_initial_status(bc, store):
    await bc.tick()
    types = [m.type.value for m in bc.fake.messages]
    assert "arduino_status" in types


@pytest.mark.asyncio
async def test_unchanged_state_is_not_rebroadcast(bc, store):
    """Idle system must produce no traffic."""
    await bc.tick()
    first = len(bc.fake.messages)
    await bc.tick()
    await bc.tick()
    assert len(bc.fake.messages) == first, "state broadcaster re-sent unchanged data"


@pytest.mark.asyncio
async def test_sensor_reading_is_pushed_on_new_sample(bc, store):
    await bc.tick()
    bc.fake.messages.clear()

    store.update_sensor(reading())
    await bc.tick()

    kinds = [m.type.value for m in bc.fake.messages]
    assert "sensor_reading" in kinds

    msg = next(m for m in bc.fake.messages if m.type.value == "sensor_reading")
    assert msg.payload["temperature"] == pytest.approx(28.6)
    assert msg.payload["light"] == 642
    assert msg.payload["motion"] is True


@pytest.mark.asyncio
async def test_null_values_are_preserved_over_the_wire(bc, store):
    await bc.tick()
    bc.fake.messages.clear()

    store.update_sensor(reading(temperature=None, humidity=None, err="DHT22_READ_FAILED"))
    await bc.tick()

    msg = next(m for m in bc.fake.messages if m.type.value == "sensor_reading")
    assert msg.payload["temperature"] is None
    assert msg.payload["humidity"] is None
    assert msg.payload["err"] == "DHT22_READ_FAILED"


@pytest.mark.asyncio
async def test_state_change_pushes_arduino_status(bc, store):
    from app.models.common import ConnectionState, MonitoringState

    await bc.tick()
    bc.fake.messages.clear()

    store.update_monitoring(
        monitoring=True, monitoring_state=MonitoringState.RUNNING
    )
    await bc.tick()

    msg = next(m for m in bc.fake.messages if m.type.value == "arduino_status")
    assert msg.payload["monitoring"] == "RUNNING"
    assert msg.payload["monitoring_running"] is True


@pytest.mark.asyncio
async def test_no_broadcast_when_no_clients_connected(monkeypatch, store):
    from app.services import broadcaster as mod

    class NoClients:
        client_count = 0
        messages: list = []

        async def broadcast(self, message) -> int:
            raise AssertionError("must not broadcast with zero clients")

    monkeypatch.setattr(mod, "ws_manager", NoClients())
    b = StateBroadcaster()
    store.update_sensor(reading())
    await b.tick()  # must not raise


def test_broadcaster_not_running_before_start():
    b = StateBroadcaster()
    assert b.is_running is False
