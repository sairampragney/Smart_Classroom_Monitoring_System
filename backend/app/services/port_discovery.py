"""Serial port discovery.

Design goals (college demo runs on Windows / Dell Latitude 5490):
  * never hardcode a port - COM3 on a typical Windows laptop is a **Bluetooth
    pseudo-port**, not an Arduino;
  * prefer genuine Arduino/USB-serial hardware by USB VID/PID;
  * never guess dangerously - ambiguity is surfaced as an explicit log and the
    user can pin the port with ``SERIAL_PORT`` / ``ARDUINO_PORT``;
  * degrade gracefully when pyserial is unavailable or no ports exist.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.logging_config import get_logger

logger = get_logger(__name__)

# USB vendor IDs of boards/adapters commonly seen in classroom hardware.
#   0x2341 Arduino SA (official Uno/Mega)
#   0x1A86 WCH      (CH340 / CH341 clones)
#   0x10C4 Silicon Labs (CP210x)
#   0x0403 FTDI     (FT232)
#   0x1B4F SparkFun
ARDUINO_VENDOR_IDS = frozenset({0x2341, 0x1A86, 0x10C4, 0x0403, 0x1B4F})

ARDUINO_KEYWORDS = ("arduino", "uno", "mega", "nano", "duemilanove", "genuino")

BLUETOOTH_KEYWORDS = ("bluetooth", "bthenum", "standard serial over bluetooth")


@dataclass(frozen=True)
class PortInfo:
    """A discovered serial port with a confidence score."""

    device: str
    description: str = ""
    hwid: str = ""
    vid: int | None = None
    pid: int | None = None
    score: int = 0

    @property
    def is_bluetooth(self) -> bool:
        blob = f"{self.description} {self.hwid}".lower()
        return any(k in blob for k in BLUETOOTH_KEYWORDS)

    @property
    def is_arduino_likely(self) -> bool:
        return self.score >= 50

    def as_dict(self) -> dict:
        return {
            "device": self.device,
            "description": self.description,
            "hwid": self.hwid,
            "vid": self.vid,
            "pid": self.pid,
            "score": self.score,
            "is_bluetooth": self.is_bluetooth,
            "is_arduino_likely": self.is_arduino_likely,
        }


def _score(device: str, description: str, hwid: str, vid: int | None, pid: int | None) -> int:
    """Higher is more likely to be the classroom Arduino."""
    blob = f"{description} {hwid}".lower()

    # Bluetooth virtual ports must never win.
    if any(k in blob for k in BLUETOOTH_KEYWORDS):
        return 0

    score = 10
    if vid in ARDUINO_VENDOR_IDS:
        score += 60
    if any(k in blob for k in ARDUINO_KEYWORDS):
        score += 50
    if device.upper().startswith("COM"):
        score += 5
    return score


def list_ports() -> list[PortInfo]:
    """Enumerate serial ports, best candidates first.

    Never raises: an unavailable or empty port list yields ``[]``.
    """
    try:
        from serial.tools import list_ports as _lp
    except Exception as exc:  # noqa: BLE001 - pyserial optional at import time
        logger.warning("pyserial port enumeration unavailable: %s", exc)
        return []

    try:
        found: list[PortInfo] = []
        for p in _lp.comports():
            info = PortInfo(
                device=p.device,
                description=p.description or "",
                hwid=p.hwid or "",
                vid=p.vid,
                pid=p.pid,
            )
            found.append(
                PortInfo(
                    device=info.device,
                    description=info.description,
                    hwid=info.hwid,
                    vid=info.vid,
                    pid=info.pid,
                    score=_score(
                        info.device, info.description, info.hwid, info.vid, info.pid
                    ),
                )
            )
        # Stable ordering: score desc, then device name for determinism.
        found.sort(key=lambda i: (-i.score, i.device))
        return found
    except Exception as exc:  # noqa: BLE001
        logger.warning("Serial port enumeration failed: %s", exc)
        return []


def discover_arduino_port() -> tuple[str | None, list[PortInfo]]:
    """Pick the most likely Arduino port.

    Returns:
        ``(device, all_ports)``. ``device`` is ``None`` when nothing looks like
        an Arduino - the caller must then report DISCONNECTED rather than
        connecting to an arbitrary port.
    """
    ports = list_ports()
    if not ports:
        logger.info("Scanning serial ports... none found")
        return None, []

    candidates = [p for p in ports if not p.is_bluetooth and p.is_arduino_likely]
    if not candidates:
        logger.warning(
            "Scanning serial ports... %d port(s) present but no Arduino candidate "
            "(bluetooth pseudo-ports are excluded): %s",
            len(ports),
            ", ".join(f"{p.device} [{p.description}]" for p in ports),
        )
        return None, ports

    best = candidates[0]
    if len(candidates) > 1:
        # Ambiguity is reported, never silently resolved by luck.
        logger.warning(
            "Multiple Arduino candidates (%s); using %s. Pin the port with "
            "SERIAL_PORT if this is wrong.",
            ", ".join(c.device for c in candidates),
            best.device,
        )
    logger.info("Arduino candidate found: %s (%s)", best.device, best.description)
    return best.device, ports