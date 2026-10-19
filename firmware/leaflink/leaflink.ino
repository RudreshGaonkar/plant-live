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

// ==========================================
// 1. HARDWARE PIN DEFINITIONS (Spec §3.1)
// ==========================================
#define PIN_SOIL_ADC       A0       // ADC0: Analog Soil Moisture Sensor
#define PIN_DHT            14       // D5 / GPIO14: DHT11 Data Pin
#define PIN_RELAY          12       // D6 / GPIO12: Relay IN (Mini Submersible Pump)
#define PIN_LDR            13       // D7 / GPIO13: LDR Module Digital Out (DO)
#define PIN_SOIL_PWR       16       // D0 / GPIO16: Optional Soil Sensor Power Gating

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
#define MIN_RESERVE_ML          20          // Minimum water bottle reserve to allow pump run

// ==========================================
// 3. FIREBASE CONFIGURATION
// ==========================================
// NOTE: Set your Firebase project credentials below or configure via custom parameters
#define FIREBASE_HOST      "https://leaflink-7c669-default-rtdb.firebaseio.com/"
#define FIREBASE_API_KEY   "AIzaSyBV1o12illTDwQlw1K1kwYJ0QhIaipzZ7E"

// Device Identity: Unique Device ID (e.g., leaf-node-01 or generated from ESP ChipID)
String deviceId = "leaf-node-01";
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
  String lightMode = "digital";     // "none" | "digital" | "analog"
  int soilDryRaw = 1024;            // Sensor in air
  int soilWetRaw = 400;             // Sensor in water
  int bottleCapacityMl = 500;
  int flowMlPerSec = 15;
  int remainingMl = 380;
};

DeviceConfig config;

// Telemetry State
struct TelemetryData {
  int soilRaw = 600;
  float soilMoisture = 45.0;
  int temperature = 28;
  int humidity = 65;
  int light = 1;                    // 1: Bright, 0: Dim
  bool pumpOn = false;
  long rssi = -60;
  unsigned long lastSeen = 0;
};

TelemetryData telemetry;

// Pump Execution Tracking
bool isPumpActive = false;
unsigned long pumpStartTime = 0;
unsigned long pumpDurationLimit = 0;
String activeWaterTrigger = "manual";
float moistureBeforeWatering = 0.0;
String activeCommandId = "";

// Loop Timers
unsigned long lastTelemetryMs = 0;
unsigned long lastHistoryMs = 0;
unsigned long lastAutoCycleMs = 0;

// Hardware Instances
DHT dht(PIN_DHT, DHTTYPE);
FirebaseData fbdo;
FirebaseData streamData;
FirebaseAuth auth;
FirebaseConfig fbConfig;

// Forward Declarations
void loadConfigFromFS();
void saveConfigToFS();
void readSensors();
void transmitTelemetry();
void appendHistorySnapshot();
void checkAutoWatering();
void startPump(int durationSec, String trigger, String cmdId = "");
void stopPump();
void streamCallback(FirebaseStream data);
void streamTimeoutCallback(bool timeout);
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
  // IMPORTANT: Set Relay OFF BEFORE setting pin mode to prevent spuriously running pump on boot!
  digitalWrite(PIN_RELAY, RELAY_OFF);
  pinMode(PIN_RELAY, OUTPUT);
  digitalWrite(PIN_RELAY, RELAY_OFF);

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

  // 3. Fallback Device ID from Chip ID if default
  String chipId = String(ESP.getChipId(), HEX);
  chipId.toUpperCase();
  Serial.print(F("[INFO] Hardware Chip ID: "));
  Serial.println(chipId);

  // 4. WiFiManager Setup (Captive Portal for initial setup)
  WiFiManager wm;
  wm.setConfigPortalTimeout(180); // 3 minutes timeout to allow headless auto-reboot
  String apName = "LeafLink-" + chipId;
  Serial.print(F("[WiFi] Connecting or launching AP: "));
  Serial.println(apName);

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
  while (now < 8 * 3600 * 2 && retry < 15) {
    delay(500);
    now = time(nullptr);
    retry++;
  }
  Serial.print(F("[NTP] Synced UNIX Epoch: "));
  Serial.println(now);

  // 6. Firebase Initialization
  if (WiFi.status() == WL_CONNECTED) {
    fbConfig.host = FIREBASE_HOST;
    fbConfig.api_key = FIREBASE_API_KEY;

    // Use device user account or anonymous auth for device contract
    auth.user.email = deviceEmail.c_str();
    auth.user.password = devicePassword.c_str();

    fbConfig.token_status_callback = tokenStatusCallback;
    fbdo.setResponseSize(2048);

    Firebase.begin(&fbConfig, &auth);
    Firebase.reconnectWiFi(true);

    // Initial Status write
    String statusPath = "devices/" + deviceId + "/status";
    FirebaseJson statusJson;
    statusJson.set("online", true);
    statusJson.set("firmware", "v1.0.4-esp8266");
    statusJson.set("lastSeen/{.sv}", "timestamp");
    Firebase.RTDB.updateNode(&fbdo, statusPath.c_str(), &statusJson);

    // Begin RTDB Stream on Device Path
    String streamPath = "devices/" + deviceId;
    if (!Firebase.RTDB.beginStream(&streamData, streamPath.c_str())) {
      Serial.printf("[Stream] Begin failed: %s\n", streamData.errorReason().c_str());
    } else {
      Firebase.RTDB.setStreamCallback(&streamData, streamCallback, streamTimeoutCallback);
      Serial.println(F("[Stream] Realtime stream active on device path"));
    }
  }

  // First sensor read
  readSensors();
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  unsigned long currentMs = millis();

  // 1. Maintain Pump Timer & Hard Safety Timeout
  if (isPumpActive) {
    if (currentMs - pumpStartTime >= pumpDurationLimit) {
      stopPump();
    }
  }

  // 2. Safety: Immediately shut off pump if WiFi drops during active run
  if (WiFi.status() != WL_CONNECTED && isPumpActive) {
    Serial.println(F("[SAFETY] WiFi connection lost during pump run! Shutting off pump."));
    stopPump();
  }

  // 3. Regular Telemetry & Heartbeat Loop (Every 10s)
  if (currentMs - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = currentMs;
    readSensors();
    transmitTelemetry();
  }

  // 4. History Snapshot Logging (Every 5 minutes)
  if (currentMs - lastHistoryMs >= HISTORY_INTERVAL_MS) {
    lastHistoryMs = currentMs;
    appendHistorySnapshot();
  }

  // 5. Embedded Autonomous Auto-Watering Engine (Spec §8.1)
  if (!isPumpActive) {
    checkAutoWatering();
  }

  yield();
}

// ==========================================
// SENSOR READING & CALIBRATION (Spec §8.4)
// ==========================================
void readSensors() {
  // 1. Read Soil Sensor with Power Gating (Reduces probe corrosion)
  digitalWrite(PIN_SOIL_PWR, HIGH);
  delay(25); // Allow capacitor and analog circuitry to stabilize

  long adcSum = 0;
  const int samples = 8;
  for (int i = 0; i < samples; i++) {
    adcSum += analogRead(PIN_SOIL_ADC);
    delay(5);
  }
  digitalWrite(PIN_SOIL_PWR, LOW); // Turn off power to sensor

  telemetry.soilRaw = adcSum / samples;

  // Map to 0-100% moisture using stored calibration
  // Dry = 1024, Wet = 400 (or user-calibrated raw values)
  int span = config.soilDryRaw - config.soilWetRaw;
  if (span == 0) span = 1; // Prevent division by zero
  float calculatedPct = (float)(config.soilDryRaw - telemetry.soilRaw) * 100.0 / (float)span;
  telemetry.soilMoisture = constrain(calculatedPct, 0.0, 100.0);

  // 2. Read DHT11 Temperature & Humidity
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  // Guard against NaN: Retain last valid readings
  if (!isnan(h)) {
    telemetry.humidity = (int)round(h);
  }
  if (!isnan(t)) {
    telemetry.temperature = (int)round(t);
  }

  // 3. Read LDR Light Module
  if (config.lightMode == "digital") {
    // Digital LDR module pulls LOW when light is above potentiometer threshold
    telemetry.light = (digitalRead(PIN_LDR) == LOW) ? 1 : 0;
  } else {
    telemetry.light = -1; // Sensor not fitted / none
  }

  telemetry.rssi = WiFi.RSSI();
  telemetry.pumpOn = isPumpActive;
}

// ==========================================
// TELEMETRY TRANSMISSION (Spec §6)
// ==========================================
void transmitTelemetry() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;

  String path = "devices/" + deviceId + "/telemetry";
  FirebaseJson json;
  json.set("soilRaw", telemetry.soilRaw);
  json.set("soilMoisture", (int)round(telemetry.soilMoisture));
  json.set("temperature", telemetry.temperature);
  json.set("humidity", telemetry.humidity);

  if (config.lightMode != "none") {
    json.set("light", telemetry.light);
  } else {
    json.set("light", "null");
  }

  json.set("pumpOn", isPumpActive);
  json.set("rssi", telemetry.rssi);
  json.set("ts/{.sv}", "timestamp");

  if (!Firebase.RTDB.updateNode(&fbdo, path.c_str(), &json)) {
    Serial.printf("[Telemetry] Update failed: %s\n", fbdo.errorReason().c_str());
  }

  // Heartbeat timestamp
  String statusPath = "devices/" + deviceId + "/status";
  FirebaseJson statusJson;
  statusJson.set("online", true);
  statusJson.set("lastSeen/{.sv}", "timestamp");
  Firebase.RTDB.updateNode(&fbdo, statusPath.c_str(), &statusJson);
}

// ==========================================
// HISTORY SNAPSHOT LOGGING (Spec §6)
// ==========================================
void appendHistorySnapshot() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;

  String path = "history/" + deviceId;
  FirebaseJson json;
  json.set("ts/{.sv}", "timestamp");
  json.set("soilMoisture", (int)round(telemetry.soilMoisture));
  json.set("temperature", telemetry.temperature);
  json.set("humidity", telemetry.humidity);
  if (config.lightMode != "none") {
    json.set("light", telemetry.light);
  }

  Firebase.RTDB.pushJSON(&fbdo, path.c_str(), &json);
  Serial.println(F("[History] Snapshot appended to RTDB"));
}

// ==========================================
// EMBEDDED AUTO-WATERING ENGINE (Spec §8.1)
// ==========================================
void checkAutoWatering() {
  if (config.mode != "auto") return;
  if (config.remainingMl <= MIN_RESERVE_ML) return;

  unsigned long now = millis();

  // Cooldown: at most one auto cycle every 30 minutes
  if (lastAutoCycleMs != 0 && (now - lastAutoCycleMs < AUTO_COOLDOWN_MS)) {
    return;
  }

  if (telemetry.soilMoisture < (float)config.moistureMin) {
    // 1. Coastal-humidity guard: If ambient air is very humid and soil is close to minimum,
    // delay watering to prevent root rot & over-watering.
    if (telemetry.humidity > config.humidityMax &&
        telemetry.soilMoisture > (float)(config.moistureMin - 10)) {
      Serial.println(F("[Auto] Delayed watering: Coastal high humidity guard active"));
      return;
    }

    // 2. Heat & Direct Sunlight guard: Delay watering during hottest midday sun on terraces
    if (telemetry.temperature > config.tempMax && telemetry.light == 1) {
      Serial.println(F("[Auto] Delayed watering: High temperature with direct midday sun"));
      return;
    }

    // Execute auto cycle
    int runSec = constrain(config.pumpDurationSec, 1, 15);
    Serial.printf("[Auto] Starting automatic watering cycle for %d seconds\n", runSec);
    lastAutoCycleMs = now;
    startPump(runSec, "auto");
  }
}

// ==========================================
// PUMP CONTROL & HARDWARE LIFECYCLE
// ==========================================
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

  // Turn Relay ON (Active-LOW)
  digitalWrite(PIN_RELAY, RELAY_ON);
  Serial.printf("[PUMP] Activated for %d seconds (Trigger: %s)\n", safeDuration, trigger.c_str());

  // Acknowledge command state to Firebase if manual
  if (activeCommandId.length() > 0) {
    updateCommandAck(activeCommandId, "running");
  }

  // Update telemetry immediately so UI animates droplets
  transmitTelemetry();
}

void stopPump() {
  if (!isPumpActive) return;

  // Turn Relay OFF immediately
  digitalWrite(PIN_RELAY, RELAY_OFF);
  isPumpActive = false;
  unsigned long elapsedSec = (millis() - pumpStartTime) / 1000UL;
  if (elapsedSec == 0) elapsedSec = 1;

  Serial.printf("[PUMP] Stopped after %lu seconds\n", elapsedSec);

  // Deduct estimated reservoir water (Spec §8.3: remainingMl -= flowMlPerSec * pumpSeconds)
  int waterUsed = config.flowMlPerSec * elapsedSec;
  config.remainingMl = max(0, config.remainingMl - waterUsed);

  // Update Firebase bottle status
  if (WiFi.status() == WL_CONNECTED && Firebase.ready()) {
    String bottlePath = "devices/" + deviceId + "/config/bottle/remainingMl";
    Firebase.RTDB.setInt(&fbdo, bottlePath.c_str(), config.remainingMl);
  }
  saveConfigToFS();

  // Acknowledge command completed
  if (activeCommandId.length() > 0) {
    updateCommandAck(activeCommandId, "done");
    activeCommandId = "";
  }

  // Read post-watering moisture after a brief soak period
  delay(100);
  readSensors();

  // Append water log (Spec §6 & §8.3)
  logWateringEvent(
    activeWaterTrigger,
    elapsedSec,
    moistureBeforeWatering,
    telemetry.soilMoisture,
    activeWaterTrigger == "auto" ? "Automated maintenance" : "Manual pulse triggered by user"
  );

  // Re-broadcast telemetry
  transmitTelemetry();
}

// ==========================================
// RTDB STREAM CALLBACKS & COMMAND DISPATCH
// ==========================================
void streamCallback(FirebaseStream data) {
  String path = data.dataPath();
  String dataType = data.dataType();

  Serial.printf("[Stream] Event at %s (%s)\n", path.c_str(), dataType.c_str());

  // Handle Command Updates: /command
  if (path.indexOf("/command") >= 0 || path == "/") {
    if (data.dataType() == "json") {
      FirebaseJson &json = data.jsonObject();
      handleCommand(json);
    }
  }

  // Handle Dynamic Config Updates: /config
  if (path.indexOf("/config") >= 0 || path == "/") {
    if (data.dataType() == "json") {
      FirebaseJson &json = data.jsonObject();
      FirebaseJsonData result;

      if (json.get(result, "mode")) config.mode = result.stringValue;
      if (json.get(result, "location")) config.location = result.stringValue;
      if (json.get(result, "thresholds/moistureMin")) config.moistureMin = result.intValue;
      if (json.get(result, "thresholds/moistureMax")) config.moistureMax = result.intValue;
      if (json.get(result, "thresholds/tempMax")) config.tempMax = result.intValue;
      if (json.get(result, "thresholds/humidityMax")) config.humidityMax = result.intValue;
      if (json.get(result, "thresholds/pumpDurationSec")) config.pumpDurationSec = result.intValue;
      if (json.get(result, "sensors/lightMode")) config.lightMode = result.stringValue;
      if (json.get(result, "calibration/soilDryRaw")) config.soilDryRaw = result.intValue;
      if (json.get(result, "calibration/soilWetRaw")) config.soilWetRaw = result.intValue;
      if (json.get(result, "bottle/capacityMl")) config.bottleCapacityMl = result.intValue;
      if (json.get(result, "bottle/flowMlPerSec")) config.flowMlPerSec = result.intValue;
      if (json.get(result, "bottle/remainingMl")) config.remainingMl = result.intValue;

      saveConfigToFS();
      Serial.println(F("[Config] Synced from Firebase & persisted to LittleFS"));
    }
  }
}

void streamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println(F("[Stream] Timed out, resuming..."));
  }
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

  if (cmdId.length() == 0 || currentAck == "done" || currentAck == "rejected" || currentAck == "running") {
    return; // Already handled or invalid
  }

  Serial.printf("[Command] Processing %s (ID: %s)\n", type.c_str(), cmdId.c_str());
  updateCommandAck(cmdId, "received");

  // 1. Water Now Command
  if (type == "waterNow") {
    if (config.remainingMl <= 0) {
      Serial.println(F("[Command] Rejected: Bottle is empty"));
      updateCommandAck(cmdId, "rejected", "bottle_empty");
      return;
    }

    if (durationSec > 15 || durationSec < 1) {
      Serial.println(F("[Command] Rejected: Invalid duration"));
      updateCommandAck(cmdId, "rejected", "invalid_duration");
      return;
    }

    startPump(durationSec, "manual", cmdId);
  }
  // 2. Calibrate Dry Sensor Command
  else if (type == "calibrateDry") {
    readSensors();
    config.soilDryRaw = telemetry.soilRaw;
    saveConfigToFS();

    String path = "devices/" + deviceId + "/config/calibration/soilDryRaw";
    Firebase.RTDB.setInt(&fbdo, path.c_str(), config.soilDryRaw);
    updateCommandAck(cmdId, "done");
    Serial.printf("[Calibrate] Dry raw captured: %d\n", config.soilDryRaw);
  }
  // 3. Calibrate Wet Sensor Command
  else if (type == "calibrateWet") {
    readSensors();
    config.soilWetRaw = telemetry.soilRaw;
    saveConfigToFS();

    String path = "devices/" + deviceId + "/config/calibration/soilWetRaw";
    Firebase.RTDB.setInt(&fbdo, path.c_str(), config.soilWetRaw);
    updateCommandAck(cmdId, "done");
    Serial.printf("[Calibrate] Wet raw captured: %d\n", config.soilWetRaw);
  }
  // 4. Bottle Refilled Command
  else if (type == "refilled") {
    config.remainingMl = config.bottleCapacityMl;
    saveConfigToFS();

    String path = "devices/" + deviceId + "/config/bottle/remainingMl";
    Firebase.RTDB.setInt(&fbdo, path.c_str(), config.remainingMl);
    updateCommandAck(cmdId, "done");
    Serial.printf("[Bottle] Refilled to capacity: %d ml\n", config.remainingMl);
  }
}

void updateCommandAck(String cmdId, String status, String reason) {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;

  String path = "devices/" + deviceId + "/command/ack";
  FirebaseJson ackJson;
  ackJson.set("id", cmdId);
  ackJson.set("status", status);
  if (reason.length() > 0) {
    ackJson.set("reason", reason);
  }
  ackJson.set("ts/{.sv}", "timestamp");

  Firebase.RTDB.updateNode(&fbdo, path.c_str(), &ackJson);
}

void logWateringEvent(String trigger, int durationSec, float before, float after, String note) {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;

  String path = "waterLogs/" + deviceId;
  FirebaseJson json;
  json.set("ts/{.sv}", "timestamp");
  json.set("trigger", trigger);
  json.set("durationSec", durationSec);
  json.set("moistureBefore", (int)round(before));
  json.set("moistureAfter", (int)round(after));
  json.set("note", note);

  Firebase.RTDB.pushJSON(&fbdo, path.c_str(), &json);
  Serial.println(F("[WaterLog] Appended watering event log to RTDB"));
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
  config.lightMode = doc["lightMode"] | config.lightMode;
  config.soilDryRaw = doc["soilDryRaw"] | config.soilDryRaw;
  config.soilWetRaw = doc["soilWetRaw"] | config.soilWetRaw;
  config.bottleCapacityMl = doc["bottleCapacityMl"] | config.bottleCapacityMl;
  config.flowMlPerSec = doc["flowMlPerSec"] | config.flowMlPerSec;
  config.remainingMl = doc["remainingMl"] | config.remainingMl;

  Serial.println(F("[FS] Local offline configuration loaded successfully"));
}

void saveConfigToFS() {
  File f = LittleFS.open("/config.json", "w");
  if (!f) return;

  StaticJsonDocument<768> doc;
  doc["mode"] = config.mode;
  doc["location"] = config.location;
  doc["moistureMin"] = config.moistureMin;
  doc["moistureMax"] = config.moistureMax;
  doc["tempMax"] = config.tempMax;
  doc["humidityMax"] = config.humidityMax;
  doc["pumpDurationSec"] = config.pumpDurationSec;
  doc["lightMode"] = config.lightMode;
  doc["soilDryRaw"] = config.soilDryRaw;
  doc["soilWetRaw"] = config.soilWetRaw;
  doc["bottleCapacityMl"] = config.bottleCapacityMl;
  doc["flowMlPerSec"] = config.flowMlPerSec;
  doc["remainingMl"] = config.remainingMl;

  serializeJson(doc, f);
  f.close();
}
