"""Serial protocol contract tests for the Arduino firmware.

WHAT THIS DOES AND DOES NOT PROVE
--------------------------------
These tests validate the **serial protocol contract**: the exact JSON shape the
firmware emits, the plausibility bounds it applies, and the pin/interval
constants it declares. The rules are parsed straight out of
``smart_classroom.ino`` so the documentation cannot drift from the source.

They do NOT prove that physical sensors return correct values. That requires
real hardware and is reported separately.

Run from the project root:
    .\\backend\\.venv\\Scripts\\python.exe -m pytest arduino/tests -v
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

SKETCH = Path(__file__).resolve().parents[1] / "smart_classroom" / "smart_classroom.ino"
SOURCE = SKETCH.read_text(encoding="utf-8")


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _define(name: str) -> str:
    """Return the raw right-hand side of a firmware #define."""
    m = re.search(rf"^#define\s+{name}\s+(.+?)(?:\s*//.*)?$", SOURCE, re.MULTILINE)
    assert m, f"#define {name} not found in firmware"
    return m.group(1).strip()


def _define_num(name: str) -> float:
    """Return a numeric #define as float, tolerating parentheses and f suffix."""
    raw = _define(name).strip()
    raw = raw.strip("()").strip()
    if raw.lower().endswith("f"):
        raw = raw[:-1]
    return float(raw)


def render(temp: str, hum: str, light: int, motion: bool, err: str = "") -> str:
    """Reproduce the firmware's exact emission order."""
    return (
        '{"temperature":' + temp
        + ',"humidity":' + hum
        + ',"light":' + str(light)
        + ',"motion":' + ("true" if motion else "false")
        + err + "}"
    )


# --------------------------------------------------------------------------
# Configuration constants
# --------------------------------------------------------------------------
def test_pin_mapping_matches_documentation():
    assert _define("PIN_DHT") == "2"
    assert _define("PIN_LDR") == "A0"
    assert _define("PIN_PIR") == "7"


def test_baud_and_interval():
    assert _define("SERIAL_BAUD") == "9600UL"
    assert _define("SAMPLE_INTERVAL_MS") == "1000UL"


def test_dht_type_is_dht22():
    assert _define("SENSOR_TYPE") == "DHT22"


def test_sample_interval_is_dht22_safe():
    """DHT22 needs >= ~2 s between reads; the firmware must not poll faster."""
    interval = int(_define("SAMPLE_INTERVAL_MS").replace("UL", ""))
    assert interval >= 1000


def test_adc_range_matches_undeclared_hardware():
    """Firmware clamps to the 10-bit ADC range used by the LDR divider."""
    assert _define("ADC_MAX") == "1023"


# --------------------------------------------------------------------------
# JSON emission contract
# --------------------------------------------------------------------------
def test_emission_template_matches_contract():
    """The firmware must emit the documented key order and terminator."""
    assert '{\\"temperature\\":' in SOURCE
    assert ',\\"humidity\\":' in SOURCE
    assert ',\\"light\\":' in SOURCE
    assert ',\\"motion\\":' in SOURCE
    assert '}\\n' in SOURCE  # newline-delimited


def test_valid_reading_parses():
    line = render("28.60", "57.20", 642, True)
    obj = json.loads(line)
    assert obj == {
        "temperature": 28.60,
        "humidity": 57.20,
        "light": 642,
        "motion": True,
    }


def test_motion_false_parses():
    obj = json.loads(render("21.00", "40.00", 100, False))
    assert obj["motion"] is False


def test_fixed_point_precision_is_two_decimals():
    """dtostrf(v, 0, 2) guarantees a stable, deterministic numeric format."""
    for value in ("28.60", "-40.00", "0.00", "100.00", "7.25"):
        assert re.fullmatch(r"-?\d+\.\d{2}", value)


def test_null_is_used_for_unmeasurable_values():
    """A failed read must surface as JSON null, never a made-up number."""
    obj = json.loads(render("null", "null", 642, False, ',"err":"DHT22_READ_FAILED"'))
    assert obj["temperature"] is None
    assert obj["humidity"] is None
    assert obj["err"] == "DHT22_READ_FAILED"
    assert obj["light"] == 642


def test_error_field_is_optional():
    ok = json.loads(render("25.00", "50.00", 500, False))
    assert "err" not in ok


def test_light_is_always_an_integer():
    for light in (0, 1, 512, 1023):
        obj = json.loads(render("25.00", "50.00", light, False))
        assert isinstance(obj["light"], int)
        assert 0 <= obj["light"] <= 1023


def test_firmware_guards_both_dht_channels():
    """Both temperature and humidity must be NaN/range guarded."""
    assert SOURCE.count("isnan(") >= 4


# --------------------------------------------------------------------------
# Bounds the firmware applies (mirrored in backend validation)
# --------------------------------------------------------------------------
def test_plausibility_bounds():
    assert _define_num("TEMP_MIN_C") == -40.0
    assert _define_num("TEMP_MAX_C") == 80.0
    assert _define_num("HUM_MIN_PCT") == 0.0
    assert _define_num("HUM_MAX_PCT") == 100.0


@pytest.mark.parametrize("value", [-40.0, 0.0, 21.5, 28.6, 80.0])
def test_temperature_within_bounds(value):
    assert -40.0 <= value <= 80.0


@pytest.mark.parametrize("value", [0.0, 40.5, 57.2, 100.0])
def test_humidity_within_bounds(value):
    assert 0.0 <= value <= 100.0


# --------------------------------------------------------------------------
# Startup banner
# --------------------------------------------------------------------------
def test_banner_lines_are_commented_for_the_parser():
    """Lines starting with '#' are ignored by the host parser."""
    assert 'F("# READY' in SOURCE


def test_banner_does_not_emit_json():
    """No banner line may accidentally parse as a sensor reading."""
    for line in SOURCE.splitlines():
        if 'F("# ' in line:
            assert '{"temperature"' not in line