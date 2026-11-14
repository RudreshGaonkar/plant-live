/**
 * LeafLink - Automated & Intelligent Plant-Watering Firmware
 * Target: NodeMCU v1.0 (ESP-12E Module / ESP8266)
 *
 * Spec Reference:
 * - Section 3: Hardware Pin Map & Components
 * - Section 8: Auto-watering Decision Engine & Fail-safes
 * - Section 9: ESP8266 Firmware Contract
 */

#include <ESP8266WiFi.h>
#include <WiFiManager.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include <DHT.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <time.h>
#include <Ticker.h>

// ==========================================
// 1. HARDWARE PIN DEFINITIONS (Spec §3.1)
// ==========================================
#define PIN_ANALOG_ADC     A0       // Soil Moisture Analog Input (Sole access to A0)
#define PIN_SOIL_ADC       PIN_ANALOG_ADC // Backward compatibility alias
#define PIN_DHT            14       // D5 / GPIO14: DHT11 Data Pin
#define PIN_RELAY          4        // D2 / GPIO4: Relay IN (Mini Submersible Pump - Safe standard GPIO)

// Safety check: Prevent assignment of relay to boot-strapping pins
#if (PIN_RELAY == 0) || (PIN_RELAY == 2) || (PIN_RELAY == 15)
#error "PIN_RELAY must not be assigned to boot-strapping pins GPIO0, GPIO2, or GPIO15!"
#endif
#define PIN_LDR            13       // D7 / GPIO13: LDR Module Digital Out (DO)
#define PIN_SOIL_PWR       16       // D0 / GPIO16: Soil Sensor Power Gating

#define DHTTYPE            DHT11

// Relay Logic: Most 5V relay modules are ACTIVE-LOW
#define RELAY_ON           LOW
#define RELAY_OFF          HIGH

// ==========================================
// 2. TIMING & SAFETY CONSTANTS (Spec §8, §9)
// ==========================================
#define TELEMETRY_INTERVAL_MS   10000UL     // 10 seconds: Telemetry & Heartbeat
#define HISTORY_INTERVAL_MS     300000UL    // 5 minutes: History snapshot append
#define AUTO_COOLDOWN_MS        1800000UL   // 30 minutes: Cooldown between auto watering cycles
#define MAX_PUMP_RUN_MS         15000UL     // 15 seconds: Hard hardware safety limit per run
#define DEFAULT_PUMP_SEC        5           // Default pump runtime in seconds
#define MIN_RESERVE_ML          20          // Low reservoir threshold in milliliters

// ==========================================
// 3. FIREBASE CONFIGURATION
// ==========================================
// NOTE: Set your Firebase project credentials below or configure via custom parameters
#define FIREBASE_HOST      "https://leaflink-7c669-default-rtdb.firebaseio.com/"
#define FIREBASE_API_KEY   "AIzaSyBV1o12illTDwQlw1K1kwYJ0QhIaipzZ7E"

// Device Identity: Unique Device ID (e.g., leaf-node-01 or generated from ESP ChipID)
const char deviceId[] = "leaf-node-01";
String deviceEmail = "leaf-node-01@devices.leaflink.local";
String devicePassword = "LeafLinkDeviceSecretKey123!";

// ==========================================
// 4. DEVICE CONFIGURATION & STATE STRUCT
// ==========================================
struct DeviceConfig {
  String mode = "auto";             // "auto" | "manual"
  String location = "balcony";       // "balcony" | "terrace" | "indoor"
  int moistureMin = 30;             // Default for balcony
  int moistureMax = 60;
  int tempMax = 35;
  int humidityMax = 80;
  int pumpDurationSec = 5;
  int waterDurationSec = 5;         // Configured water duration in seconds
  String lightMode = "digital";     // "none" | "digital" | "analog"
  int soilDryRaw = 1024;            // Sensor in air
  int soilWetRaw = 400;             // Sensor in water
  int bottleCapacityMl = 1000;
  int flowMlPerSec = 15;
  int remainingMl = 1000;
};

DeviceConfig config;

// Telemetry State
struct TelemetryData {
  int soilRaw = 600;
  float soilMoisture = 45.0;
  int waterRaw = 0;                 // Deprecated: analog water sensor removed
  int waterLevelPct = 0;            // Software-estimated water level percentage (0-100%)
  bool waterLevelLow = false;       // Low reservoir flag derived from the volume estimate
  int temperature = 28;
  int humidity = 65;
  int light = 1;                    // 1: Bright, 0: Dim (-1 if none/disabled)
  bool pumpOn = false;
  bool isPumpActive = false;
  long rssi = -60;
  unsigned long lastSeen = 0;
  unsigned long autoCooldownRemainingSec = 0;
};

TelemetryData telemetry;

// Pump Execution Tracking
bool isPumpActive = false;
unsigned long pumpStartTime = 0;
unsigned long pumpDurationLimit = 0;
String activeWaterTrigger = "manual";
float moistureBeforeWatering = 0.0;
String activeCommandId = "";
String lastProcessedCommandId = "";

// Loop Timers
unsigned long lastTelemetryMs = 0;
unsigned long lastHistoryMs = 0;
unsigned long lastAutoCycleMs = 0;

// Helper to compute remaining auto cooldown seconds from lastAutoCycleMs
unsigned long getAutoCooldownRemainingSec() {
  if (lastAutoCycleMs == 0) return 0;
  unsigned long now = millis();
  unsigned long elapsed = now - lastAutoCycleMs;
  if (elapsed >= AUTO_COOLDOWN_MS) {
    return 0;
  }
  return (AUTO_COOLDOWN_MS - elapsed) / 1000UL;
}

// Cloud Synchronization Flags
bool hasInitialConfigSynced = false;
unsigned long lastConfigPollMs = 0;
unsigned long lastCommandPollMs = 0;
bool hasUnsyncedReservoirChange = false; // Tracks unconfirmed offline/online reservoir water deductions

// Pending RTDB writes
bool flagTelemetryDirty = false;
bool flagAckDirty = false;
bool flagBottleDirty = false;
bool flagWaterLogDirty = false;
bool flagControlResetDirty = false;
unsigned long nextWriteAttempt = 0;
constexpr uint32_t TLS_MIN_FREE_HEAP = 12000;
constexpr uint32_t TLS_MIN_FREE_BLOCK = 6144;
constexpr uint32_t RTDB_WRITE_HEAP_HEADROOM = 14 * 1024;
String pendingAckId, pendingAckStatus, pendingAckReason;
int pendingAckCapacity = 0;
unsigned long completedRunSeconds = 0;

// Hardware Safety Cutoff Ticker
Ticker pumpSafetyTicker;
void IRAM_ATTR onPumpCutoff() {
  digitalWrite(PIN_RELAY, RELAY_OFF);
}

// Persistent Unsent Watering Log Buffer
struct PendingWaterLog {
  bool valid = false;
  String trigger;
  int durationSec = 0;
  float before = 0.0;
  float after = 0.0;
  String note;
};
PendingWaterLog pendingWaterLog;

void flushPendingWrites();
bool hasTlsHeap();
void publishPumpState(bool active);

// Hardware Instances
DHT dht(PIN_DHT, DHTTYPE);
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig fbConfig;
WiFiManager wm;

// Forward Declarations
void loadConfigFromFS();
bool saveConfigToFS();
void readSensors();
bool transmitTelemetry();
void appendHistorySnapshot();
void checkAutoWatering();
void startPump(int durationSec, String trigger, String cmdId = "");
void stopPump();
void pollControl();
void pollCommand();
void pollConfig();
void handleCommand(FirebaseJson &json);
void updateCommandAck(String cmdId, String status, String reason = "");
void logWateringEvent(String trigger, int durationSec, float before, float after, String note);

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println(F("\n====================================="));
  Serial.println(F(" LeafLink ESP8266 Firmware v1.0.4    "));
  Serial.println(F("====================================="));

  // 1. Hardware Pin Configurations
  // IMPORTANT: Ensure relay stays OFF during MCU initialization (active-LOW relay module).
  // Calling digitalWrite(PIN_RELAY, HIGH) BEFORE pinMode ensures internal pullup/high level is preset,
  // preventing any spurious pump pulse during firmware flash and boot.
  digitalWrite(PIN_RELAY, HIGH);
  pinMode(PIN_RELAY, OUTPUT);
  digitalWrite(PIN_RELAY, HIGH);

  pinMode(PIN_SOIL_PWR, OUTPUT);
  digitalWrite(PIN_SOIL_PWR, LOW);

  pinMode(PIN_LDR, INPUT);
  dht.begin();

  // 2. Initialize LittleFS & Load Offline Config
  if (!LittleFS.begin()) {
    Serial.println(F("[FS] LittleFS Mount Failed. Formatting..."));
    LittleFS.format();
    LittleFS.begin();
  }
  loadConfigFromFS();

  // 3. Prevent Device ID mutability: Keep consistent configured deviceId
  String chipId = String(ESP.getChipId(), HEX);
  chipId.toUpperCase();
  Serial.print(F("[INFO] Hardware Chip ID: "));
  Serial.println(chipId);
  Serial.print(F("[INFO] Active Device ID: "));
  Serial.println(deviceId);
  Serial.printf("[Identity] Active deviceId: %s | Command path: devices/%s/command\n", deviceId, deviceId);

  // 4. WiFiManager Setup (Captive Portal for initial setup)
  wm.setConfigPortalTimeout(300); // 5 minutes timeout to allow sufficient time for Wi-Fi setup
  String apName = "LeafLink-" + chipId;
  Serial.print(F("[WiFi] Connecting or launching AP: "));
  Serial.println(apName);

  // Large Device ID Display Notice on Captive Portal
  String htmlIdNotice = String("<div style='text-align:center; background:#e8f5e9; border:2px solid #2e7d32; border-radius:10px; padding:15px; margin-bottom:20px; font-family:sans-serif;'>"
                        "<span style='font-size:13px; color:#2e7d32; font-weight:bold; letter-spacing:1px; display:block;'>YOUR LEAFLINK DEVICE ID</span>"
                        "<strong style='font-size:26px; color:#1b5e20; display:block; margin-top:5px;'>") + deviceId + "</strong>"
                        "<small style='font-size:11px; color:#4caf50; margin-top:5px; display:block;'>Enter or auto-detect this ID in your LeafLink app</small>"
                        "</div>";
  WiFiManagerParameter custom_id_notice(htmlIdNotice.c_str());
  wm.addParameter(&custom_id_notice);

  // Serve Device Info Endpoint for Mobile App Auto-Detection
  wm.setWebServerCallback([](){
    wm.server->on("/api/info", [](){
      String jsonPayload = String("{\"deviceId\":\"") + deviceId + "\",\"chipId\":\"" + String(ESP.getChipId(), HEX) + "\"}";
      wm.server->sendHeader("Access-Control-Allow-Origin", "*");
      wm.server->send(200, "application/json", jsonPayload);
    });
  });

  if (!wm.autoConnect(apName.c_str(), "leafsetup")) {
    Serial.println(F("[WiFi] Failed to connect to AP. Proceeding in offline mode..."));
  } else {
    Serial.print(F("[WiFi] Connected! IP: "));
    Serial.println(WiFi.localIP());
  }

  // 5. NTP Time Synchronization
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.println(F("[NTP] Waiting for system clock sync..."));
  time_t now = time(nullptr);
  int retry = 0;
  while (now < 1600000000 && retry < 4) {
    delay(500);
    now = time(nullptr);
    retry++;
  }
  if (now >= 1600000000) {
    Serial.print(F("[NTP] Synced UNIX Epoch: "));
    Serial.println(now);
  } else {
    Serial.println(F("[NTP] Clock unavailable after 2 seconds; continuing boot"));
  }

  // 6. Firebase Initialization
  fbConfig.host = FIREBASE_HOST;
  fbConfig.api_key = FIREBASE_API_KEY;

  // Use device user account or anonymous auth for device contract
  auth.user.email = deviceEmail.c_str();
  auth.user.password = devicePassword.c_str();

  fbConfig.token_status_callback = tokenStatusCallback;
  fbConfig.cert.data = nullptr; // Clock-independent TLS; Firebase account auth remains enabled.

  // Size BearSSL buffers for the Firebase TLS handshake (reduced to prevent heap exhaustion)
  // FirebaseData applies these sizes to its internal BearSSL client.
  fbdo.setBSSLBufferSize(4096, 1024);
  fbdo.setResponseSize(1024);

  Firebase.begin(&fbConfig, &auth);
  Firebase.RTDB.setReadTimeout(&fbdo, 10000);
  Firebase.RTDB.setwriteSizeLimit(&fbdo, "tiny");
  Firebase.reconnectWiFi(true);


  // First sensor read
  readSensors();
  flagTelemetryDirty = true;
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  unsigned long currentMs = millis();

  // 1. Independent Hardware Cutoff (Must run at the very top of loop())
  // Ensure MAX_PUMP_RUN_MS (15 seconds) and pumpDurationLimit cutoff check runs at the
  // very top of loop() before any network checks so a stalled Wi-Fi or Firebase
  // call can NEVER delay turning PIN_RELAY HIGH (RELAY_OFF).
  if (isPumpActive) {
    if ((currentMs - pumpStartTime >= pumpDurationLimit) || (currentMs - pumpStartTime >= MAX_PUMP_RUN_MS)) {
      digitalWrite(PIN_RELAY, RELAY_OFF);
      stopPump();
    }
  }

  // 2. Safety: Immediately shut off pump if WiFi drops during active run
  if (WiFi.status() != WL_CONNECTED && isPumpActive) {
    Serial.println(F("[SAFETY] WiFi connection lost during pump run! Shutting off pump."));
    digitalWrite(PIN_RELAY, RELAY_OFF);
    stopPump();
  }

  // Keep synchronous network I/O outside the relay-on interval.
  if (isPumpActive) {
    yield();
    return;
  }

  if (currentMs - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = currentMs;
    readSensors();
    flagTelemetryDirty = true;
  }

  if (WiFi.status() == WL_CONNECTED && Firebase.ready()) {
    // Prioritize commands before lower-frequency configuration and telemetry traffic.
    if (!isPumpActive && !flagControlResetDirty &&
        currentMs - lastCommandPollMs >= 1500UL && hasTlsHeap()) {
      lastCommandPollMs = currentMs;
      pollCommand();
      fbdo.clear();
    }

    flushPendingWrites();

    if ((lastConfigPollMs == 0 || currentMs - lastConfigPollMs >= 10000UL) && hasTlsHeap()) {
      lastConfigPollMs = currentMs;
      pollConfig();
      if (!flagControlResetDirty) pollControl();
      fbdo.clear();
    }
  }

  // 6. Embedded Autonomous Auto-Watering Engine (Spec §8.1)
  if (!isPumpActive) {
    checkAutoWatering();
  }

  yield();
}

// ==========================================
// SENSOR READING & CALIBRATION (Spec §8.4)
// ==========================================
void readSensors() {
  // 1. Read Soil Sensor with Power Gating (Sole access to A0)
  // Skip soil moisture sampling while isPumpActive is true to avoid motor electrical noise
  if (!isPumpActive) {
    digitalWrite(PIN_SOIL_PWR, HIGH);
    delay(25); // Allow capacitor and analog circuitry to stabilize

    // 16-sample median filter on A0 for ADC stability
    const int numSamples = 16;
    int rawSamples[numSamples];
    for (int i = 0; i < numSamples; i++) {
      rawSamples[i] = analogRead(PIN_ANALOG_ADC);
      delay(5);
    }
    digitalWrite(PIN_SOIL_PWR, LOW); // Turn off power to soil sensor

    // Bubble sort samples for median calculation
    for (int i = 0; i < numSamples - 1; i++) {
      for (int j = i + 1; j < numSamples; j++) {
        if (rawSamples[i] > rawSamples[j]) {
          int temp = rawSamples[i];
          rawSamples[i] = rawSamples[j];
          rawSamples[j] = temp;
        }
      }
    }
    // Median of 16 samples
    telemetry.soilRaw = (rawSamples[7] + rawSamples[8]) / 2;

    // Map to 0-100% moisture using stored calibration
    // Dry = 1024, Wet = 400 (or user-calibrated raw values)
    int span = config.soilDryRaw - config.soilWetRaw;
    if (span == 0) span = 1; // Prevent division by zero
    float calculatedPct = (float)(config.soilDryRaw - telemetry.soilRaw) * 100.0 / (float)span;
    telemetry.soilMoisture = constrain(calculatedPct, 0.0, 100.0);
  }

  // 2. Derive reservoir telemetry from the software volume estimate.
  telemetry.waterRaw = 0;
  telemetry.waterLevelLow = (config.remainingMl <= MIN_RESERVE_ML);
  if (config.bottleCapacityMl > 0) {
    telemetry.waterLevelPct = constrain((config.remainingMl * 100) / config.bottleCapacityMl, 0, 100);
  } else {
    telemetry.waterLevelPct = 0;
  }

  // 3. Read DHT11 Temperature & Humidity
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  // Guard against NaN: Retain last valid readings
  if (!isnan(h)) {
    telemetry.humidity = (int)round(h);
  }
  if (!isnan(t)) {
    telemetry.temperature = (int)round(t);
  }

  // 4. Read LDR Light Module
  if (config.lightMode == "digital") {
    // Digital LDR module pulls LOW when light is above potentiometer threshold
    telemetry.light = (digitalRead(PIN_LDR) == LOW) ? 1 : 0;
  } else {
    telemetry.light = -1; // Sensor not fitted / none
  }

  telemetry.rssi = WiFi.RSSI();
  telemetry.isPumpActive = (digitalRead(PIN_RELAY) == LOW);
  telemetry.pumpOn = telemetry.isPumpActive;
}

// ==========================================
// TELEMETRY TRANSMISSION (Spec §6)
// ==========================================
bool transmitTelemetry() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return false;

  char path[sizeof(deviceId) + sizeof("devices//telemetry") - 1];
  snprintf(path, sizeof(path), "devices/%s/telemetry", deviceId);
  FirebaseJson json;
  json.set("soilRaw", telemetry.soilRaw);
  json.set("soilMoisture", (int)round(telemetry.soilMoisture));
  json.set("waterRaw", telemetry.waterRaw);
  json.set("waterLevel", telemetry.waterLevelPct);
  json.set("waterLevelLow", telemetry.waterLevelLow);
  json.set("temperature", telemetry.temperature);
  json.set("humidity", telemetry.humidity);

  if (config.lightMode == "digital") {
    json.set("light", telemetry.light);
  } else {
    // When disabled ('none') or unsupported, set actual JSON null so RTDB light field is deleted
    json.set("light");
  }

  // Expose automatic soak cooldown remaining seconds (0 when expired)
  unsigned long remSec = getAutoCooldownRemainingSec();
  telemetry.autoCooldownRemainingSec = remSec;
  json.set("autoCooldownRemainingSec", remSec);

  bool relayActive = (digitalRead(PIN_RELAY) == LOW);
  json.set("pumpOn", relayActive);
  json.set("isPumpActive", relayActive);
  json.set("rssi", telemetry.rssi);
  json.set("ts/.sv", "timestamp");

  // Request an empty response while still checking the server's write result.
  if (!Firebase.RTDB.updateNodeSilent(&fbdo, path, &json)) {
    Serial.printf("[Telemetry] Update failed (%d): %s\n", fbdo.httpCode(), fbdo.errorReason().c_str());
    return false;
  }

  // Heartbeat timestamp
  char statusPath[sizeof(deviceId) + sizeof("devices//status") - 1];
  snprintf(statusPath, sizeof(statusPath), "devices/%s/status", deviceId);
  FirebaseJson statusJson;
  statusJson.set("online", true);
  statusJson.set("lastSeen/.sv", "timestamp");
  statusJson.set("firmware", "v1.0.4-esp8266");
  if (!Firebase.RTDB.updateNodeSilent(&fbdo, statusPath, &statusJson)) {
    Serial.printf("[Heartbeat] Update failed: %s\n", fbdo.errorReason().c_str());
    return false;
  }
  return true;
}

// ==========================================
// HISTORY SNAPSHOT LOGGING (Spec §6)
// ==========================================
void appendHistorySnapshot() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;


  char path[sizeof(deviceId) + sizeof("history/") - 1];
  snprintf(path, sizeof(path), "history/%s", deviceId);
  FirebaseJson json;
  json.set("ts/.sv", "timestamp");
  json.set("soilMoisture", (int)round(telemetry.soilMoisture));
  json.set("temperature", telemetry.temperature);
  json.set("humidity", telemetry.humidity);
  if (config.lightMode != "none") {
    json.set("light", telemetry.light);
  }

  if (!Firebase.RTDB.pushJSONAsync(&fbdo, path, &json)) {
    Serial.printf("[History] Snapshot send failed: %s\n", fbdo.errorReason().c_str());
  }
}

// ==========================================
// EMBEDDED AUTO-WATERING ENGINE (Spec §8.1)
// ==========================================
void checkAutoWatering() {
  static unsigned long lastIdentityCheckMs = 0;
  if (millis() - lastIdentityCheckMs >= 10000) {
    lastIdentityCheckMs = millis();
    Serial.printf("[Identity] Active deviceId: %s | Command path: devices/%s/command\n", deviceId, deviceId);
  }

  if (!hasInitialConfigSynced || config.mode != "auto") return;

  // Low-Reserve Auto-Watering Guard: Prevent automatic watering if remainingMl < MIN_RESERVE_ML (20 ml)
  // so the pump never runs dry unattended (while keeping manual waterNow override intact).
  if (config.remainingMl < MIN_RESERVE_ML) {
    Serial.printf("[Auto] Low-reserve guard active: remainingMl (%d ml) < MIN_RESERVE_ML (%d ml); skipping auto cycle\n",
                  config.remainingMl, MIN_RESERVE_ML);
    return;
  }

  unsigned long now = millis();
  unsigned long remSec = getAutoCooldownRemainingSec();

  // Cooldown: at most one auto cycle every 30 minutes
  if (remSec > 0) {
    // Rate-limited to once per minute when dry soil is blocked by cooldown
    if (telemetry.soilMoisture < (float)config.moistureMin) {
      static unsigned long lastAutoSkipLogMs = 0;
      if (lastAutoSkipLogMs == 0 || (now - lastAutoSkipLogMs >= 60000UL)) {
        lastAutoSkipLogMs = now;
        int minutesLeft = (int)((remSec + 59UL) / 60UL);
        Serial.printf("[AutoSkip] Soaking cooldown (%dm left)\n", minutesLeft);
      }
    }
    return;
  }

  // Trigger automatic watering when soil moisture falls below configured moistureMin
  if (telemetry.soilMoisture < (float)config.moistureMin) {
    // 1. Coastal-humidity guard: If ambient air is very humid and soil is close to minimum,
    // delay watering to prevent root rot & over-watering.
    if (telemetry.humidity > config.humidityMax &&
        telemetry.soilMoisture > (float)(config.moistureMin - 10)) {
      Serial.println(F("[Auto] Delayed watering: Coastal high humidity guard active"));
      return;
    }

    // 2. Heat & Direct Sunlight guard: Delay watering during hottest midday sun on terraces
    // Only applied when light sensor is active (digital) and bright (light == 1)
    if (config.location == "terrace" && config.lightMode == "digital" && telemetry.temperature > config.tempMax && telemetry.light == 1) {
      Serial.println(F("[Auto] Delayed watering: High temperature with direct midday sun"));
      return;
    }

    // Determine watering duration from config.waterDurationSec or config.pumpDurationSec
    int duration = config.waterDurationSec > 0 ? config.waterDurationSec : (config.pumpDurationSec > 0 ? config.pumpDurationSec : DEFAULT_PUMP_SEC);
    int runSec = constrain(duration, 1, 15);
    Serial.printf("[Auto] Triggering automatic watering for %d seconds (Moisture: %.1f%% < Min: %d%%)\n",
                  runSec, telemetry.soilMoisture, config.moistureMin);
    lastAutoCycleMs = now;
    startPump(runSec, "auto");
  }
}

// ==========================================
// PUMP CONTROL & HARDWARE LIFECYCLE
// ==========================================
void publishPumpState(bool active) {
  telemetry.isPumpActive = active;
  telemetry.pumpOn = active;
  flagTelemetryDirty = true;
}

void startPump(int durationSec, String trigger, String cmdId) {
  if (isPumpActive) return;

  // Enforce absolute safety cap of 15 seconds (Spec §8.1)
  int safeDuration = constrain(durationSec, 1, 15);

  activeWaterTrigger = trigger;
  activeCommandId = cmdId;
  moistureBeforeWatering = telemetry.soilMoisture;
  pumpDurationLimit = safeDuration * 1000UL;
  pumpStartTime = millis();
  isPumpActive = true;
  telemetry.isPumpActive = true;
  telemetry.pumpOn = true;

  // Arm hardware safety cutoff ticker (capped at 15 seconds)
  pumpSafetyTicker.once_ms(min((unsigned long)safeDuration * 1000UL, MAX_PUMP_RUN_MS), onPumpCutoff);

  // Turn Relay ON (Active-LOW: activate relay pin digitalWrite(PIN_RELAY, LOW))
  digitalWrite(PIN_RELAY, LOW);
  Serial.printf("[PUMP] Activated for %d seconds (Trigger: %s) - digitalWrite(PIN_RELAY, LOW)\n", safeDuration, trigger.c_str());

  // Queue pump status after the relay is active.
  publishPumpState(true);
}

void stopPump() {
  if (!isPumpActive) return;

  // Detach hardware safety ticker and turn relay OFF immediately
  pumpSafetyTicker.detach();
  digitalWrite(PIN_RELAY, RELAY_OFF);
  isPumpActive = false;
  telemetry.isPumpActive = false;
  telemetry.pumpOn = false;

  unsigned long elapsedSec = (millis() - pumpStartTime) / 1000UL;
  if (elapsedSec == 0) elapsedSec = 1;

  Serial.printf("[PUMP] Stopped after %lu seconds\n", elapsedSec);

  // Publish pumpOn: false immediately upon cutoff
  publishPumpState(false);

  // Deduct estimated reservoir water (Spec §8.3: remainingMl -= flowMlPerSec * pumpSeconds)
  int waterUsed = config.flowMlPerSec * elapsedSec;
  config.remainingMl = max(0, config.remainingMl - waterUsed);

  hasUnsyncedReservoirChange = true;
  flagBottleDirty = true;
  flagControlResetDirty = activeCommandId == "ctrl-manual";
  bool saved = saveConfigToFS();

  if (activeCommandId.length() > 0 && activeCommandId != "ctrl-manual") {
    updateCommandAck(activeCommandId, saved ? "done" : "failed", saved ? "" : "fs_save_error");
  }
  activeCommandId = "";

  completedRunSeconds = elapsedSec;
  readSensors();
  pendingWaterLog.valid = true;
  pendingWaterLog.trigger = activeWaterTrigger;
  pendingWaterLog.durationSec = completedRunSeconds;
  pendingWaterLog.before = moistureBeforeWatering;
  pendingWaterLog.after = telemetry.soilMoisture;
  pendingWaterLog.note = (activeWaterTrigger == "auto" ? "Automated maintenance" : "Manual pulse triggered by user");

  flagWaterLogDirty = true;
  flagTelemetryDirty = true;
}

// ==========================================
// RTDB POLLING
// ==========================================
bool hasTlsHeap() {
  return ESP.getFreeHeap() >= TLS_MIN_FREE_HEAP &&
         ESP.getMaxFreeBlockSize() >= TLS_MIN_FREE_BLOCK;
}

void pollControl() {
  // Legacy /control pump-start path retired: only validated /command requests can activate the pump.
  char ctrlPath[sizeof(deviceId) + sizeof("devices//control") - 1];
  snprintf(ctrlPath, sizeof(ctrlPath), "devices/%s/control", deviceId);
  if (Firebase.RTDB.getJSON(&fbdo, ctrlPath)) {
    if (fbdo.dataType() == "json") {
      FirebaseJson &json = fbdo.jsonObject();
      FirebaseJsonData dVal;
      bool pumpState = false;

      if (json.get(dVal, "pumpState") && dVal.typeNum == FirebaseJson::JSON_BOOL) {
        pumpState = dVal.boolValue;
      }

      if (!pumpState && isPumpActive && activeCommandId == "ctrl-manual") {
        Serial.println(F("[Control] Manual pump stop requested via loop"));
        stopPump();
      }
    }
  }
}

void pollCommand() {
  if (!hasTlsHeap()) return;
  char cmdPath[sizeof(deviceId) + sizeof("devices//command") - 1];
  snprintf(cmdPath, sizeof(cmdPath), "devices/%s/command", deviceId);
  if (Firebase.RTDB.getJSON(&fbdo, cmdPath)) {
    if (fbdo.dataType() == "json") {
      FirebaseJson &json = fbdo.jsonObject();
      handleCommand(json);
    }
  }
}

void pollConfig() {
  const DeviceConfig previous = config;
  char cfgPath[sizeof(deviceId) + sizeof("devices//config") - 1];
  snprintf(cfgPath, sizeof(cfgPath), "devices/%s/config", deviceId);
  bool hasValidMode = false;
  if (Firebase.RTDB.getJSON(&fbdo, cfgPath)) {
    if (fbdo.dataType() == "json") {
      FirebaseJson &json = fbdo.jsonObject();
      FirebaseJsonData result;

      if (json.get(result, "mode") &&
          (result.stringValue == "auto" || result.stringValue == "manual")) {
        config.mode = result.stringValue;
        hasValidMode = true;
      }
      Serial.printf("[Config] Read /config successfully | config.mode: %s\n", config.mode.c_str());
      if (json.get(result, "location")) config.location = result.stringValue;
      if (json.get(result, "thresholds/moistureMin")) config.moistureMin = result.intValue;
      if (json.get(result, "thresholds/moistureMax")) config.moistureMax = result.intValue;
      if (json.get(result, "thresholds/tempMax")) config.tempMax = result.intValue;
      if (json.get(result, "thresholds/humidityMax")) config.humidityMax = result.intValue;
      if (json.get(result, "thresholds/pumpDurationSec")) {
        config.pumpDurationSec = result.intValue;
        config.waterDurationSec = result.intValue;
      }
      if (json.get(result, "thresholds/waterDurationSec")) {
        config.waterDurationSec = result.intValue;
        config.pumpDurationSec = result.intValue;
      }
      if (json.get(result, "sensors/lightMode")) config.lightMode = result.stringValue;
      int dryRaw = config.soilDryRaw;
      int wetRaw = config.soilWetRaw;
      if (json.get(result, "calibration/soilDryRaw")) dryRaw = result.intValue;
      if (json.get(result, "calibration/soilWetRaw")) wetRaw = result.intValue;
      if (dryRaw >= 0 && dryRaw <= 1024 && wetRaw >= 0 && wetRaw <= 1024 && dryRaw != wetRaw) {
        config.soilDryRaw = dryRaw;
        config.soilWetRaw = wetRaw;
      }
      if (json.get(result, "bottleCapacityMl")) config.bottleCapacityMl = result.intValue;
      if (json.get(result, "bottle/capacityMl")) config.bottleCapacityMl = result.intValue;
      if (json.get(result, "bottle/flowMlPerSec")) config.flowMlPerSec = result.intValue;

      // Offline LittleFS Reservoir Preservation:
      // If hasUnsyncedReservoirChange is true, do NOT let older cloud config overwrite offline deduction
      if (!hasUnsyncedReservoirChange) {
        if (json.get(result, "bottle/remainingMl")) {
          config.remainingMl = result.intValue;
        } else if (json.get(result, "remainingMl")) {
          config.remainingMl = result.intValue;
        }
      } else {
        Serial.println(F("[Config] hasUnsyncedReservoirChange active; preserving offline local remainingMl"));
      }
    }
  }

  if (config.soilDryRaw != previous.soilDryRaw || config.soilWetRaw != previous.soilWetRaw) {
    readSensors();
    flagTelemetryDirty = true;
  }

  if (config.lightMode != previous.lightMode) {
    if (config.lightMode == "digital") {
      telemetry.light = (digitalRead(PIN_LDR) == LOW) ? 1 : 0;
    } else {
      // Disabled or unsupported mode ('none'): clear bright state immediately
      telemetry.light = -1;
    }

    if (WiFi.status() == WL_CONNECTED && Firebase.ready()) {
      FirebaseJson lightUpdate;
      if (config.lightMode == "digital") {
        lightUpdate.set("light", telemetry.light);
      } else {
        // Delete RTDB light field using an actual JSON null
        lightUpdate.set("light");
      }
      lightUpdate.set("ts/.sv", "timestamp");
      char telemPath[sizeof(deviceId) + sizeof("devices//telemetry") - 1];
      snprintf(telemPath, sizeof(telemPath), "devices/%s/telemetry", deviceId);
      Firebase.RTDB.updateNodeSilent(&fbdo, telemPath, &lightUpdate);
      fbdo.clear();
    }
    flagTelemetryDirty = true;
  }

  if (!hasValidMode) return;
  hasInitialConfigSynced = true;

  if (config.mode == previous.mode && config.location == previous.location &&
      config.moistureMin == previous.moistureMin && config.moistureMax == previous.moistureMax &&
      config.tempMax == previous.tempMax && config.humidityMax == previous.humidityMax &&
      config.pumpDurationSec == previous.pumpDurationSec && config.waterDurationSec == previous.waterDurationSec &&
      config.lightMode == previous.lightMode && config.soilDryRaw == previous.soilDryRaw &&
      config.soilWetRaw == previous.soilWetRaw &&
      config.bottleCapacityMl == previous.bottleCapacityMl && config.flowMlPerSec == previous.flowMlPerSec &&
      config.remainingMl == previous.remainingMl) return;
  if (!saveConfigToFS()) Serial.println(F("[Config] LittleFS save failed"));
}

// ==========================================
// COMMAND PROCESSOR (Spec §7.4, §9)
// ==========================================
void handleCommand(FirebaseJson &json) {
  FirebaseJsonData dId, dType, dDuration, dAckStatus;

  json.get(dId, "id");
  json.get(dType, "type");
  json.get(dDuration, "durationSec");
  json.get(dAckStatus, "ack/status");

  String cmdId = dId.stringValue;
  String type = dType.stringValue;
  int durationSec = dDuration.intValue > 0 ? dDuration.intValue : DEFAULT_PUMP_SEC;
  String currentAck = dAckStatus.stringValue;

  if (cmdId.length() == 0 || cmdId == lastProcessedCommandId || currentAck == "done" || currentAck == "rejected" || currentAck == "running" || currentAck == "failed") {
    return; // Already handled, in-flight, or invalid
  }

  Serial.printf("[Command] Read ID: %s | Type: %s | Ack: %s\n", cmdId.c_str(), type.c_str(), currentAck.c_str());

  // Stale Command Guard: reject commands requested > 30 seconds ago
  FirebaseJsonData dReqAt;
  if (json.get(dReqAt, "requestedAt")) {
    uint64_t reqAt = 0;
    if (dReqAt.typeNum == FirebaseJson::JSON_INT || dReqAt.typeNum == FirebaseJson::JSON_DOUBLE) {
      reqAt = (uint64_t)dReqAt.doubleValue;
    } else if (dReqAt.stringValue.length() > 0) {
      reqAt = strtoull(dReqAt.stringValue.c_str(), nullptr, 10);
    }
    time_t reqAtSec = (reqAt > 10000000000ULL) ? (time_t)(reqAt / 1000ULL) : (time_t)reqAt;
    time_t currentEpoch = time(nullptr);
    if (currentEpoch > 1600000000 && reqAtSec > 0) {
      if ((currentEpoch > reqAtSec) && ((currentEpoch - reqAtSec) > 30)) {
        Serial.printf("[Command] Stale command expired (>30s): requestedAt=%ld, now=%ld\n", (long)reqAtSec, (long)currentEpoch);
        lastProcessedCommandId = cmdId;
        updateCommandAck(cmdId, "rejected", "STALE_COMMAND_EXPIRED");
        return;
      }
    }
  }

  // 1. Water Now Command
  if (type == "waterNow") {
    lastProcessedCommandId = cmdId;

    // Explicitly bypass soil moisture condition check (moisture >= targetMax or 100%) for manual watering
    Serial.printf("[Command] Manual waterNow received: explicitly bypassing moisture check (Moisture: %.1f%%)\n",
                  telemetry.soilMoisture);

    if (config.remainingMl <= 0) {
      Serial.println(F("[Command] Note: Bottle software estimate is 0 ml, executing manual override regardless"));
    }

    if (durationSec > 15 || durationSec < 1) {
      Serial.println(F("[Command] Rejected: Invalid duration"));
      updateCommandAck(cmdId, "rejected", "invalid_duration");
      return;
    }

    // Activate relay pin (LOW) and start pump for requested duration regardless of moisture level
    startPump(durationSec, "manual", cmdId);
    updateCommandAck(cmdId, "running");
  }
  // 2. Calibrate Dry Sensor Command
  else if (type == "calibrateDry") {
    lastProcessedCommandId = cmdId;
    readSensors();
    config.soilDryRaw = telemetry.soilRaw;
    bool fsOk = saveConfigToFS();

    char path[sizeof(deviceId) + sizeof("devices//config/calibration/soilDryRaw") - 1];
    snprintf(path, sizeof(path), "devices/%s/config/calibration/soilDryRaw", deviceId);
    bool rtdbOk = Firebase.RTDB.setInt(&fbdo, path, config.soilDryRaw);
    if (fsOk && rtdbOk) {
      updateCommandAck(cmdId, "done");
      Serial.printf("[Calibrate] Dry raw captured: %d\n", config.soilDryRaw);
    } else {
      updateCommandAck(cmdId, "failed", !fsOk ? "fs_save_error" : "rtdb_write_error");
      Serial.println(F("[Calibrate] Failed to save dry calibration"));
    }
  }
  // 3. Calibrate Wet Sensor Command
  else if (type == "calibrateWet") {
    lastProcessedCommandId = cmdId;
    readSensors();
    config.soilWetRaw = telemetry.soilRaw;
    bool fsOk = saveConfigToFS();

    char path[sizeof(deviceId) + sizeof("devices//config/calibration/soilWetRaw") - 1];
    snprintf(path, sizeof(path), "devices/%s/config/calibration/soilWetRaw", deviceId);
    bool rtdbOk = Firebase.RTDB.setInt(&fbdo, path, config.soilWetRaw);
    if (fsOk && rtdbOk) {
      updateCommandAck(cmdId, "done");
      Serial.printf("[Calibrate] Wet raw captured: %d\n", config.soilWetRaw);
    } else {
      updateCommandAck(cmdId, "failed", !fsOk ? "fs_save_error" : "rtdb_write_error");
      Serial.println(F("[Calibrate] Failed to save wet calibration"));
    }
  }
  // 4. Bottle Refilled Command
  else if (type == "refilled") {
    lastProcessedCommandId = cmdId;
    FirebaseJsonData dCap;
    int cap = config.bottleCapacityMl > 0 ? config.bottleCapacityMl : 1000;
    if (json.get(dCap, "capacityMl") && dCap.intValue > 0) {
      cap = min(cap, dCap.intValue);
    }
    config.remainingMl = cap;
    hasUnsyncedReservoirChange = true;
    bool fsOk = saveConfigToFS();

    flagBottleDirty = true;
    readSensors();
    flagTelemetryDirty = true;
    pendingAckCapacity = cap;
    updateCommandAck(cmdId, fsOk ? "done" : "failed", fsOk ? "" : "fs_save_error");
  }
  // 5. Disarm / Unpair Command
  else if (type == "disarm") {
    lastProcessedCommandId = cmdId;
    config.mode = "manual";
    bool fsOk = saveConfigToFS();
    if (isPumpActive) {
      stopPump();
    }
    updateCommandAck(cmdId, fsOk ? "done" : "failed", fsOk ? "" : "fs_save_error");
    Serial.println(F("[Command] Controller disarmed: mode set to manual, pump stopped"));
  }
}

void updateCommandAck(String cmdId, String status, String reason) {
  pendingAckId = cmdId;
  pendingAckStatus = status;
  pendingAckReason = reason;
  flagAckDirty = true;
}

void flushPendingWrites() {
  if ((long)(millis() - nextWriteAttempt) < 0) return;
  nextWriteAttempt = millis() + 1000;

  bool hasWrites = flagBottleDirty || flagControlResetDirty || flagAckDirty || flagWaterLogDirty || flagTelemetryDirty;
  const bool historyDue = !isPumpActive && millis() - lastHistoryMs >= HISTORY_INTERVAL_MS;
  if (!hasWrites && !historyDue) return;

  Serial.printf("[Identity] Active deviceId: %s | Command path: devices/%s/command\n", deviceId, deviceId);
  Serial.printf("[Heap] Free heap before flushPendingWrites: %d bytes\n", ESP.getFreeHeap());

  if (!hasTlsHeap() || ESP.getFreeHeap() < RTDB_WRITE_HEAP_HEADROOM) {
    Serial.printf("[Heap] Deferring RTDB writes: %u free, %u largest block, RSSI %ld dBm\n",
                  static_cast<unsigned>(ESP.getFreeHeap()),
                  static_cast<unsigned>(ESP.getMaxFreeBlockSize()), WiFi.RSSI());
    return;
  }

  char path[sizeof(deviceId) + sizeof("devices//control") - 1];

  if (flagBottleDirty) {
    FirebaseJson bottle;
    // RTDB PATCH needs literal slash keys to update a child without replacing the bottle object.
    String remaining = String(config.remainingMl);
    bottle.setJsonData(String("{\"bottle/remainingMl\":") + remaining +
                       ",\"remainingMl\":" + remaining + "}");
    snprintf(path, sizeof(path), "devices/%s/config", deviceId);
    if (Firebase.RTDB.updateNodeSilent(&fbdo, path, &bottle)) {
      flagBottleDirty = false;
      if (hasUnsyncedReservoirChange) {
        hasUnsyncedReservoirChange = false;
        saveConfigToFS();
        Serial.println(F("[Flush] Confirmed bottle sync to RTDB; unsyncedReservoir cleared"));
      }
    } else {
      Serial.printf("[Flush] Reservoir sync failed: %s\n", fbdo.errorReason().c_str());
    }
  }
  if (flagControlResetDirty) {
    FirebaseJson control;
    control.set("pumpState", false);
    control.set("manualOverride", false);
    snprintf(path, sizeof(path), "devices/%s/control", deviceId);
    if (Firebase.RTDB.updateNodeSilent(&fbdo, path, &control)) {
      flagControlResetDirty = false;
    }
  }
  if (flagAckDirty) {
    char ackPath[sizeof(deviceId) + sizeof("devices//command/ack") - 1];
    snprintf(ackPath, sizeof(ackPath), "devices/%s/command/ack", deviceId);
    FirebaseJson ack;
    // PATCH removes optional fields left by an earlier acknowledgment.
    ack.setJsonData("{\"reason\":null,\"capacityMl\":null}");
    ack.set("id", pendingAckId);
    ack.set("status", pendingAckStatus);
    if (pendingAckReason.length()) ack.set("reason", pendingAckReason);
    if (pendingAckCapacity > 0) {
      ack.set("capacityMl", pendingAckCapacity);
    }
    ack.set("ts/.sv", "timestamp");
    ack.set("timestamp/.sv", "timestamp");
    bool ackOk = Firebase.RTDB.updateNodeSilent(&fbdo, ackPath, &ack);
    Serial.printf("[Command] Flush ack write for %s (%s): %s\n", pendingAckId.c_str(), pendingAckStatus.c_str(), ackOk ? "SUCCESS" : "FAILED");
    if (ackOk) {
      pendingAckCapacity = 0;
      flagAckDirty = false;
    }
  }
  if (flagWaterLogDirty && pendingWaterLog.valid) {
    if (WiFi.status() == WL_CONNECTED && Firebase.ready()) {
      char logPath[sizeof(deviceId) + sizeof("waterLogs/") - 1];
      snprintf(logPath, sizeof(logPath), "waterLogs/%s", deviceId);
      FirebaseJson json;
      json.set("ts/.sv", "timestamp");
      json.set("trigger", pendingWaterLog.trigger);
      json.set("durationSec", pendingWaterLog.durationSec);
      json.set("moistureBefore", (int)round(pendingWaterLog.before));
      json.set("moistureAfter", (int)round(pendingWaterLog.after));
      json.set("note", pendingWaterLog.note);

      if (Firebase.RTDB.pushJSON(&fbdo, logPath, &json)) {
        Serial.println(F("[WaterLog] Appended watering event log to RTDB"));
        pendingWaterLog.valid = false;
        flagWaterLogDirty = false;
      } else {
        Serial.printf("[WaterLog] Push failed, retaining on controller: %s\n", fbdo.errorReason().c_str());
      }
    }
  }
  if (flagTelemetryDirty) {
    flagTelemetryDirty = !transmitTelemetry();
  }

  if (historyDue && hasTlsHeap()) {
    lastHistoryMs = millis();
    appendHistorySnapshot();
  }

  fbdo.clear();
  Serial.printf("[Heap] Free heap after flushPendingWrites: %d bytes\n", ESP.getFreeHeap());
}

void logWateringEvent(String trigger, int durationSec, float before, float after, String note) {
  pendingWaterLog.valid = true;
  pendingWaterLog.trigger = trigger;
  pendingWaterLog.durationSec = durationSec;
  pendingWaterLog.before = before;
  pendingWaterLog.after = after;
  pendingWaterLog.note = note;
  flagWaterLogDirty = true;
}

// ==========================================
// OFFLINE CONFIG PERSISTENCE (LittleFS)
// ==========================================
void loadConfigFromFS() {
  if (!LittleFS.exists("/config.json")) {
    Serial.println(F("[FS] No local config file found. Using default factory values."));
    saveConfigToFS();
    return;
  }

  File f = LittleFS.open("/config.json", "r");
  if (!f) return;

  StaticJsonDocument<768> doc;
  DeserializationError error = deserializeJson(doc, f);
  f.close();

  if (error) {
    Serial.println(F("[FS] Deserialization error. Resetting config."));
    return;
  }

  config.mode = doc["mode"] | config.mode;
  config.location = doc["location"] | config.location;
  config.moistureMin = doc["moistureMin"] | config.moistureMin;
  config.moistureMax = doc["moistureMax"] | config.moistureMax;
  config.tempMax = doc["tempMax"] | config.tempMax;
  config.humidityMax = doc["humidityMax"] | config.humidityMax;
  config.pumpDurationSec = doc["pumpDurationSec"] | config.pumpDurationSec;
  config.waterDurationSec = doc["waterDurationSec"] | config.waterDurationSec;
  config.lightMode = doc["lightMode"] | config.lightMode;
  config.soilDryRaw = doc["soilDryRaw"] | config.soilDryRaw;
  config.soilWetRaw = doc["soilWetRaw"] | config.soilWetRaw;

  // Single source of truth: nested bottle with flat read fallback
  if (doc.containsKey("bottle")) {
    JsonObject bottle = doc["bottle"];
    config.bottleCapacityMl = bottle["capacityMl"] | config.bottleCapacityMl;
    config.remainingMl = bottle["remainingMl"] | config.remainingMl;
    config.flowMlPerSec = bottle["flowMlPerSec"] | config.flowMlPerSec;
  }
  config.bottleCapacityMl = doc["bottleCapacityMl"] | config.bottleCapacityMl;
  config.flowMlPerSec = doc["flowMlPerSec"] | config.flowMlPerSec;
  config.remainingMl = doc["remainingMl"] | config.remainingMl;
  hasUnsyncedReservoirChange = doc["unsyncedReservoir"] | false;
  flagBottleDirty = hasUnsyncedReservoirChange;

  Serial.println(F("[FS] Local offline configuration loaded successfully"));
}

bool saveConfigToFS() {
  File f = LittleFS.open("/config.json", "w");
  if (!f) {
    Serial.println(F("[FS] Failed to open /config.json for writing"));
    return false;
  }

  StaticJsonDocument<768> doc;
  doc["mode"] = config.mode;
  doc["location"] = config.location;
  doc["moistureMin"] = config.moistureMin;
  doc["moistureMax"] = config.moistureMax;
  doc["tempMax"] = config.tempMax;
  doc["humidityMax"] = config.humidityMax;
  doc["pumpDurationSec"] = config.pumpDurationSec;
  doc["waterDurationSec"] = config.waterDurationSec;
  doc["lightMode"] = config.lightMode;
  doc["soilDryRaw"] = config.soilDryRaw;
  doc["soilWetRaw"] = config.soilWetRaw;

  // Single source of truth: nested bottle with flat fallback
  JsonObject bottle = doc.createNestedObject("bottle");
  bottle["capacityMl"] = config.bottleCapacityMl;
  bottle["remainingMl"] = config.remainingMl;
  bottle["flowMlPerSec"] = config.flowMlPerSec;

  doc["bottleCapacityMl"] = config.bottleCapacityMl;
  doc["flowMlPerSec"] = config.flowMlPerSec;
  doc["remainingMl"] = config.remainingMl;
  doc["unsyncedReservoir"] = hasUnsyncedReservoirChange;

  size_t bytesWritten = serializeJson(doc, f);
  f.close();
  return bytesWritten > 0;
}
