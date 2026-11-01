import { useLiveDevice, DeviceRecord, WaterLog } from '@/store/useLiveDevice';

export type SimulatorScenario =
  | 'none'
  | 'bottleEmpty'
  | 'heatWave'
  | 'soilDry'
  | 'overwatered'
  | 'forceOffline';

export interface SimulatorOverrides {
  forcedMoisture: number | null;
  forcedTemp: number | null;
  forcedHumidity: number | null;
  forcedBottleRemaining: number | null;
  forceOffline: boolean;
  activeScenario: SimulatorScenario;
}

/**
 * SimulatedDevice implements the hardware contract described in Sections 7.8 & 8 of spec.md.
 * Enables 100% offline testing and presentation without hardware or Firebase billing.
 */
export class SimulatedDevice {
  private timer: ReturnType<typeof setInterval> | null = null;
  private deviceId: string;
  private isRunning = false;
  private stepCount = 0;

  // Active overrides
  public overrides: SimulatorOverrides = {
    forcedMoisture: null,
    forcedTemp: null,
    forcedHumidity: null,
    forcedBottleRemaining: null,
    forceOffline: false,
    activeScenario: 'none',
  };

  constructor(deviceId: string = 'demo-leaf-01') {
    this.deviceId = deviceId;
  }

  public getTargetDeviceId(): string {
    const store = useLiveDevice.getState();
    return store.activeDeviceId || this.deviceId;
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

  public ensureInitialState() {
    const store = useLiveDevice.getState();
    const targetId = this.getTargetDeviceId();

    if (!store.devices[targetId]) {
      const initialDev: DeviceRecord = {
        id: targetId,
        config: {
          name: 'Indoor Monstera',
          plantName: 'Monstera Deliciosa',
          plantSpecies: 'Swiss Cheese Plant',
          hubId: 'hub-demo-1',
          location: 'indoor',
          mode: 'auto',
          thresholds: {
            moistureMin: 35,
            moistureMax: 65,
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
          pairedAt: Date.now() - 86400000 * 3,
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
      store.setActiveDeviceId(targetId);
    }
  }

  /**
   * Applies a one-tap scenario preset trigger (Spec Section 7.8)
   */
  public triggerScenario(scenario: SimulatorScenario) {
    this.overrides.activeScenario = scenario;
    const targetId = this.getTargetDeviceId();
    const store = useLiveDevice.getState();
    const device = store.devices[targetId];

    switch (scenario) {
      case 'bottleEmpty':
        this.overrides.forceOffline = false;
        this.overrides.forcedBottleRemaining = 0;
        this.overrides.forcedMoisture = null;
        this.overrides.forcedTemp = null;
        this.overrides.forcedHumidity = null;
        if (device) {
          useLiveDevice.setState((prev) => ({
            devices: {
              ...prev.devices,
              [targetId]: {
                ...device,
                config: {
                  ...device.config,
                  bottle: { ...device.config.bottle, remainingMl: 0 },
                },
                status: { ...device.status, online: true, lastSeen: Date.now() },
              },
            },
          }));
        }
        break;

      case 'heatWave':
        this.overrides.forceOffline = false;
        this.overrides.forcedTemp = 42;
        this.overrides.forcedHumidity = 25;
        if (device) {
          useLiveDevice.setState((prev) => ({
            devices: {
              ...prev.devices,
              [targetId]: {
                ...device,
                telemetry: {
                  ...device.telemetry,
                  temperature: 42,
                  humidity: 25,
                  ts: Date.now(),
                },
                status: { ...device.status, online: true, lastSeen: Date.now() },
              },
            },
          }));
        }
        break;

      case 'soilDry':
        this.overrides.forceOffline = false;
        this.overrides.forcedMoisture = 15;
        if (device) {
          useLiveDevice.setState((prev) => ({
            devices: {
              ...prev.devices,
              [targetId]: {
                ...device,
                telemetry: {
                  ...device.telemetry,
                  soilMoisture: 15,
                  ts: Date.now(),
                },
                status: { ...device.status, online: true, lastSeen: Date.now() },
              },
            },
          }));
        }
        break;

      case 'overwatered':
        this.overrides.forceOffline = false;
        this.overrides.forcedMoisture = 90;
        this.overrides.forcedHumidity = 85;
        if (device) {
          useLiveDevice.setState((prev) => ({
            devices: {
              ...prev.devices,
              [targetId]: {
                ...device,
                telemetry: {
                  ...device.telemetry,
                  soilMoisture: 90,
                  humidity: 85,
                  ts: Date.now(),
                },
                status: { ...device.status, online: true, lastSeen: Date.now() },
              },
            },
          }));
        }
        break;

      case 'forceOffline':
        this.overrides.forceOffline = true;
        if (device) {
          useLiveDevice.setState((prev) => ({
            devices: {
              ...prev.devices,
              [targetId]: {
                ...device,
                status: {
                  ...device.status,
                  online: false,
                  lastSeen: Date.now() - 250000, // > 3 min ago
                },
              },
            },
          }));
        }
        break;

      case 'none':
      default:
        this.resetOverrides();
        break;
    }
  }

  public resetOverrides() {
    this.overrides = {
      forcedMoisture: null,
      forcedTemp: null,
      forcedHumidity: null,
      forcedBottleRemaining: null,
      forceOffline: false,
      activeScenario: 'none',
    };

    const targetId = this.getTargetDeviceId();
    const store = useLiveDevice.getState();
    const device = store.devices[targetId];
    if (device) {
      useLiveDevice.setState((prev) => ({
        devices: {
          ...prev.devices,
          [targetId]: {
            ...device,
            status: {
              ...device.status,
              online: true,
              lastSeen: Date.now(),
            },
          },
        },
      }));
    }
  }

  /**
   * Sets manual slider telemetry overrides with immediate reactive dispatch
   */
  public setForcedMoisture(val: number | null) {
    this.overrides.forcedMoisture = val;
    this.overrides.activeScenario = 'none';
    const targetId = this.getTargetDeviceId();
    if (val !== null) {
      const dev = useLiveDevice.getState().devices[targetId];
      if (dev) {
        useLiveDevice.setState((prev) => ({
          devices: {
            ...prev.devices,
            [targetId]: {
              ...dev,
              telemetry: { ...dev.telemetry, soilMoisture: val, ts: Date.now() },
            },
          },
        }));
      }
    }
  }

  public setForcedTemp(val: number | null) {
    this.overrides.forcedTemp = val;
    this.overrides.activeScenario = 'none';
    const targetId = this.getTargetDeviceId();
    if (val !== null) {
      const dev = useLiveDevice.getState().devices[targetId];
      if (dev) {
        useLiveDevice.setState((prev) => ({
          devices: {
            ...prev.devices,
            [targetId]: {
              ...dev,
              telemetry: { ...dev.telemetry, temperature: val, ts: Date.now() },
            },
          },
        }));
      }
    }
  }

  public setForcedHumidity(val: number | null) {
    this.overrides.forcedHumidity = val;
    this.overrides.activeScenario = 'none';
    const targetId = this.getTargetDeviceId();
    if (val !== null) {
      const dev = useLiveDevice.getState().devices[targetId];
      if (dev) {
        useLiveDevice.setState((prev) => ({
          devices: {
            ...prev.devices,
            [targetId]: {
              ...dev,
              telemetry: { ...dev.telemetry, humidity: val, ts: Date.now() },
            },
          },
        }));
      }
    }
  }

  public setForcedBottleRemaining(val: number | null) {
    this.overrides.forcedBottleRemaining = val;
    this.overrides.activeScenario = 'none';
    const targetId = this.getTargetDeviceId();
    if (val !== null) {
      const dev = useLiveDevice.getState().devices[targetId];
      if (dev) {
        useLiveDevice.setState((prev) => ({
          devices: {
            ...prev.devices,
            [targetId]: {
              ...dev,
              config: {
                ...dev.config,
                bottle: { ...dev.config.bottle, remainingMl: val },
              },
            },
          },
        }));
      }
    }
  }

  /**
   * Main 2-second simulation tick
   */
  private tick() {
    const store = useLiveDevice.getState();
    const targetId = this.getTargetDeviceId();
    const device = store.devices[targetId];
    if (!device) return;

    this.stepCount++;

    // 1. Force offline simulation
    if (this.overrides.forceOffline) {
      if (device.status.online) {
        useLiveDevice.setState((prev) => ({
          devices: {
            ...prev.devices,
            [targetId]: {
              ...device,
              status: {
                ...device.status,
                online: false,
                lastSeen: Date.now() - 220000, // > 3 min
              },
            },
          },
        }));
      }
      return;
    }

    // 2. Moisture decay rate (faster for terrace/balcony)
    let decayRate = 0.2;
    if (device.config.location === 'terrace') decayRate = 0.55;
    else if (device.config.location === 'balcony') decayRate = 0.35;
    else if (device.config.location === 'indoor') decayRate = 0.15;

    let currentMoisture = device.telemetry.soilMoisture;
    if (this.overrides.forcedMoisture !== null) {
      currentMoisture = this.overrides.forcedMoisture;
    } else if (!store.isWateringActive) {
      currentMoisture = Math.max(10, currentMoisture - decayRate);
    }

    // 3. DHT11 temperature and humidity curves with integer noise
    let temp: number;
    if (this.overrides.forcedTemp !== null) {
      temp = this.overrides.forcedTemp;
    } else {
      const sineWave = Math.sin(this.stepCount / 10);
      const ambientNoise = (this.stepCount % 3 === 0 ? 1 : 0);
      temp = Math.round(27 + 3 * sineWave + ambientNoise);
    }

    let humidity: number;
    if (this.overrides.forcedHumidity !== null) {
      humidity = this.overrides.forcedHumidity;
    } else {
      const cosineWave = Math.cos(this.stepCount / 8);
      humidity = Math.round(62 + 5 * cosineWave);
    }

    // 4. Sunlight toggling over time (Bright / Dim) if digital
    let light: number | null = null;
    if (device.config.sensors.lightMode === 'digital') {
      light = Math.floor(this.stepCount / 12) % 2 === 0 ? 1 : 0;
    } else if (device.config.sensors.lightMode === 'analog') {
      light = Math.round(45 + 35 * Math.sin(this.stepCount / 15));
    }

    // 5. Bottle remaining level
    let remainingMl = device.config.bottle.remainingMl;
    if (this.overrides.forcedBottleRemaining !== null) {
      remainingMl = this.overrides.forcedBottleRemaining;
    }

    // 6. Autonomous Auto-Watering decision (Spec Section 8.1 & Smart Terrace Rain Delay)
    if (
      device.config.mode === 'auto' &&
      !store.isWateringActive &&
      currentMoisture < device.config.thresholds.moistureMin
    ) {
      // Smart Terrace Rain Delay Logic:
      // Apply rain-delay logic using dynamic weather data ONLY when active plant location is set to "Terrace" and rain probability exceeds 70%.
      // Override rain-delay if soil moisture drops below CRITICAL_MIN (15%) to avoid false alarms.
      // Do NOT affect manual watering or indoor plants.
      const isTerrace = device.config.location === 'terrace';
      const rainProbability = store.weather?.rainProbability ?? 0;
      const isCriticalMoisture = currentMoisture < 15; // CRITICAL_MIN

      if (isTerrace && rainProbability > 70 && !isCriticalMoisture) {
        // Delayed due to impending terrace rainfall
      } else if (
        humidity > device.config.thresholds.humidityMax &&
        currentMoisture > device.config.thresholds.moistureMin - 10
      ) {
        // Delayed due to coastal humidity
      } else {
        this.runWaterCycle('auto', device.config.thresholds.pumpDurationSec || 5);
        return;
      }
    }

    // 7. Commit telemetry tick
    useLiveDevice.setState((prev) => ({
      devices: {
        ...prev.devices,
        [targetId]: {
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
   * Simulates full `waterNow` command lifecycle:
   * sent -> received -> running -> done, updates bottle, moisture, and appends waterLog
   */
  public runWaterCycle(trigger: 'auto' | 'manual', durationSec: number = 5) {
    const store = useLiveDevice.getState();
    const targetId = this.getTargetDeviceId();
    const device = store.devices[targetId];
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
        [targetId]: {
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
        const devNow = stateNow.devices[targetId];
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
            [targetId]: {
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
