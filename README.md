# LeafLink (Plant-Live) 🌿
> Smart Automated Plant-Watering & Microclimate Telemetry System
> Designed for Balconies, Terraces, and Indoor Gardens with Autonomous ESP8266 Edge Control and Realtime 3D Mobile Companion App.

---

## 📑 Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Key Features & Highlights](#2-key-features--highlights)
3. [Hardware Pin Map & Wiring](#3-hardware-pin-map--wiring)
4. [Quick Start & Local Setup](#4-quick-start--local-setup)
5. [Firebase & Cloud Functions Deployment](#5-firebase--cloud-functions-deployment)
6. [Device Pairing & Onboarding](#6-device-pairing--onboarding)
7. [Automated Unit & Integration Tests](#7-automated-unit--integration-tests)
8. [Code Quality & Standards](#8-code-quality--standards)
9. [License & Credits](#9-license--credits)

---

## 1. Architecture Overview

LeafLink operates on a resilient **Edge-Cloud-Client** hybrid architecture. The ESP8266 microcontroller executes autonomous watering decisions locally even if Wi-Fi or Cloud drops, while Firebase Realtime Database and Cloud Functions synchronize state and push smart alerts to the React Native (Expo) mobile client.

```mermaid
graph TD
    subgraph "Edge Hardware (Balcony / Terrace / Indoor)"
        DHT11["DHT-11 (D5)\nTemp & Humidity"] --> ESP["ESP8266 NodeMCU\n(LeafLink Firmware)"]
        SOIL["Capacitive Soil Sensor (A0)\nAnalog ADC"] --> ESP
        LDR["LDR Sunlight Sensor (D6)\nOptional Light Detection"] --> ESP
        ESP -->|Active-LOW GPIO D7| RELAY["5V Relay Module"]
        RELAY --> PUMP["Submersible 5V Pump"]
        PUMP -->|Water Tube| PLANT["Botanical Specimen"]
    end

    subgraph "Google Cloud & Firebase"
        ESP <-->|RTDB Stream / REST| RTDB[("Firebase Realtime Database\n- devices/{id}/telemetry\n- devices/{id}/config\n- devices/{id}/command\n- waterLogs/{id}\n- alerts/{uid}")]
        RTDB -->|onValueWritten| CF["Cloud Functions (Node.js 20)\n- Alert Engine\n- Coastal Guard\n- 1-min Offline Sweep"]
        CF -->|Expo Push API| PUSH["Expo Notification Service"]
    end

    subgraph "Mobile App (Expo SDK 57 / React Native)"
        RTDB <-->|Live Synchronizer| STORE["Zustand Store\nuseLiveDevice & useSession"]
        STORE --> UI["Mobile Dashboard\n- 3D Plant Hero (60 FPS)\n- Bento Vitals Grid\n- Realtime History Charts\n- Calibration Wizard\n- Manual Water Now Sheet"]
        PUSH --> UI
    end
```

---

## 2. Key Features & Highlights

- **Rotatable 3D Plant Hero (>= 30-60 FPS):** Hardware-accelerated perspective viewport reacting dynamically to 4 botanical health states (`healthy`, `thirsty`, `overwatered`, `unknown/offline`).
- **Coastal-Humidity Guard (Spec §8.1):** Protects plants in humid climates (e.g., coastal zones) by delaying watering cycles if air humidity is high (`> 80% RH`) and soil is within 10% of minimum threshold, preventing fungal root rot.
- **Midday Heat Guard:** Postpones watering during peak scorching sun on terraces to avoid scalding delicate roots.
- **Fail-Safe Firmware:** Relay defaults OFF on boot; hard safety timer enforces a 15-second pump cap; non-blocking `millis()` state machine keeps Wi-Fi and watchdog timer fed.
- **Live Hardware Onboarding:** QR-code guided Wi-Fi provisioning and pairing flow with real RTDB ownership verification.

---

## 3. Hardware Pin Map & Wiring

### Microcontroller: ESP8266 NodeMCU (ESP-12E)

| Component | ESP8266 Pin | NodeMCU GPIO | Signal Type | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Capacitive Soil Moisture** | `A0` | `ADC0` | Analog Input (0-1.0V / 0-1024) | Powered via 3.3V to protect ADC |
| **DHT11 Temp & Humidity** | `D5` | `GPIO 14` | Digital 1-Wire | 10k pull-up resistor to 3.3V |
| **LDR Light Sensor (Optional)** | `D6` | `GPIO 12` | Digital DO (or Analog) | High = Light / Low = Dark |
| **5V Relay Module (Pump)** | `D7` | `GPIO 13` | Digital Output | **Active-LOW** (LOW = ON, HIGH = OFF) |
| **Status LED (Built-in)** | `D4` | `GPIO 2` | Digital Output | Pulses during Wi-Fi connection |

> ⚠️ **Important Wiring Rules:**
> 1. Power the submersible pump from an external 5V 1A+ supply or separate rail; never power the motor directly from the ESP8266 3.3V pin.
> 2. Ensure common ground (GND) is tied between the ESP8266, Relay board, and external 5V power supply.
> 3. Relay module logic inputs must be pulled HIGH on boot to prevent spurious pump activation.

### Flashing Firmware:
1. Open [`firmware/leaflink/leaflink.ino`](file:///firmware/leaflink/leaflink.ino) in Arduino IDE.
2. Select Board: `NodeMCU 1.0 (ESP-12E Module)`.
3. Configure `FIREBASE_HOST`, `FIREBASE_AUTH` (or Device Token), and initial Wi-Fi credentials.
4. Flash at `115200` baud.

---

## 4. Quick Start & Local Setup

### Prerequisites
- Node.js `v20+` or `v24+`
- Expo Go app on your physical iOS/Android phone or Android Studio emulator
- (Optional) Bun or npm

### Installation
```bash
# 1. Clone repository
git clone https://github.com/your-username/plant-live.git
cd plant-live

# 2. Install dependencies (respects Expo SDK 57 compatibility)
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your Firebase web configuration keys
```

### Running the App
```bash
# Start Expo development server
npx expo start

# For tunneling (if phone is on cellular network or separate subnet):
npx expo start --tunnel -c
```

Scan the QR code with **Expo Go** (Android) or Camera (iOS).

---

## 5. Firebase & Cloud Functions Deployment

### 1. Realtime Database Rules
Deploy database security rules defined in [`database.rules.json`](file:///database.rules.json):
```bash
firebase deploy --only database
```

### 2. Cloud Functions
The alert engine and scheduled offline sweep run on Node.js 20:
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

Functions include:
- `onTelemetryWrite`: Evaluates soil dryness, over-watering risk, reservoir low/empty, and coastal humidity guards on every telemetry change.
- `offlineSweep`: Runs every minute via Cloud Scheduler to flag devices offline if `now - lastSeen > 3 minutes`.

---

## 6. Device Pairing & Onboarding

To connect and pair a physical LeafLink controller:

1. Power on your ESP8266 controller.
2. In the LeafLink app, navigate to **Add Device** (`/add-device`).
3. Scan the controller's QR code or enter its MAC/Device ID.
4. Follow the captive portal flow to transmit your 2.4 GHz home Wi-Fi credentials to the controller.
5. Once the controller connects to Firebase RTDB, the app binds ownership under your user account (`users/{uid}/devices/{deviceId}`).

---

## 7. Automated Unit & Integration Tests

The project includes comprehensive Jest test suites covering state mapping, threshold defaults, ADC calibration formulas, autonomous guard logic, and RTDB persistence:

```bash
# Run test suite
npm test
```

### Verified Test Coverage:
- `Plant health state mapping`: `unknown` (unhydrated/offline), `thirsty`, `overwatered`, `healthy`.
- `Location threshold defaults`: `Balcony`, `Terrace`, `Indoor`.
- `Moisture calibration math`: `dryRaw` (1024) -> 0%, `wetRaw` (400) -> 100%, and ADC noise clamping.
- `Autonomous rules engine`: Bottle reserve safety check, cooldown timers, midday heat avoidance, and coastal humidity delay.
- `Device audit and persistence`: Explicit device ID assignment, unhydrated-to-live telemetry handling, and multi-device removal safeguards.

---

## 8. Code Quality & Standards

LeafLink strictly follows modern Expo and TypeScript best practices:

```bash
# Typecheck
npx tsc --noEmit

# Linting
npx expo lint

# Dependency & config diagnostics
npx expo-doctor
```

---

## 9. License & Credits

*Built with ❤️ for Modern Agricultural Engineering & Ubiquitous Computing.*
