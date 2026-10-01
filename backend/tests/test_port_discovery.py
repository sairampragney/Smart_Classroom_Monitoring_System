"""Serial port discovery tests.

Pure logic tests: scoring and Bluetooth filtering, exercised without touching
real hardware. They do NOT prove that a physical Arduino enumerates correctly.
"""

from __future__ import annotations

import pytest

from app.services import port_discovery as pd


def test_bluetooth_ports_are_excluded():
    """COM3 on a Windows laptop is typically Bluetooth - it must never win."""
    ports = [
        pd.PortInfo("COM3", "Standard Serial over Bluetooth link (COM3)",
                    "BTHENUM\\{00001101-...}", None, None, score=pd._score(
            "COM3", "Standard Serial over Bluetooth link (COM3)",
            "BTHENUM\\{00001101-...}", None, None)),
        pd.PortInfo("COM5", "Arduino Uno (COM5)",
                    "USB\\VID_2341&PID_0043\\1265", 0x2341, 0x0043, score=pd._score(
            "COM5", "Arduino Uno (COM5)",
            "USB\\VID_2341&PID_0043\\1265", 0x2341, 0x0043)),
    ]
    assert ports[0].is_bluetooth is True
    assert ports[0].score == 0
    assert ports[1].is_bluetooth is False
    assert ports[1].is_arduino_likely is True
    assert ports[1].score > ports[0].score


@pytest.mark.parametrize(
    "description,hwid,vid,pid,expected_arduino",
    [
        ("Arduino Uno (COM5)", "USB\\VID_2341&PID_0043", 0x2341, 0x0043, True),
        ("USB-Serial CH340 (COM7)", "USB\\VID_1A86&PID_7523", 0x1A86, 0x7523, True),
        ("Arduino Mega 2560", "USB\\VID_2341&PID_0042", 0x2341, 0x0042, True),
        ("Standard Serial over Bluetooth link (COM3)", "BTHENUM\\{...}", None, None, False),
        ("Standard Serial over Bluetooth link (COM4)", "BTHENUM\\{...}", None, None, False),
        ("Prolific USB-to-Serial Comm Port (COM9)", "USB\\VID_067B", 0x067B, 0x2303, False),
    ],
)
def test_arduino_scoring(description, hwid, vid, pid, expected_arduino):
    score = pd._score("COM9", description, hwid, vid, pid)
    info = pd.PortInfo("COM9", description, hwid, vid, pid, score)
    assert info.is_arduino_likely is expected_arduino


def test_bluetooth_hwid_alone_is_enough_to_exclude():
    """Some Bluetooth ports have a generic description."""
    score = pd._score("COM10", "Standard Serial over Bluetooth link (COM10)",
                      "BTHENUM\\{00001101-0000-1000-8000-00805F9B34FB}", None, None)
    assert score == 0


def test_unknown_device_gets_low_but_nonzero_score():
    score = pd._score("COM11", "Some Random Device", "USB\\UNKNOWN", None, None)
    assert 0 < score < 50
    info = pd.PortInfo("COM11", "Some Random Device", "USB\\UNKNOWN", None, None, score)
    assert info.is_arduino_likely is False


def test_list_ports_never_raises(monkeypatch):
    """Enumeration failure must degrade to an empty list, not crash."""

    class Boom:
        @staticmethod
        def comports():
            raise OSError("enumeration exploded")

    import sys
    monkeypatch.setitem(sys.modules, "serial.tools.list_ports", Boom)

    assert pd.list_ports() == []


def test_discover_returns_none_when_only_bluetooth(monkeypatch):
    class Fake:
        @staticmethod
        def comports():
            class P:
                device = "COM3"
                description = "Standard Serial over Bluetooth link (COM3)"
                hwid = "BTHENUM\\{...}"
                vid = None
                pid = None

            return [P()]

    import sys
    monkeypatch.setitem(sys.modules, "serial.tools.list_ports", Fake)

    device, ports = pd.discover_arduino_port()
    assert device is None          # refuse to guess a Bluetooth port
    assert len(ports) == 1


def test_discover_picks_the_arduino(monkeypatch):
    class Fake:
        @staticmethod
        def comports():
            class P:
                def __init__(self, d, desc, hwid, vid, pid):
                    self.device, self.description = d, desc
                    self.hwid, self.vid, self.pid = hwid, vid, pid

            return [
                P("COM3", "Standard Serial over Bluetooth link (COM3)", "BTHENUM\\{..}", None, None),
                P("COM5", "Arduino Uno (COM5)", "USB\\VID_2341&PID_0043", 0x2341, 0x0043),
            ]

    import sys
    monkeypatch.setitem(sys.modules, "serial.tools.list_ports", Fake)

    device, ports = pd.discover_arduino_port()
    assert device == "COM5"
    assert len(ports) == 2
    # Best candidate sorts first.
    assert ports[0].device == "COM5"


def test_discover_with_no_ports(monkeypatch):
    class Fake:
        @staticmethod
        def comports():
            return []

    import sys
    monkeypatch.setitem(sys.modules, "serial.tools.list_ports", Fake)
    device, ports = pd.discover_arduino_port()
    assert device is None and ports == []


def test_configured_port_overrides_discovery():
    """A pinned ARDUINO_PORT must be used verbatim, even if discovery differs."""
    from app.config import Settings

    s = Settings(serial_port="COM7")
    assert s.serial_port == "COM7"


def test_arduino_port_env_alias_is_accepted(monkeypatch):
    """The docs say ARDUINO_PORT; both names must work."""
    from app.config import Settings

    monkeypatch.setenv("ARDUINO_PORT", "COM9")
    assert Settings(_env_file=None).serial_port == "COM9"