# Arduino Firmware (Phase 3)

Target: **Arduino Uno (ATmega328P)** · Library: **DHT sensor library 1.4.7**

Source: [`arduino/smart_classroom/smart_classroom.ino`](../arduino/smart_classroom/smart_classroom.ino)

---

## 1. Components

| Sensor | Measures | Arduino pin | Library |
| --- | --- | --- | --- |
| DHT22 / AM2302 | temperature, humidity | `D2` | DHT sensor library |
| LDR + 10 kΩ | light intensity | `A0` | built-in `analogRead` |
| HC-SR501 PIR | motion | `D7` | built-in `digitalRead` |

---

## 2. Wiring

```text
   5V            5V
    │             │
  [ LDR ]     [ DHT22 VCC ]
    │             │
    ├──── A0 ┐  [ DHT22 DATA ] ── D2
    │         │  [ DHT22 GND  ] ── GND
 [10kΩ]       │
    │        [ PIR VCC ] ── 5V
   GND       [ PIR OUT ] ── D7
             [ PIR GND ] ── GND
```

| From | To |
| --- | --- |
| DHT22 `VCC` / `DATA` / `GND` | `5V` / `D2` / `GND` |
| LDR leg A | `5V` |
| LDR leg B → 10 kΩ → `GND`, junction → `A0` | `A0` |
| HC-SR501 `VCC` / `OUT` / `GND` | `5V` / `D7` / `GND` |

**Notes**

- Most DHT22 breakout boards already include the 10 kΩ pull-up. Add a discrete
  10 kΩ between `D2` and `5V` only if readings are `null` or unstable.
- The HC-SR501 has two trimmers: *sensitivity* and *time delay*. A short delay
  is usually best for occupancy work.

---

## 3. Required library

Install **DHT sensor library** (by Adafruit) — 1.4.7 is what this firmware was
compiled against.

- **Arduino IDE:** Library Manager → search `DHT sensor library` → Install.
  It pulls in `Adafruit Unified Sensor` automatically.
- **Arduino CLI:** `arduino-cli lib install "DHT sensor library"`

---

## 4. Compile and upload

**Arduino IDE**

1. Open `arduino/smart_classroom/smart_classroom.ino`
2. **Tools → Board → Arduino Uno**
3. **Tools → Port →** `Arduino Uno (COMx)`
4. **Verify**, then **Upload**

**Arduino CLI**

```powershell
arduino-cli compile --fqbn arduino:avr:uno arduino\smart_classroom
arduino-cli compile --fqbn arduino:avr:uno -u arduino/smart_classroom
```

Verified build for `arduino:avr:uno`:

```text
Sketch uses 7406 bytes (22%) of program storage space. Maximum is 32256 bytes.
Global variables use 267 bytes (13%) of dynamic memory, leaving 1781 bytes
for local variables. Maximum is 2048 bytes.
```

Clean with `--warnings all` (zero warnings).

---

## 5. Serial protocol (newline-delimited JSON)

One JSON object per line, `\n`-terminated:

```json
{"temperature":28.60,"humidity":57.20,"light":642,"motion":true}
```

| Field | Type | Unit | Valid range |
| --- | --- | --- | --- |
| `temperature` | float or `null` | °C | −40 … 80 |
| `humidity` | float or `null` | % RH | 0 … 100 |
| `light` | int | ADC counts | 0 … 1023 |
| `motion` | bool | — | `true` / `false` |
| `err` | string *(optional)* | — | see below |

### Rules the host parser can rely on

1. The four canonical keys are **always present, in a fixed order**.
2. A value that could not be measured is emitted as JSON **`null`**.
   The firmware **never** invents or substitutes a value.
3. Lines beginning with `#` are informational and must be ignored.
4. `light` is always an integer in `0…1023` (raw 10-bit ADC, clamped).
5. `err` appears **only** when a sensor failed:
   `"DHT22_READ_FAILED"` or `"LDR_READ_FAILED"`.

### Startup banner

```text
# Smart Classroom Sensor Firmware v1.0.0
# DHT22=D2 LDR=A0 PIR=D7 INTERVAL_MS=1000
# DHT_INIT=OK
# READY
```

`# DHT_INIT=FAILED` means no DHT responded to the startup probe; the firmware
still runs and emits readings with `null` values.

### Example stream

```text
{"temperature":28.60,"humidity":57.20,"light":642,"motion":false}
{"temperature":28.62,"humidity":57.10,"light":655,"motion":true}
{"temperature":null,"humidity":null,"light":651,"motion":false,"err":"DHT22_READ_FAILED"}
```

---

## 6. Important: the website does NOT use the Serial Monitor

After uploading, **close the Arduino IDE Serial Monitor**. It holds the COM
port exclusively and will prevent the Python backend from opening it.

Production path:

```text
Arduino ──USB──> Python / pyserial ──WebSocket──> React
```

The board runs standalone firmware; no IDE needs to stay open. "RUN PROGRAM"
in the UI only starts monitoring — it never uploads firmware.

---

## 7. Sampling behaviour

- Interval **1000 ms**, enforced with a wrap-safe `millis()` check
  (`now - lastSampleMs`) — no drift, and no burst of catch-up samples after a
  long pause.
- The DHT22 needs ≥ ~2 s between reads; 1 s is a safe operating point.
- The first DHT read after an idle period is commonly wrong, so a **single
  retry** runs when a value is invalid or out of range.
- Only failed values are replaced by the retry; good values are kept.
- Readings outside −40…80 °C, 0…100 % RH are rejected as implausible.
- `light` is clamped to the 10-bit ADC range 0…1023.

---

## 8. Contract tests

The protocol is verified by tests that parse the rules directly out of the
`.ino`, so documentation cannot silently drift from firmware:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest arduino\tests -v
```

25 tests covering pin mapping, baud/interval, JSON key order, `null` handling,
the `err` field, fixed-point precision, plausibility bounds, and banner safety.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Board not listed in Tools → Port | Use a **data** USB cable, not a charge-only one. Try another USB port. |
| `temperature`/`humidity` always `null` | DHT not responding. Check `DATA`→`D2`, add the 10 kΩ pull-up, confirm `# DHT_INIT=OK`. |
| `# DHT_INIT=FAILED` | No DHT responded to the startup probe — check the 3-wire connection and power. |
| Light stuck at 0 or 1023 | LDR divider wiring wrong, or sensor shorted/open. Check the 10 kΩ and the `A0` junction. |
| Light always high | Bright room, or swap the LDR and resistor legs. |
| PIR always `true` | Sensitivity too high or output floating. Turn the sensitivity trimmer down. |
| PIR always `false` | OUT wired to the wrong header, or retrigger delay too short. |
| Compile error `no member named 'getSensor'` | Wrong DHT library. This firmware targets **DHT sensor library 1.4.x**, which exposes only `begin/read/readTemperature/readHumidity`. |
| `Port is busy` when the backend starts | Arduino IDE Serial Monitor is still open — close it. Only one program can hold a COM port. |
| Garbled characters in Serial Monitor | Set the monitor baud to **9600**. |
| Nothing in Serial Monitor | Press reset once the monitor is open; the banner is emitted ~1.5 s after boot. |

---

## 10. Hardware verification status

The firmware was **compiled successfully for `arduino:avr:uno`** and its serial
protocol is covered by automated contract tests.

**Physical sensor testing was NOT performed** — no Arduino and no sensors were
connected while this phase was written. Real DHT22, LDR, and HC-SR501 readings
have therefore not been observed.