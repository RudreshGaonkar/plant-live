# 🌿 LeafLink ESP8266 Firmware

This directory contains the production Arduino C++ firmware for the **LeafLink Smart Plant-Watering Companion** running on the **NodeMCU v1.0 (ESP-12E Module / ESP8266)**.

---

## 📌 1. Hardware Pin Map (Spec §3.1)

| NodeMCU Pin | GPIO | Device / Sensor | Direction | Logic Level | Notes |
|:---:|:---:|:---|:---:|:---:|:---|
| **A0** | ADC0 | Soil Moisture Sensor | Input (Analog) | 0 – 1.0V (0 – 3.3V with onboard divider) | Calibrated dry/wet range in software. |
| **D5** | GPIO14 | DHT11 Sensor (Temp & Humidity) | Bi-directional | 3.3V | Requires 10kΩ pull-up resistor to 3.3V if not on breakout board. |
| **D6** | GPIO12 | 1-Channel Relay IN (Submersible Pump) | Output (Digital) | 3.3V / 5V | **Active-LOW** relay module. Defaults to HIGH (OFF) on boot. |
| **D7** | GPIO13 | LDR Light Sensor Module Digital Out (DO) | Input (Digital) | 3.3V | Pulls LOW when light is detected (Bright = 1, Dim = 0). |
| **D0** | GPIO16 | Soil Sensor Power Gating (VCC) | Output (Digital) | 3.3V | Toggled HIGH only during reading (25ms) to prevent electrochemical corrosion. |
| **3V3** | 3.3V | Sensor VCC Rail | Power Out | 3.3V | Powers DHT11, LDR, and Soil Sensor. |
| **VIN / VU** | 5V | Relay VCC Rail | Power In/Out | 5.0V | 5V from USB or external regulator to power relay coil. |
| **GND** | GND | Common Ground Rail | Ground | 0V | **Common ground must be shared across NodeMCU, sensors, relay, and external pump supply.** |

---

## ⚡ 2. Circuit Wiring Diagram

```mermaid
graph TD
    subgraph Power Supply
        USB[5V 2A USB Power Supply] -->|5V| VIN[NodeMCU VIN]
        USB -->|5V| RelayVCC[Relay Module VCC]
        USB -->|GND| CommonGND[Common Ground Rail]
    end

    subgraph NodeMCU ESP8266
        NodeMCU[NodeMCU v1.0 Board]
        VIN --> NodeMCU
        CommonGND --> NodeMCU
        NodeMCU -->|3.3V Out| Rail3V3[3.3V Sensor Rail]
    end

    subgraph Sensors
        Rail3V3 --> DHT_VCC[DHT11 VCC]
        Rail3V3 --> LDR_VCC[LDR Module VCC]
        CommonGND --> DHT_GND[DHT11 GND]
        CommonGND --> LDR_GND[LDR GND]
        CommonGND --> Soil_GND[Soil Sensor GND]

        NodeMCU -->|D0 / GPIO16 Power Gate| Soil_VCC[Soil Sensor VCC]
        Soil_OUT[Soil Sensor Signal] -->|Analog| NodeMCU_A0[NodeMCU A0 Pin]
        DHT_OUT[DHT11 Data Pin] -->|Digital| NodeMCU_D5[NodeMCU D5 / GPIO14]
        LDR_OUT[LDR DO Pin] -->|Digital| NodeMCU_D7[NodeMCU D7 / GPIO13]
    end

    subgraph Actuators
        NodeMCU -->|D6 / GPIO12 Active-LOW| Relay_IN[Relay IN]
        RelayVCC --> Relay[1-Channel Relay Module]
        CommonGND --> Relay_GND[Relay GND]
        
        Relay_COM[Relay COM] -->|5V Positive| USB
        Relay_NO[Relay NO] -->|Switched 5V| Pump_POS[Mini 5V Pump (+)]
        CommonGND --> Pump_NEG[Mini 5V Pump (-)]
    end
```

> [!IMPORTANT]
> **Power Rail Isolation & Flyback Protection**: Mini submersible DC pumps cause significant inductive voltage spikes when switched. Do not power the pump directly from the NodeMCU 3.3V pin. Wire the pump to an external 5V power source through the Relay `COM` and `NO` terminals, and ensure the relay module includes an optocoupler and flyback diode.

---

## 🛠️ 3. Arduino IDE Setup & Configuration

### Step A: Install ESP8266 Board Core
1. In Arduino IDE, open **File > Preferences**.
2. Add the following URL to **Additional Boards Manager URLs**:
   ```
   http://arduino.esp8266.com/stable/package_esp8266com_index.json
   ```
3. Open **Tools > Board > Boards Manager**, search for `esp8266` by **ESP8266 Community**, and click **Install** (v3.1.2 or latest).

### Step B: Select Target Board Settings
Configure the board parameters under the **Tools** menu:
- **Board:** `NodeMCU 1.0 (ESP-12E Module)`
- **CPU Frequency:** `80 MHz` (or `160 MHz` for faster SSL/TLS crypto)
- **Flash Size:** `4MB (FS: 2MB OTA:~1019KB)`
- **Upload Speed:** `115200` (or `921600` for fast flashing)
- **Port:** Select your USB-to-UART COM port (CH340 or CP2102 driver required)

---

## 📦 4. Library Dependencies

Install the following libraries via the Arduino IDE **Library Manager** (**Sketch > Include Library > Manage Libraries...**):

1. **`Firebase ESP Client`** by *Mobizt* (v4.4.14 or later)
   - High-performance Firebase Realtime Database SDK supporting background streams and token authentication.
2. **`DHT sensor library`** by *Adafruit* (v1.4.6 or later)
   - Also install the prompted dependency: `Adafruit Unified Sensor`.
3. **`WiFiManager`** by *tzapu* (v2.0.17-arduino or later)
   - Implements captive portal Wi-Fi configuration without hardcoding credentials in source code.
4. **`ArduinoJson`** by *Benoit Blanchon* (v6.21.5 or later)
   - JSON parsing and offline serialization for `LittleFS`.

---

## 🚀 5. Flashing & First-Boot Captive Portal

1. Connect your NodeMCU to your computer via micro-USB.
2. Open `firmware/leaflink/leaflink.ino` in Arduino IDE.
3. Review `FIREBASE_HOST` and `FIREBASE_API_KEY` to ensure they match your project's `.env`.
4. Click **Sketch > Upload**.
5. Open **Tools > Serial Monitor** and set baud rate to `115200`.

### First-Time Wi-Fi Pairing Flow:
1. On first boot, the ESP8266 will broadcast an Access Point named:
   ```
   LeafLink-XXXX (where XXXX is the ESP8266 Chip ID)
   Password: leafsetup
   ```
2. Connect your phone or laptop to the `LeafLink-XXXX` Wi-Fi network.
3. The captive portal will automatically open (or navigate to `http://192.168.4.1`).
4. Select your home Wi-Fi SSID, enter the password, and click **Save**.
5. The NodeMCU will reboot, connect to your router, sync UTC time via NTP, and begin streaming live telemetry to Firebase RTDB!

---

## ⚙️ 6. Firmware Contract & Behavior Engine

### Telemetry Cycle (Every 10 seconds):
- Measures calibrated soil moisture %, temperature, humidity, sunlight status, pump state, and Wi-Fi RSSI.
- Updates `devices/{deviceId}/telemetry` and heartbeats `devices/{deviceId}/status/lastSeen`.
- Appends snapshot to `history/{deviceId}` every 5 minutes.

### Command Execution (`devices/{deviceId}/command`):
- **`waterNow`**: Activates relay, turns pump ON, reports status `running`, runs for `durationSec` (max 15s safety cap), turns pump OFF, reports status `done`, deducts reservoir level (`flowMlPerSec * pumpSec`), and appends a `waterLogs` record.
- **`calibrateDry`**: Captures raw analog ADC in air and persists to LittleFS.
- **`calibrateWet`**: Captures raw analog ADC in water and persists to LittleFS.
- **`refilled`**: Resets estimated reservoir bottle level back to full capacity.

### Embedded Auto-Watering Decision Engine (Spec §8.1):
- Operates locally even if Wi-Fi or Firebase is disconnected.
- Checks if soil moisture is below `moistureMin`.
- **Coastal Humidity Guard**: Delays watering if ambient humidity is above `humidityMax` and soil moisture is within 10% of minimum threshold (prevents waterlogging in coastal regions).
- **Direct Sun Guard**: Delays watering during hot midday sunlight on terraces.
- **Hard Safety**: Relay defaults **OFF** on boot and immediately de-energizes if Wi-Fi drops during a cycle.
