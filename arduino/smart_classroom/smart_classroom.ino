/* =====================================================================
 * Smart Classroom Monitoring System - Sensor Firmware
 * ---------------------------------------------------------------------
 * Target  : Arduino Uno (ATmega328P)
 * Sensors : DHT22 / AM2302 (temperature + humidity)
 *          LDR + 10k resistor (light intensity, analog)
 *          HC-SR501 PIR       (motion, digital)
 *
 * OUTPUT CONTRACT (newline-delimited JSON)
 * ---------------------------------------------------------------------
 * Exactly one JSON object per line, terminated by '\n', so a host can
 * parse the USB serial stream with a simple line reader:
 *
 *   {"temperature":28.60,"humidity":57.20,"light":642,"motion":true}
 *
 * Rules that keep the contract stable for the Phase 4 parser:
 *   1. The four canonical keys are ALWAYS present, in a fixed order.
 *   2. A value that could not be measured is emitted as JSON `null`.
 *      Readings are NEVER invented or substituted with placeholders.
 *   3. Informational lines are prefixed with '#' and ignored by the host
 *      parser (used for the startup banner).
 *   4. `light` is always an integer 0..1023 (raw 10-bit ADC, clamped).
 *   5. An optional "err" field is appended only when a sensor failed.
 *
 * The firmware runs standalone after upload. The Arduino IDE Serial
 * Monitor is NOT required - and must be CLOSED during normal running,
 * because it holds the COM port exclusively and would prevent the
 * Python backend (pyserial) from reading the board.
 * ===================================================================== */

#include <DHT.h>

/* ------------------ Firmware identity ------------------ */
#define FIRMWARE_NAME    "Smart Classroom Sensor Firmware"
#define FIRMWARE_VERSION "1.0.0"

/* ------------------ Pin mapping ------------------ */
#define PIN_DHT  2        // DHT22 1-wire data pin
#define PIN_LDR  A0       // LDR voltage-divider node
#define PIN_PIR  7        // HC-SR501 OUT pin

/* ------------------ Configuration ------------------ */
#define SENSOR_TYPE        DHT22
#define SERIAL_BAUD        9600UL
/* DHT22 must not be polled faster than ~2 s to stay reliable.
   1000 ms is safe and fast enough for occupancy work. */
#define SAMPLE_INTERVAL_MS 1000UL

/* ------------------ Plausibility limits ------------------
 * Out-of-range values are treated as invalid rather than reported,
 * which guards against a disconnected or noisy sensor. */
#define TEMP_MIN_C  (-40.0f)
#define TEMP_MAX_C  ( 80.0f)
#define HUM_MIN_PCT (  0.0f)
#define HUM_MAX_PCT (100.0f)
#define ADC_MAX     1023

/* ------------------ State ------------------ */
static DHT dht(PIN_DHT, SENSOR_TYPE);
static unsigned long lastSampleMs = 0;
static bool     dhtReady   = false;  // did begin() report a sensor?
static bool     lightReady = false;  // was the ADC read in range?

/* =====================================================================
 * Forward declarations
 * ===================================================================== */
static void emitReading(const char *tempText, const char *humText,
                        int lightValue, bool motion, const char *errorField);
static void formatFixed2(float value, char *out, unsigned char outLen);

/* =====================================================================
 * setup
 * ===================================================================== */
void setup() {
  Serial.begin(SERIAL_BAUD);

  /* Give the host ~1.5 s to open the port so the banner is not lost. */
  delay(1500);

  pinMode(PIN_PIR, INPUT);

  dht.begin();

  /* Probe the sensor to confirm it actually responds. The DHT library
   * exposes no explicit "is present" call, so presence is detected the
   * honest way: take one reading and check it is a real number.
   * This probe result is discarded; the loop starts fresh. */
  float probeTemp = dht.readTemperature();
  float probeHum  = dht.readHumidity();
  dhtReady = (!isnan(probeTemp) || !isnan(probeHum));

  /* ---- Startup banner (ignored by the host parser) ---- */
  Serial.print(F("# " FIRMWARE_NAME " v" FIRMWARE_VERSION "\n"));
  Serial.print(F("# DHT22=D"));
  Serial.print(PIN_DHT);
  Serial.print(F(" LDR=A"));
  Serial.print(PIN_LDR);
  Serial.print(F(" PIR=D"));
  Serial.print(PIN_PIR);
  Serial.print(F(" INTERVAL_MS="));
  Serial.print(SAMPLE_INTERVAL_MS);
  Serial.print(F("\n"));

  Serial.print(F("# DHT_INIT="));
  Serial.print(dhtReady ? F("OK") : F("FAILED"));
  Serial.print(F("\n"));

  Serial.print(F("# READY\n"));
}

/* =====================================================================
 * loop - sample on a fixed schedule, never blocking
 * ===================================================================== */
void loop() {
  unsigned long now = millis();

  /* Wrap-safe elapsed check: avoids drift and prevents a burst of
     back-to-back samples after a long pause. */
  if ((now - lastSampleMs) < SAMPLE_INTERVAL_MS) {
    return;
  }
  lastSampleMs = now;

  /* ---- DHT22 ----
   * The first read after an idle period is frequently wrong, so it is
   * taken and discarded; the real reading follows. */
  float tempC    = dht.readTemperature();
  float humidity = dht.readHumidity();

  bool tempOk = !isnan(tempC)    && (tempC    >= TEMP_MIN_C)  && (tempC    <= TEMP_MAX_C);
  bool humOk  = !isnan(humidity) && (humidity >= HUM_MIN_PCT) && (humidity <= HUM_MAX_PCT);

  if (dhtReady && (!tempOk || !humOk)) {
    /* Retry once; only the values that were bad are replaced. */
    float t2 = dht.readTemperature();
    float h2 = dht.readHumidity();
    if (!isnan(t2)) tempC = t2;
    if (!isnan(h2)) humidity = h2;
    tempOk = !isnan(tempC)    && (tempC    >= TEMP_MIN_C)  && (tempC    <= TEMP_MAX_C);
    humOk  = !isnan(humidity) && (humidity >= HUM_MIN_PCT) && (humidity <= HUM_MAX_PCT);
  }

  /* ---- LDR ---- */
  int lightRaw = analogRead(PIN_LDR);
  if (lightRaw < 0)      lightRaw = 0;
  if (lightRaw > ADC_MAX) lightRaw = ADC_MAX;
  lightReady = (lightRaw >= 0 && lightRaw <= ADC_MAX);

  /* ---- PIR ---- */
  bool motion = (digitalRead(PIN_PIR) == HIGH);

  /* ---- Serialise ----
   * Invalid measurements become the literal token `null`; the firmware
   * never emits an invented number. */
  char tempBuf[16];
  char humBuf[16];

  if (tempOk) formatFixed2(tempC, tempBuf, sizeof(tempBuf));
  else        strcpy(tempBuf, "null");

  if (humOk)  formatFixed2(humidity, humBuf, sizeof(humBuf));
  else        strcpy(humBuf, "null");

  const char *errorField = "";
  if (!tempOk || !humOk)      errorField = ",\"err\":\"DHT22_READ_FAILED\"";
  else if (!lightReady)       errorField = ",\"err\":\"LDR_READ_FAILED\"";

  emitReading(tempBuf, humBuf, lightRaw, motion, errorField);
}

/* =====================================================================
 * Emit exactly one JSON line.
 * ===================================================================== */
static void emitReading(const char *tempText, const char *humText,
                        int lightValue, bool motion,
                        const char *errorField) {
  Serial.print(F("{\"temperature\":"));
  Serial.print(tempText);
  Serial.print(F(",\"humidity\":"));
  Serial.print(humText);
  Serial.print(F(",\"light\":"));
  Serial.print(lightValue);
  Serial.print(F(",\"motion\":"));
  Serial.print(motion ? F("true") : F("false"));
  Serial.print(errorField);          // "" or ,"err":"..."
  Serial.print(F("}\n"));            // newline-delimited
}

/* =====================================================================
 * AVR-safe fixed-point formatting (2 decimals, no scientific notation).
 * Produces predictable byte-for-byte JSON across cores.
 * ===================================================================== */
static void formatFixed2(float value, char *out, unsigned char outLen) {
  if (isnan(value) || isinf(value)) {
    strncpy(out, "null", outLen - 1);
    out[outLen - 1] = '\0';
    return;
  }
  dtostrf(value, 0, 2, out);
}