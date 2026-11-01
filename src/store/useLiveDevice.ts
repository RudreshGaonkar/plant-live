import { create } from 'zustand';

export type PlantLocation = 'balcony' | 'terrace' | 'indoor';
export type DeviceMode = 'auto' | 'manual';
export type LightMode = 'none' | 'digital' | 'analog';
export type PlantHealthState = 'healthy' | 'thirsty' | 'overwatered' | 'unknown';

export interface DeviceConfig {
  name: string;
  plantName: string;
  plantSpecies: string;
  hubId?: string;
  location: PlantLocation;
  mode: DeviceMode;
  thresholds: {
    moistureMin: number;
    moistureMax: number;
    tempMax: number;
    humidityMax: number;
    pumpDurationSec: number;
  };
  sensors: {
    lightMode: LightMode;
  };
  calibration: {
    soilDryRaw: number;
    soilWetRaw: number;
  };
  bottle: {
    capacityMl: number;
    flowMlPerSec: number;
    remainingMl: number;
  };
  pairedAt: number;
}

export interface DeviceTelemetry {
  soilRaw: number;
  soilMoisture: number; // 0 - 100 %
  waterRaw?: number;
  waterLevel?: number; // 0 - 100 %
  waterLevelLow?: boolean;
  temperature: number; // DHT11 C
  humidity: number; // DHT11 % RH
  light: number | null; // null if no LDR; 0/1 or 0-100
  pumpOn: boolean;
  isPumpActive?: boolean;
  rssi: number;
  ts: number;
}

export interface DeviceStatus {
  online: boolean;
  lastSeen: number;
  firmware: string;
}

export type DeviceCommandAckStatus = 'received' | 'running' | 'done' | 'rejected';

export interface DeviceCommand {
  id: string;
  type: 'waterNow' | 'calibrateDry' | 'calibrateWet' | 'refilled';
  durationSec?: number;
  requestedAt: number;
  ack?: {
    id: string;
    status: DeviceCommandAckStatus;
    reason?: string;
    ts: number;
  };
}

export interface WaterLog {
  id: string;
  ts: number;
  timestamp?: number;
  trigger: 'auto' | 'manual';
  durationSec: number;
  moistureBefore: number;
  moistureAfter: number;
  note?: string;
}

export interface DeviceRecord {
  id: string;
  config: DeviceConfig;
  telemetry: DeviceTelemetry;
  status: DeviceStatus;
  command?: DeviceCommand;
  control?: {
    pumpState?: boolean;
    manualOverride?: boolean;
    timestamp?: number;
    durationSec?: number;
    [key: string]: any;
  };
}

export interface WeatherData {
  temperature: number;
  weathercode: number;
  conditionText: string;
  icon: string;
  isRaining: boolean;
  rainProbability: number;
  latitude: number;
  longitude: number;
  cityName?: string;
  isFallback: boolean;
  lastUpdated: number;
}

export interface LiveDeviceStore {
  devices: Record<string, DeviceRecord>;
  activeDeviceId: string;
  waterLogs: WaterLog[];
  isWateringActive: boolean;
  wateringSecondsLeft: number;
  weather: WeatherData | null;
  weatherLoading: boolean;
  
  // Actions
  setActiveDeviceId: (id: string) => void;
  triggerWaterNow: (durationSec?: number) => void;
  toggleMode: () => void;
  refillBottle: () => void;
  updateLocation: (location: PlantLocation) => void;
  updateThresholds: (thresholds: Partial<DeviceConfig['thresholds']>) => void;
  updateSensors: (sensors: Partial<DeviceConfig['sensors']>) => void;
  updateTelemetry: (telemetry: Partial<DeviceTelemetry>) => void;
  updateConfig: (config: Partial<DeviceConfig>) => void;
  updateCalibration: (calibration: DeviceConfig['calibration']) => void;
  removeDevice: (id: string) => void;
  addDevice: (device: DeviceRecord) => void;
  setOnlineStatus: (online: boolean) => void;
  setWeather: (weather: WeatherData | null) => void;
  setWeatherLoading: (loading: boolean) => void;
}

export const mockDevice: DeviceRecord = {
  id: 'esp8266-demo-01',
  config: {
    name: 'Indoor Plant',
    plantName: 'Monstera Deliciosa',
    plantSpecies: 'Swiss Cheese Plant',
    hubId: 'hub-home-1',
    location: 'indoor',
    mode: 'auto',
    thresholds: {
      moistureMin: 35,
      moistureMax: 65,
      tempMax: 32,
      humidityMax: 75,
      pumpDurationSec: 5,
    },
    sensors: {
      lightMode: 'digital',
    },
    calibration: {
      soilDryRaw: 1024,
      soilWetRaw: 420,
    },
    bottle: {
      capacityMl: 500,
      flowMlPerSec: 15,
      remainingMl: 380,
    },
    pairedAt: Date.now() - 86400000 * 3,
  },
  telemetry: {
    soilRaw: 640,
    soilMoisture: 42,
    temperature: 28,
    humidity: 68,
    light: 1, // Bright
    pumpOn: false,
    rssi: -58,
    ts: Date.now(),
  },
  status: {
    online: true,
    lastSeen: Date.now(),
    firmware: 'v1.0.4-esp8266',
  },
};

export const createDefaultDeviceRecord = (id: string = 'leaf-node-01'): DeviceRecord => ({
  id,
  config: {
    name: 'LeafLink Node',
    plantName: 'Monstera Deliciosa',
    plantSpecies: 'Swiss Cheese Plant',
    hubId: 'hub-main',
    location: 'indoor',
    mode: 'auto',
    thresholds: {
      moistureMin: 35,
      moistureMax: 65,
      tempMax: 32,
      humidityMax: 75,
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
      remainingMl: 500,
    },
    pairedAt: Date.now(),
  },
  telemetry: {
    soilRaw: 600,
    soilMoisture: 45,
    temperature: 24,
    humidity: 60,
    light: 1,
    pumpOn: false,
    isPumpActive: false,
    rssi: -60,
    ts: Date.now(),
  },
  status: {
    online: true,
    lastSeen: Date.now(),
    firmware: 'leaflink-esp8266',
  },
  control: {
    pumpState: false,
    manualOverride: false,
    timestamp: Date.now(),
  },
});

export const useLiveDevice = create<LiveDeviceStore>((set, get) => ({
  devices: {},
  activeDeviceId: 'leaf-node-01',
  waterLogs: [],
  isWateringActive: false,
  wateringSecondsLeft: 0,
  weather: null,
  weatherLoading: false,

  setActiveDeviceId: (id) => set({ activeDeviceId: id }),

  triggerWaterNow: (durationSec = 5) => {
    const { activeDeviceId, devices } = get();
    const targetId = activeDeviceId || 'leaf-node-01';
    const active = devices[targetId] || createDefaultDeviceRecord(targetId);

    // Optimistic activation of pump state locally
    set({
      activeDeviceId: targetId,
      isWateringActive: true,
      wateringSecondsLeft: durationSec,
      devices: {
        ...devices,
        [targetId]: {
          ...active,
          control: {
            ...active.control,
            pumpState: true,
            manualOverride: true,
            timestamp: Date.now(),
            durationSec,
          },
          telemetry: {
            ...active.telemetry,
            pumpOn: true,
            isPumpActive: true,
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

    const interval = setInterval(() => {
      const currentSeconds = get().wateringSecondsLeft;
      if (currentSeconds <= 1) {
        clearInterval(interval);
        
        const stateNow = get();
        const dev = stateNow.devices[activeDeviceId];
        const newRemaining = Math.max(
          0,
          dev.config.bottle.remainingMl - dev.config.bottle.flowMlPerSec * durationSec
        );
        const newMoisture = Math.min(100, dev.telemetry.soilMoisture + 15);

        const newLog: WaterLog = {
          id: `log-${Date.now()}`,
          ts: Date.now(),
          trigger: 'manual',
          durationSec,
          moistureBefore: dev.telemetry.soilMoisture,
          moistureAfter: newMoisture,
          note: 'Manual pump trigger',
        };

        set({
          isWateringActive: false,
          wateringSecondsLeft: 0,
          waterLogs: [newLog, ...stateNow.waterLogs],
          devices: {
            ...stateNow.devices,
            [activeDeviceId]: {
              ...dev,
              config: {
                ...dev.config,
                bottle: {
                  ...dev.config.bottle,
                  remainingMl: newRemaining,
                },
              },
              telemetry: {
                ...dev.telemetry,
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
        set({ wateringSecondsLeft: currentSeconds - 1 });
      }
    }, 1000);
  },

  toggleMode: () => {
    const { activeDeviceId, devices } = get();
    const active = devices[activeDeviceId];
    if (!active) return;
    const nextMode = active.config.mode === 'auto' ? 'manual' : 'auto';
    set({
      devices: {
        ...devices,
        [activeDeviceId]: {
          ...active,
          config: {
            ...active.config,
            mode: nextMode,
          },
        },
      },
    });
  },

  refillBottle: () => {
    const { activeDeviceId, devices } = get();
    const active = devices[activeDeviceId];
    if (!active) return;
    set({
      devices: {
        ...devices,
        [activeDeviceId]: {
          ...active,
          config: {
            ...active.config,
            bottle: {
              ...active.config.bottle,
              remainingMl: active.config.bottle.capacityMl,
            },
          },
        },
      },
    });
  },

  updateLocation: (location: PlantLocation) => {
    const { activeDeviceId, devices } = get();
    const active = devices[activeDeviceId];
    if (!active) return;
    
    // Default thresholds based on location from spec.md section 7.2
    let moistureMin = 30;
    let moistureMax = 60;
    let lightMode = active.config.sensors.lightMode;

    if (location === 'indoor') {
      moistureMin = 35;
      moistureMax = 65;
      lightMode = 'none';
    } else if (location === 'balcony') {
      moistureMin = 30;
      moistureMax = 60;
      lightMode = 'digital';
    } else if (location === 'terrace') {
      moistureMin = 25;
      moistureMax = 55;
      lightMode = 'digital';
    }

    set({
      devices: {
        ...devices,
        [activeDeviceId]: {
          ...active,
          config: {
            ...active.config,
            location,
            thresholds: {
              ...active.config.thresholds,
              moistureMin,
              moistureMax,
            },
            sensors: {
              lightMode,
            },
          },
        },
      },
    });
  },

  updateThresholds: (thresholds) => {
    const { activeDeviceId, devices } = get();
    const active = devices[activeDeviceId];
    if (!active) return;
    set({
      devices: {
        ...devices,
        [activeDeviceId]: {
          ...active,
          config: {
            ...active.config,
            thresholds: {
              ...active.config.thresholds,
              ...thresholds,
            },
          },
        },
      },
    });
  },

  updateSensors: (sensors) => {
    const { activeDeviceId, devices } = get();
    const active = devices[activeDeviceId];
    if (!active) return;
    set({
      devices: {
        ...devices,
        [activeDeviceId]: {
          ...active,
          config: {
            ...active.config,
            sensors: {
              ...active.config.sensors,
              ...sensors,
            },
          },
        },
      },
    });
  },

  updateTelemetry: (telemetry) => {
    const { activeDeviceId, devices } = get();
    const targetId = activeDeviceId || 'leaf-node-01';
    const active = devices[targetId] || createDefaultDeviceRecord(targetId);
    const isPump = telemetry.isPumpActive ?? telemetry.pumpOn ?? active.telemetry.isPumpActive ?? false;

    set({
      activeDeviceId: targetId,
      devices: {
        ...devices,
        [targetId]: {
          ...active,
          telemetry: {
            ...active.telemetry,
            ...telemetry,
            isPumpActive: isPump,
            pumpOn: isPump,
            ts: Date.now(),
          },
        },
      },
    });
  },

  updateConfig: (configPartial) => {
    const { activeDeviceId, devices } = get();
    const targetId = activeDeviceId || 'leaf-node-01';
    const active = devices[targetId] || createDefaultDeviceRecord(targetId);
    set({
      activeDeviceId: targetId,
      devices: {
        ...devices,
        [targetId]: {
          ...active,
          config: {
            ...active.config,
            ...configPartial,
          },
        },
      },
    });
  },

  updateCalibration: (calibration) => {
    const { activeDeviceId, devices } = get();
    const targetId = activeDeviceId || 'leaf-node-01';
    const active = devices[targetId] || createDefaultDeviceRecord(targetId);
    set({
      activeDeviceId: targetId,
      devices: {
        ...devices,
        [targetId]: {
          ...active,
          config: {
            ...active.config,
            calibration,
          },
        },
      },
    });
  },

  removeDevice: (id) => {
    const { devices, activeDeviceId } = get();
    const newDevices = { ...devices };
    delete newDevices[id];
    const remainingKeys = Object.keys(newDevices);
    set({
      devices: newDevices,
      activeDeviceId: remainingKeys.includes(activeDeviceId)
        ? activeDeviceId
        : (remainingKeys[0] ?? ''),
    });
  },

  addDevice: (newDevice) => {
    set((state) => ({
      devices: {
        ...state.devices,
        [newDevice.id]: newDevice,
      },
      activeDeviceId: newDevice.id,
    }));
  },

  setOnlineStatus: (online) => {
    const { activeDeviceId, devices } = get();
    const active = devices[activeDeviceId];
    if (!active) return;
    set({
      devices: {
        ...devices,
        [activeDeviceId]: {
          ...active,
          status: {
            ...active.status,
            online,
            lastSeen: online ? Date.now() : active.status.lastSeen,
          },
        },
      },
    });
  },

  setWeather: (weather) => set({ weather }),
  setWeatherLoading: (weatherLoading) => set({ weatherLoading }),
}));

export const computePlantHealthState = (device?: DeviceRecord): PlantHealthState => {
  if (!device || !device.status.online) return 'unknown';
  const { soilMoisture } = device.telemetry;
  const { moistureMin, moistureMax } = device.config.thresholds;

  if (soilMoisture < moistureMin) return 'thirsty';
  if (soilMoisture > moistureMax) return 'overwatered';
  return 'healthy';
};
