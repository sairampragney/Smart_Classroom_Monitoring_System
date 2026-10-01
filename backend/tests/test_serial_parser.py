"""Tests for the Phase 3 serial protocol parser (Phase 4).

These validate PARSING AND VALIDATION logic only. No hardware is involved and
none is implied.
"""

from __future__ import annotations

import json

import pytest

from app.models.sensors import ProtocolError, parse_sensor_line

VALID = '{"temperature":28.60,"humidity":57.20,"light":642,"motion":true}'


# ----------------------------------------------------------------------
# Happy path
# ----------------------------------------------------------------------
def test_valid_reading_parses():
    r = parse_sensor_line(VALID)
    assert r is not None
    assert r.temperature == pytest.approx(28.60)
    assert r.humidity == pytest.approx(57.20)
    assert r.light == 642
    assert r.motion is True
    assert r.err is None
    assert r.received_at is not None


def test_valid_reading_with_motion_false():
    r = parse_sensor_line(
        '{"temperature":21.00,"humidity":40.00,"light":100,"motion":false}'
    )
    assert r is not None and r.motion is False


def test_extra_fields_are_ignored():
    """Forward compatibility: unknown keys must not break parsing."""
    r = parse_sensor_line(
        '{"temperature":22.0,"humidity":45.0,"light":300,"motion":true,"seq":7}'
    )
    assert r is not None and r.light == 300


def test_boundary_values_accepted():
    r = parse_sensor_line(
        '{"temperature":-40.00,"humidity":0.00,"light":0,"motion":false}'
    )
    assert r is not None and r.temperature == pytest.approx(-40.0)
    r2 = parse_sensor_line(
        '{"temperature":80.00,"humidity":100.00,"light":1023,"motion":true}'
    )
    assert r2 is not None and r2.light == 1023


def test_integer_valued_floats_accepted_for_light():
    """The firmware sends 642, but 642.0 must not be rejected."""
    r = parse_sensor_line(
        '{"temperature":22.0,"humidity":45.0,"light":642.0,"motion":true}'
    )
    assert r is not None and r.light == 642


# ----------------------------------------------------------------------
# Nulls (firmware emits null when a DHT read fails)
# ----------------------------------------------------------------------
def test_null_temperature_is_preserved_not_defaulted():
    r = parse_sensor_line(
        '{"temperature":null,"humidity":57.20,"light":642,"motion":false}'
    )
    assert r is not None
    assert r.temperature is None      # NOT silently 0.0
    assert r.humidity == pytest.approx(57.20)
    assert r.valid is True


def test_null_humidity_is_preserved():
    r = parse_sensor_line(
        '{"temperature":28.6,"humidity":null,"light":10,"motion":false}'
    )
    assert r is not None and r.humidity is None


def test_both_null_carries_error_label():
    r = parse_sensor_line(
        '{"temperature":null,"humidity":null,"light":651,"motion":false,'
        '"err":"DHT22_READ_FAILED"}'
    )
    assert r is not None
    assert r.temperature is None and r.humidity is None
    assert r.err == "DHT22_READ_FAILED"
    assert r.light == 651
    assert r.valid is False


# ----------------------------------------------------------------------
# Banner / blank lines are NOT errors
# ----------------------------------------------------------------------
@pytest.mark.parametrize(
    "line",
    [
        "# Smart Classroom Sensor Firmware v1.0.0",
        "# DHT22=D2 LDR=A0 PIR=D7 INTERVAL_MS=1000",
        "# DHT_INIT=OK",
        "# READY",
    ],
)
def test_banner_lines_return_none(line):
    assert parse_sensor_line(line) is None


@pytest.mark.parametrize("line", ["", "   ", "\n", "\r\n", "\t"])
def test_blank_lines_return_none(line):
    assert parse_sensor_line(line) is None


def test_banner_does_not_increment_parse_errors(manager):
    manager._handle_line("# READY")
    assert manager.stats["parse_errors"] == 0
    assert manager.stats["readings_received"] == 0


# ----------------------------------------------------------------------
# Malformed input
# ----------------------------------------------------------------------
def test_malformed_json_raises():
    with pytest.raises(ProtocolError, match="not valid JSON"):
        parse_sensor_line('{"temperature":28.6,')


def test_garbage_line_raises():
    with pytest.raises(ProtocolError):
        parse_sensor_line("this is not json at all")


def test_non_object_json_raises():
    with pytest.raises(ProtocolError, match="expected a JSON object"):
        parse_sensor_line("[1,2,3]")
    with pytest.raises(ProtocolError, match="expected a JSON object"):
        parse_sensor_line("42")


@pytest.mark.parametrize("missing", ["temperature", "humidity", "light", "motion"])
def test_missing_required_field_raises(missing):
    payload = {
        "temperature": 28.6,
        "humidity": 57.2,
        "light": 642,
        "motion": True,
    }
    del payload[missing]
    with pytest.raises(ProtocolError, match="missing required field"):
        parse_sensor_line(json.dumps(payload))


# ----------------------------------------------------------------------
# Wrong types
# ----------------------------------------------------------------------
@pytest.mark.parametrize(
    "line",
    [
        '{"temperature":"hot","humidity":57.2,"light":642,"motion":true}',
        '{"temperature":28.6,"humidity":"wet","light":642,"motion":true}',
    ],
)
def test_non_numeric_environmental_values_raise(line):
    with pytest.raises(ProtocolError, match="field validation failed"):
        parse_sensor_line(line)


@pytest.mark.parametrize("bad", ['"yes"', "1", "0", "null"])
def test_non_boolean_motion_raises(bad):
    """motion must be a real boolean.

    Coercing "false"/0 would silently corrupt the occupancy signal.
    """
    line = f'{{"temperature":28.6,"humidity":57.2,"light":642,"motion":{bad}}}'
    with pytest.raises(ProtocolError, match="field validation failed"):
        parse_sensor_line(line)


@pytest.mark.parametrize("bad", ['"642"', "true", "null", "642.5"])
def test_non_integer_light_raises(bad):
    line = f'{{"temperature":28.6,"humidity":57.2,"light":{bad},"motion":true}}'
    with pytest.raises(ProtocolError, match="field validation failed"):
        parse_sensor_line(line)


def test_boolean_light_is_rejected():
    """True == 1 in Python; the parser must not silently accept it as light=1."""
    line = '{"temperature":28.6,"humidity":57.2,"light":true,"motion":true}'
    with pytest.raises(ProtocolError, match="field validation failed"):
        parse_sensor_line(line)


def test_nan_literal_is_rejected():
    """JSON NaN is not valid for our contract even though Python allows it."""
    line = '{"temperature":NaN,"humidity":57.2,"light":642,"motion":true}'
    with pytest.raises(ProtocolError):
        parse_sensor_line(line)


# ----------------------------------------------------------------------
# Out-of-range numeric values
# ----------------------------------------------------------------------
@pytest.mark.parametrize("temp", [-100, 200, -41.0, 81.0])
def test_temperature_out_of_range_raises(temp):
    line = f'{{"temperature":{temp},"humidity":57.2,"light":642,"motion":true}}'
    with pytest.raises(ProtocolError, match="field validation failed"):
        parse_sensor_line(line)


@pytest.mark.parametrize("hum", [-1, 101, 150.0])
def test_humidity_out_of_range_raises(hum):
    line = f'{{"temperature":28.6,"humidity":{hum},"light":642,"motion":true}}'
    with pytest.raises(ProtocolError, match="field validation failed"):
        parse_sensor_line(line)


@pytest.mark.parametrize("light", [-1, 1024, 5000])
def test_light_out_of_range_raises(light):
    line = f'{{"temperature":28.6,"humidity":57.2,"light":{light},"motion":true}}'
    with pytest.raises(ProtocolError, match="field validation failed"):
        parse_sensor_line(line)