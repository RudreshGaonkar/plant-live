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
  temperature: number; // DHT11 C
  humidity: number; // DHT11 % RH
  light: number | null; // null if no LDR; 0/1 or 0-100
  pumpOn: boolean;
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
}

export interface LiveDeviceStore {
  devices: Record<string, DeviceRecord>;
  activeDeviceId: string;
  waterLogs: WaterLog[];
  isWateringActive: boolean;
  wateringSecondsLeft: number;
  
  // Actions
  setActiveDeviceId: (id: string) => void;
  triggerWaterNow: (durationSec?: number) => void;
  toggleMode: () => void;
  refillBottle: () => void;
  updateLocation: (location: PlantLocation) => void;
  updateThresholds: (thresholds: Partial<DeviceConfig['thresholds']>) => void;
  updateSensors: (sensors: Partial<DeviceConfig['sensors']>) => void;
  updateTelemetry: (telemetry: Partial<DeviceTelemetry>) => void;
  addDevice: (device: DeviceRecord) => void;
  setOnlineStatus: (online: boolean) => void;
}

const mockDevice: DeviceRecord = {
  id: 'esp8266-demo-01',
  config: {
    name: 'Balcony Hub Plant',
    plantName: 'Monstera Deliciosa',
    plantSpecies: 'Swiss Cheese Plant',
    hubId: 'hub-home-1',
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

const initialWaterLogs: WaterLog[] = [
  {
    id: 'log-1',
    ts: Date.now() - 3600000 * 4,
    trigger: 'auto',
    durationSec: 5,
    moistureBefore: 27,
    moistureAfter: 48,
    note: 'Optimal morning watering cycle',
  },
  {
    id: 'log-2',
    ts: Date.now() - 3600000 * 18,
    trigger: 'manual',
    durationSec: 3,
    moistureBefore: 29,
    moistureAfter: 44,
    note: 'Quick manual refresh',
  },
  {
    id: 'log-3',
    ts: Date.now() - 86400000,
    trigger: 'auto',
    durationSec: 5,
    moistureBefore: 28,
    moistureAfter: 52,
    note: 'Delayed earlier due to coastal humidity',
  },
];

export const useLiveDevice = create<LiveDeviceStore>((set, get) => ({
  devices: {
    [mockDevice.id]: mockDevice,
  },
  activeDeviceId: mockDevice.id,
  waterLogs: initialWaterLogs,
  isWateringActive: false,
  wateringSecondsLeft: 0,

  setActiveDeviceId: (id) => set({ activeDeviceId: id }),

  triggerWaterNow: (durationSec = 5) => {
    const { activeDeviceId, devices } = get();
    const active = devices[activeDeviceId];
    if (!active) return;

    // Start simulation of command execution
    set({
      isWateringActive: true,
      wateringSecondsLeft: durationSec,
      devices: {
        ...devices,
        [activeDeviceId]: {
          ...active,
          telemetry: {
            ...active.telemetry,
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
    const active = devices[activeDeviceId];
    if (!active) return;
    set({
      devices: {
        ...devices,
        [activeDeviceId]: {
          ...active,
          telemetry: {
            ...active.telemetry,
            ...telemetry,
            ts: Date.now(),
          },
        },
      },
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
}));

export const computePlantHealthState = (device?: DeviceRecord): PlantHealthState => {
  if (!device || !device.status.online) return 'unknown';
  const { soilMoisture } = device.telemetry;
  const { moistureMin, moistureMax } = device.config.thresholds;

  if (soilMoisture < moistureMin) return 'thirsty';
  if (soilMoisture > moistureMax) return 'overwatered';
  return 'healthy';
};
