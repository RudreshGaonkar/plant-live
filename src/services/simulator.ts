import { useLiveDevice, DeviceRecord, WaterLog } from '@/store/useLiveDevice';

/**
 * SimulatedDevice implements the hardware contract described in Sections 7.8 & 8 of spec.md.
 * It simulates physical hardware locally:
 * - Telemetry ticks every 2 seconds.
 * - Soil moisture decays faster for terrace/balcony locations.
 * - Temperature and humidity follow smooth curves with integer noise (like DHT11).
 * - Light status toggles bright/dim over time if enabled.
 * - Responds to `waterNow` command: updates pump status, darkens soil, decreases bottle level, and logs water event.
 */
export class SimulatedDevice {
  private timer: ReturnType<typeof setInterval> | null = null;
  private deviceId: string;
  private isRunning = false;
  private stepCount = 0;

  // Developer panel override states
  public overrides: {
    forcedMoisture: number | null;
    forcedTemp: number | null;
    forcedHumidity: number | null;
    forcedBottleRemaining: number | null;
    forceOffline: boolean;
    bottleEmptyTrigger: boolean;
    heatWaveTrigger: boolean;
  } = {
    forcedMoisture: null,
    forcedTemp: null,
    forcedHumidity: null,
    forcedBottleRemaining: null,
    forceOffline: false,
    bottleEmptyTrigger: false,
    heatWaveTrigger: false,
  };

  constructor(deviceId: string = 'demo-leaf-01') {
    this.deviceId = deviceId;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Ensure the device exists in store
    this.ensureInitialState();

    this.timer = setInterval(() => {
      this.tick();
    }, 2000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  private ensureInitialState() {
    const store = useLiveDevice.getState();
    if (!store.devices[this.deviceId]) {
      const initialDev: DeviceRecord = {
        id: this.deviceId,
        config: {
          name: 'Demo Plant Hub',
          plantName: 'Monstera Deliciosa',
          plantSpecies: 'Swiss Cheese Plant',
          hubId: 'hub-demo-1',
          location: 'balcony',
          mode: 'auto',
          thresholds: {
            moistureMin: 30,
            moistureMax: 60,
            tempMax: 35,
            humidityMax: 80,
            pumpDurationSec: 5,
          },
          sensors: {
            lightMode: 'digital',
          },
          calibration: {
            soilDryRaw: 1024,
            soilWetRaw: 400,
          },
          bottle: {
            capacityMl: 500,
            flowMlPerSec: 15,
            remainingMl: 380,
          },
          pairedAt: Date.now() - 86400000 * 2,
        },
        telemetry: {
          soilRaw: 620,
          soilMoisture: 45,
          temperature: 28,
          humidity: 65,
          light: 1, // Bright
          pumpOn: false,
          rssi: -55,
          ts: Date.now(),
        },
        status: {
          online: true,
          lastSeen: Date.now(),
          firmware: 'v1.0.4-sim',
        },
      };

      store.addDevice(initialDev);
    }
  }

  private tick() {
    const store = useLiveDevice.getState();
    const device = store.devices[this.deviceId];
    if (!device) return;

    this.stepCount++;

    // Check forceOffline override
    if (this.overrides.forceOffline) {
      if (device.status.online) {
        useLiveDevice.setState((prev) => ({
          devices: {
            ...prev.devices,
            [this.deviceId]: {
              ...device,
              status: {
                ...device.status,
                online: false,
                lastSeen: Date.now() - 200000, // > 3 min ago
              },
            },
          },
        }));
      }
      return;
    }

    // Natural decay rates based on location (Terrace > Balcony > Indoor)
    let decayRate = 0.2;
    if (device.config.location === 'terrace') decayRate = 0.5;
    else if (device.config.location === 'balcony') decayRate = 0.35;
    else if (device.config.location === 'indoor') decayRate = 0.15;

    // Calculate moisture
    let currentMoisture = device.telemetry.soilMoisture;
    if (this.overrides.forcedMoisture !== null) {
      currentMoisture = this.overrides.forcedMoisture;
    } else if (!store.isWateringActive) {
      currentMoisture = Math.max(10, currentMoisture - decayRate);
    }

    // Calculate DHT11 simulated values (integer with gentle sine fluctuation)
    let temp = Math.round(27 + 2 * Math.sin(this.stepCount / 10));
    if (this.overrides.heatWaveTrigger) {
      temp = 38; // Above tempMax (35)
    } else if (this.overrides.forcedTemp !== null) {
      temp = this.overrides.forcedTemp;
    }

    let humidity = Math.round(62 + 4 * Math.cos(this.stepCount / 8));
    if (this.overrides.forcedHumidity !== null) {
      humidity = this.overrides.forcedHumidity;
    }

    // Toggle light status periodically (every 10 ticks = 20s) if digital lightMode
    const light =
      device.config.sensors.lightMode === 'none'
        ? null
        : Math.floor(this.stepCount / 10) % 2 === 0
        ? 1
        : 0;

    // Bottle remaining level override
    let remainingMl = device.config.bottle.remainingMl;
    if (this.overrides.bottleEmptyTrigger) {
      remainingMl = 0;
    } else if (this.overrides.forcedBottleRemaining !== null) {
      remainingMl = this.overrides.forcedBottleRemaining;
    }

    // Autonomous Auto-watering logic (Section 8.1 of spec.md)
    if (
      device.config.mode === 'auto' &&
      !store.isWateringActive &&
      remainingMl > 20 &&
      currentMoisture < device.config.thresholds.moistureMin
    ) {
      // Guard: Coastal humidity guard
      if (
        humidity > device.config.thresholds.humidityMax &&
        currentMoisture > device.config.thresholds.moistureMin - 10
      ) {
        // Delayed due to high humidity
      } else {
        // Trigger auto cycle
        this.runWaterCycle('auto', device.config.thresholds.pumpDurationSec || 5);
        return;
      }
    }

    // Commit telemetry tick to store
    useLiveDevice.setState((prev) => ({
      devices: {
        ...prev.devices,
        [this.deviceId]: {
          ...device,
          config: {
            ...device.config,
            bottle: {
              ...device.config.bottle,
              remainingMl,
            },
          },
          telemetry: {
            ...device.telemetry,
            soilMoisture: Math.round(currentMoisture * 10) / 10,
            soilRaw: Math.round(
              device.config.calibration.soilDryRaw -
                (currentMoisture / 100) *
                  (device.config.calibration.soilDryRaw - device.config.calibration.soilWetRaw)
            ),
            temperature: temp,
            humidity,
            light,
            ts: Date.now(),
          },
          status: {
            ...device.status,
            online: true,
            lastSeen: Date.now(),
          },
        },
      },
    }));
  }

  /**
   * Runs watering cycle with non-blocking lifecycle updates matching hardware
   */
  public runWaterCycle(trigger: 'auto' | 'manual', durationSec: number = 5) {
    const store = useLiveDevice.getState();
    const device = store.devices[this.deviceId];
    if (!device || store.isWateringActive) return;

    const moistureBefore = device.telemetry.soilMoisture;
    const flowPerSec = device.config.bottle.flowMlPerSec || 15;
    const waterDeducted = flowPerSec * durationSec;
    const remainingMl = Math.max(0, device.config.bottle.remainingMl - waterDeducted);

    useLiveDevice.setState({
      isWateringActive: true,
      wateringSecondsLeft: durationSec,
      devices: {
        ...store.devices,
        [this.deviceId]: {
          ...device,
          telemetry: {
            ...device.telemetry,
            pumpOn: true,
          },
          command: {
            id: `cmd-${Date.now()}`,
            type: 'waterNow',
            durationSec,
            requestedAt: Date.now(),
            ack: {
              id: `ack-${Date.now()}`,
              status: 'running',
              ts: Date.now(),
            },
          },
        },
      },
    });

    let secondsRemaining = durationSec;
    const waterInterval = setInterval(() => {
      secondsRemaining -= 1;
      if (secondsRemaining <= 0) {
        clearInterval(waterInterval);

        const stateNow = useLiveDevice.getState();
        const devNow = stateNow.devices[this.deviceId];
        const newMoisture = Math.min(100, Math.round(moistureBefore + 18));

        const newLog: WaterLog = {
          id: `sim-log-${Date.now()}`,
          ts: Date.now(),
          trigger,
          durationSec,
          moistureBefore,
          moistureAfter: newMoisture,
          note: trigger === 'auto' ? 'Automated soil maintenance' : 'Manual pulse triggered by user',
        };

        useLiveDevice.setState({
          isWateringActive: false,
          wateringSecondsLeft: 0,
          waterLogs: [newLog, ...stateNow.waterLogs],
          devices: {
            ...stateNow.devices,
            [this.deviceId]: {
              ...devNow,
              config: {
                ...devNow.config,
                bottle: {
                  ...devNow.config.bottle,
                  remainingMl,
                },
              },
              telemetry: {
                ...devNow.telemetry,
                pumpOn: false,
                soilMoisture: newMoisture,
                ts: Date.now(),
              },
              command: {
                id: `cmd-${Date.now()}`,
                type: 'waterNow',
                durationSec,
                requestedAt: Date.now(),
                ack: {
                  id: `ack-${Date.now()}`,
                  status: 'done',
                  ts: Date.now(),
                },
              },
            },
          },
        });
      } else {
        useLiveDevice.setState({ wateringSecondsLeft: secondsRemaining });
      }
    }, 1000);
  }
}

// Export singleton simulator instance
export const simulatedDevice = new SimulatedDevice('demo-leaf-01');
