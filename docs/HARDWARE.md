# Hardware Guide

## Bill of Materials

| # | Component | Purpose | Interface |
| --- | --- | --- | --- |
| 1 | Arduino Uno (ATmega328P) | Reads sensors, emits JSON over USB | USB (built-in) |
| 2 | DHT22 / AM2302 | Temperature + humidity | 1-wire data |
| 3 | LDR (GL5528) + 10 kΩ resistor | Light intensity | Voltage divider → analog |
| 4 | HC-SR501 PIR | Motion detection | Digital |

### Accessories

- Breadboard + jumper wires
- USB **data** cable (charge-only cables will not enumerate a COM port)
- 10 kΩ resistor (for the LDR divider)

---

## Wiring

| Sensor | Sensor pin | Arduino pin | Notes |
| --- | --- | --- | --- |
| DHT22 | `VCC` | `5V` | |
| DHT22 | `DATA` | `D2` | 10 kΩ pull-up resistor to `VCC` |
| DHT22 | `GND` | `GND` | |
| LDR | leg A | `5V` | |
| LDR | leg B | `A0` | Junction point |
| Resistor 10 kΩ | leg A | `A0` | Junction point |
| Resistor 10 kΩ | leg B | `GND` | Divider → `A0` |
| HC-SR501 | `VCC` | `5V` | |
| HC-SR501 | `OUT` | `D7` | |
| HC-SR501 | `GND` | `GND` | |

```text
        5V                5V
         │                 │
       [ LDR ]          [ DHT22 VCC ]
         │                 │
         ├──── A0 ────┐  [ DHT22 DATA ] ── D2 (+10k pull-up to 5V)
         │            │  [ DHT22 GND  ] ── GND
      [ 10kΩ ]        │
         │           [ PIR VCC ] ── 5V
        GND          [ PIR OUT ] ── D7
                     [ PIR GND ] ── GND
```

> **Note on the DHT22 pull-up:** most DHT22 breakout boards already include the
> pull-up resistor. If readings are unstable or always return `NaN`, add a
> discrete 10 kΩ resistor between `D2` and `5V`.

> **Note on the HC-SR501:** it ships with two potentiometers — *sensitivity* and
> *time delay*. A short delay (a few seconds) is usually best for occupancy work.

---

## Serial Protocol

The firmware emits **one JSON object per line** (`\n`-delimited), newline-delimited
JSON — easy to parse, human-readable, and robust.

```json
{"temperature": 28.6, "humidity": 57.2, "light": 642, "motion": true}
```

| Field | Type | Unit | Range (validated) |
| --- | --- | --- | --- |
| `temperature` | float | °C | −40 … 80 |
| `humidity` | float | % RH | 0 … 100 |
| `light` | int | ADC counts | 0 … 1023 |
| `motion` | bool | — | `true` / `false` |

Additionally a startup banner is printed, e.g.:

```text
# Smart Classroom Firmware v1.0.0
# DHT22=D2 LDR=A0 PIR=D7 INTERVAL_MS=1000
```

Lines beginning with `#` are treated as informational and ignored by the parser.

### Frame rate

Default sampling interval is **1000 ms**. The DHT22 cannot be polled faster than
roughly every 2 seconds without corrupting readings, so 1 s is a safe default.

---

## Upload Procedure (Arduino IDE)

1. Install **Arduino IDE 1.8+** or **Arduino IDE 2.x**.
2. Install the **DHT sensor library**:
   - Library Manager → search `DHT sensor library` → install
     *by Adafruit* (the backend parser expects its `DHT`/`DHT22` API).
3. Open `arduino/smart_classroom/smart_classroom.ino`.
4. Select **Tools → Board → Arduino Uno**.
5. Select **Tools → Port →** the detected `Arduino Uno (COMx)`.
6. Click **Verify** to compile, then **Upload**.
7. Open the Serial Monitor at **9600 baud** to confirm output.

### Important: the website does NOT use the Serial Monitor

After upload, **close the Arduino IDE Serial Monitor**. The Serial Monitor holds
the port open exclusively, which prevents `pyserial` from opening it.

The production path is:

```text
Arduino ──USB──> Python / pyserial ──WebSocket──> React
```

The Arduino keeps running standalone firmware with no IDE attached.

---

## Verifying the port

```powershell
# Should list "Arduino Uno (COMx)" (not Bluetooth pseudo-ports)
Get-PnpDevice -Class Ports | Format-Table Status, FriendlyName
```

> On Windows, Bluetooth creates virtual serial ports (e.g. `COM3`, `COM4`).
> The backend's auto-detection filters these out, but if two Arduino boards are
> connected simultaneously you may need to set `SERIAL_PORT` explicitly in
> `backend/.env`.