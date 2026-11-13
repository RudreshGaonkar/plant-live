import { create } from 'zustand';
import { ref, set as fbSet, onValue } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth } from '@/services/firebase';
import { updateDeviceConfigInRTDB } from '@/services/devices';

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
  bottleCapacityMl?: number;
  remainingMl?: number;
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

export type DeviceCommandAckStatus = 'received' | 'running' | 'done' | 'rejected' | 'failed' | 'pending';

export interface DeviceCommand {
  id: string;
  type: 'waterNow' | 'calibrateDry' | 'calibrateWet' | 'refilled';
  durationSec?: number;
  capacityMl?: number;
  status?: string;
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
  isConfigHydrated?: boolean;
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
  isWatering: boolean;
  isCommandPending: boolean;
  wateringSecondsLeft: number;
  weather: WeatherData | null;
  weatherLoading: boolean;
  
  // Actions
  setActiveDeviceId: (id: string) => void;
  triggerWaterNow: (durationSec?: number) => void;
  resetWateringState: (targetDeviceId?: string) => void;
  stopWatering: (targetDeviceId?: string) => void;
  toggleMode: () => void | Promise<void>;
  refillBottle: (deviceId?: string) => Promise<boolean> | void;
  clearDeviceState: () => void;
  updateLocation: (location: PlantLocation) => void;
  updateThresholds: (thresholds: Partial<DeviceConfig['thresholds']>) => void;
  updateSensors: (sensors: Partial<DeviceConfig['sensors']>) => void;
  updateTelemetry: (telemetry: Partial<DeviceTelemetry>, targetDeviceId?: string) => void;
  updateConfig: (config: Partial<DeviceConfig>, targetDeviceId?: string) => void;
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
  isConfigHydrated: false,
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
      capacityMl: 0,
      flowMlPerSec: 15,
      remainingMl: 0,
    },
    bottleCapacityMl: 0,
    remainingMl: 0,
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

let activeWateringTimer: ReturnType<typeof setInterval> | null = null;

export const useLiveDevice = create<LiveDeviceStore>((set, get) => ({
  devices: {},
  activeDeviceId: '',
  waterLogs: [],
  isWateringActive: false,
  isWatering: false,
  isCommandPending: false,
  wateringSecondsLeft: 0,
  weather: null,
  weatherLoading: false,

  setActiveDeviceId: (id) => {
    set({ activeDeviceId: id });
    const uid = auth.currentUser?.uid;
    if (uid) {
      if (id) {
        AsyncStorage.setItem(`@plant_live_active_device_${uid}`, id).catch((err) => {
          console.warn('[LiveDevice] Failed to persist activeDeviceId to AsyncStorage:', err);
        });
      } else {
        AsyncStorage.removeItem(`@plant_live_active_device_${uid}`).catch((err) => {
          console.warn('[LiveDevice] Failed to remove activeDeviceId from AsyncStorage:', err);
        });
      }
    }
  },

  resetWateringState: (targetDeviceId?: string) => {
    if (activeWateringTimer) {
      clearInterval(activeWateringTimer);
      activeWateringTimer = null;
    }
    const { activeDeviceId, devices } = get();
    const targetId = targetDeviceId || activeDeviceId || 'leaf-node-01';
    const active = devices[targetId] || createDefaultDeviceRecord(targetId);

    set({
      isWateringActive: false,
      isWatering: false,
      isCommandPending: false,
      wateringSecondsLeft: 0,
      devices: {
        ...devices,
        [targetId]: {
          ...active,
          control: {
            ...active.control,
            pumpState: false,
          },
          telemetry: {
            ...active.telemetry,
            pumpOn: false,
            isPumpActive: false,
          },
        },
      },
    });
  },

  stopWatering: (targetDeviceId?: string) => {
    get().resetWateringState(targetDeviceId);
  },

  triggerWaterNow: (durationSec = 5) => {
    if (activeWateringTimer) {
      clearInterval(activeWateringTimer);
      activeWateringTimer = null;
    }

    const { activeDeviceId, devices } = get();
    const targetId = activeDeviceId || 'leaf-node-01';
    console.log('[LeafLink] Active Device ID:', targetId);
    const active = devices[targetId] || createDefaultDeviceRecord(targetId);

    // Optimistic activation of pump state locally
    set({
      activeDeviceId: targetId,
      isWateringActive: true,
      isWatering: true,
      isCommandPending: true,
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

    activeWateringTimer = setInterval(() => {
      const currentSeconds = get().wateringSecondsLeft;
      if (currentSeconds <= 1) {
        if (activeWateringTimer) {
          clearInterval(activeWateringTimer);
          activeWateringTimer = null;
        }
        
        const stateNow = get();
        const dev = stateNow.devices[targetId];
        if (!dev) return;

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
          isWatering: false,
          isCommandPending: false,
          wateringSecondsLeft: 0,
          waterLogs: [newLog, ...stateNow.waterLogs],
          devices: {
            ...stateNow.devices,
            [targetId]: {
              ...dev,
              control: {
                ...dev.control,
                pumpState: false,
              },
              telemetry: {
                ...dev.telemetry,
                pumpOn: false,
                isPumpActive: false,
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

  toggleMode: async () => {
    const { activeDeviceId, devices } = get();
    const targetId = activeDeviceId || 'leaf-node-01';
    console.log('[LeafLink] Active Device ID:', targetId);
    const active = devices[targetId];
    if (!active) return;
    const prevMode = active.config.mode;
    const nextMode = prevMode === 'auto' ? 'manual' : 'auto';

    // Optimistically update local state
    set({
      devices: {
        ...devices,
        [targetId]: {
          ...active,
          config: {
            ...active.config,
            mode: nextMode,
          },
        },
      },
    });

    try {
      await updateDeviceConfigInRTDB(targetId, { mode: nextMode });
    } catch (err: any) {
      // Revert local state with an error toast if the write fails
      const currentDevices = get().devices;
      const currentActive = currentDevices[targetId];
      if (currentActive) {
        set({
          devices: {
            ...currentDevices,
            [targetId]: {
              ...currentActive,
              config: {
                ...currentActive.config,
                mode: prevMode,
              },
            },
          },
        });
      }
      const errorMsg = err?.message || 'Failed to update device mode. Please check connection.';
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const RN = require('react-native');
        if (RN?.Platform?.OS === 'android' && RN?.ToastAndroid?.show) {
          RN.ToastAndroid.show(errorMsg, RN.ToastAndroid.SHORT);
        } else if (RN?.Alert?.alert) {
          RN.Alert.alert('Mode Update Failed', errorMsg);
        }
      } catch {
        console.warn('[toggleMode] Mode Update Failed:', errorMsg);
      }
    }
  },

  refillBottle: async (deviceId?: string): Promise<boolean> => {
    const { activeDeviceId, devices } = get();
    const targetId = (typeof deviceId === 'string' && deviceId.trim()) ? deviceId : (activeDeviceId || 'leaf-node-01');
    console.log('[LeafLink] Active Device ID:', targetId);
    const active = devices[targetId] || createDefaultDeviceRecord(targetId);
    const validatedCapacity = Math.max(
      250,
      active.config.bottle?.capacityMl ||
      (active.config as any).bottleCapacityMl ||
      1000
    );

    const uniqueId = `cmd-${Date.now()}`;

    // 1. Keep the refill status pending until ack arrives
    set({
      devices: {
        ...devices,
        [targetId]: {
          ...active,
          command: {
            id: uniqueId,
            type: 'refilled',
            capacityMl: validatedCapacity,
            status: 'pending',
            requestedAt: Date.now(),
            ack: {
              id: uniqueId,
              status: 'pending',
              ts: Date.now(),
            },
          },
        },
      },
    });

    // 3. Correlate acknowledgement from /devices/{id}/command/ack matching uniqueId
    return new Promise<boolean>((resolve) => {
      const ackRef = ref(db, `devices/${targetId}/command/ack`);
      let hasResolved = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const unsubscribe = onValue(ackRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const ack = snapshot.val();
        if (ack && ack.id === uniqueId) {
          if (ack.status === 'done') {
            if (!hasResolved) {
              hasResolved = true;
              if (timeoutHandle) clearTimeout(timeoutHandle);
              unsubscribe();

              // Confirm refill in store now that hardware acknowledged done
              const currentDevices = get().devices;
              const cur = currentDevices[targetId] || active;
              set({
                devices: {
                  ...currentDevices,
                  [targetId]: {
                    ...cur,
                    config: {
                      ...cur.config,
                      bottleCapacityMl: validatedCapacity,
                      remainingMl: validatedCapacity,
                      bottle: {
                        ...cur.config.bottle,
                        capacityMl: validatedCapacity,
                        remainingMl: validatedCapacity,
                      },
                    },
                    command: {
                      id: uniqueId,
                      type: 'refilled',
                      capacityMl: validatedCapacity,
                      requestedAt: cur.command?.requestedAt || Date.now(),
                      status: 'done',
                      ack: {
                        id: uniqueId,
                        status: 'done',
                        ts: ack.ts || Date.now(),
                      },
                    },
                  },
                },
              });
              resolve(true);
            }
          } else if (ack.status === 'rejected' || ack.status === 'failed') {
            if (!hasResolved) {
              hasResolved = true;
              if (timeoutHandle) clearTimeout(timeoutHandle);
              unsubscribe();

              const currentDevices = get().devices;
              const cur = currentDevices[targetId] || active;
              set({
                devices: {
                  ...currentDevices,
                  [targetId]: {
                    ...cur,
                    command: {
                      id: uniqueId,
                      type: 'refilled',
                      capacityMl: validatedCapacity,
                      requestedAt: cur.command?.requestedAt || Date.now(),
                      status: ack.status,
                      ack: {
                        id: uniqueId,
                        status: ack.status,
                        reason: ack.reason,
                        ts: ack.ts || Date.now(),
                      },
                    },
                  },
                },
              });
              resolve(false);
            }
          }
        }
      });

      const fail = (reason: string) => {
        if (hasResolved) return;
        hasResolved = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        unsubscribe();
        set((state) => {
          const current = state.devices[targetId];
          if (current?.command?.id !== uniqueId) return state;
          return {
            devices: {
              ...state.devices,
              [targetId]: {
                ...current,
                command: {
                  ...current.command,
                  status: 'failed',
                  ack: { id: uniqueId, status: 'failed', reason, ts: Date.now() },
                },
              },
            },
          };
        });
        resolve(false);
      };

      timeoutHandle = setTimeout(() => fail('refill_timeout'), 20000);
      void fbSet(ref(db, `devices/${targetId}/command`), {
        id: uniqueId,
        type: 'refilled',
        capacityMl: validatedCapacity,
        status: 'pending',
        requestedAt: Date.now(),
        ack: { id: uniqueId, status: 'pending', ts: Date.now() },
      }).catch(() => fail('refill_write_failed'));
    });
  },

  clearDeviceState: () => {
    set({
      devices: {},
      activeDeviceId: '',
      waterLogs: [],
      isWateringActive: false,
      wateringSecondsLeft: 0,
      weather: null,
      weatherLoading: false,
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

  updateTelemetry: (telemetry, targetDeviceId?: string) => {
    const { activeDeviceId, devices } = get();
    const targetId = targetDeviceId || activeDeviceId || 'leaf-node-01';
    const active = devices[targetId] || createDefaultDeviceRecord(targetId);

    const incomingActive = telemetry.isPumpActive;
    const incomingOn = telemetry.pumpOn;

    let isPump: boolean;
    if (incomingActive !== undefined || incomingOn !== undefined) {
      isPump = Boolean(incomingActive === true || incomingOn === true);
    } else {
      isPump = Boolean(active.telemetry.isPumpActive || active.telemetry.pumpOn);
    }

    // Immediately cancel pending local watering interval and reset flags if pump transitions to false
    if (!isPump || incomingOn === false || incomingActive === false) {
      if (activeWateringTimer) {
        clearInterval(activeWateringTimer);
        activeWateringTimer = null;
      }
    }

    set({
      isWateringActive: isPump,
      isWatering: isPump,
      isCommandPending: isPump ? get().isCommandPending : false,
      wateringSecondsLeft: isPump ? get().wateringSecondsLeft : 0,
      devices: {
        ...devices,
        [targetId]: {
          ...active,
          control: {
            ...active.control,
            pumpState: isPump ? active.control?.pumpState : false,
          },
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

  updateConfig: (configPartial, targetDeviceId?: string) => {
    const { activeDeviceId, devices } = get();
    const targetId = targetDeviceId || activeDeviceId || 'leaf-node-01';
    const active = devices[targetId] || createDefaultDeviceRecord(targetId);

    const rawBottle = (configPartial as any).bottle || {};
    const currentBottle = active.config.bottle || { capacityMl: 0, flowMlPerSec: 15, remainingMl: 0 };

    // Standardize nested bottle.remainingMl and bottle.capacityMl as single source of truth
    const resolvedCapacity =
      rawBottle.capacityMl ??
      (configPartial as any).bottleCapacityMl ??
      (currentBottle.capacityMl > 0 ? currentBottle.capacityMl : 1000);

    let resolvedRemaining: number = currentBottle.remainingMl;
    if (typeof rawBottle.remainingMl === 'number') {
      resolvedRemaining = rawBottle.remainingMl;
    } else if (typeof (configPartial as any).remainingMl === 'number') {
      resolvedRemaining = (configPartial as any).remainingMl;
    } else if (typeof active.telemetry.waterLevel === 'number' && active.telemetry.waterLevel > 0) {
      resolvedRemaining = Math.round((active.telemetry.waterLevel * resolvedCapacity) / 100);
    } else if (!active.isConfigHydrated && currentBottle.capacityMl === 0) {
      // First snapshot arrival with no prior hydration: initialize remaining to capacity
      resolvedRemaining = resolvedCapacity;
    }

    set({
      devices: {
        ...devices,
        [targetId]: {
          ...active,
          isConfigHydrated: true,
          config: {
            ...active.config,
            ...configPartial,
            bottleCapacityMl: resolvedCapacity,
            remainingMl: resolvedRemaining,
            bottle: {
              ...currentBottle,
              ...rawBottle,
              capacityMl: resolvedCapacity,
              remainingMl: resolvedRemaining,
              flowMlPerSec: rawBottle.flowMlPerSec ?? currentBottle.flowMlPerSec ?? 15,
            },
          },
        },
      },
    });
  },

  updateCalibration: (calibration, targetDeviceId?: string) => {
    const { activeDeviceId, devices } = get();
    const targetId = targetDeviceId || activeDeviceId || 'leaf-node-01';
    const active = devices[targetId] || createDefaultDeviceRecord(targetId);
    set({
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
    const nextActiveId = remainingKeys.includes(activeDeviceId)
      ? activeDeviceId
      : (remainingKeys[0] ?? '');
    set({
      devices: newDevices,
      activeDeviceId: nextActiveId,
    });
    const uid = auth.currentUser?.uid;
    if (uid) {
      if (nextActiveId) {
        AsyncStorage.setItem(`@plant_live_active_device_${uid}`, nextActiveId).catch(() => {});
      } else {
        AsyncStorage.removeItem(`@plant_live_active_device_${uid}`).catch(() => {});
      }
    }
  },

  addDevice: (newDevice) => {
    set((state) => ({
      devices: {
        ...state.devices,
        [newDevice.id]: newDevice,
      },
      activeDeviceId: newDevice.id,
    }));
    const uid = auth.currentUser?.uid;
    if (uid && newDevice.id) {
      AsyncStorage.setItem(`@plant_live_active_device_${uid}`, newDevice.id).catch((err) => {
        console.warn('[LiveDevice] Failed to persist activeDeviceId in addDevice:', err);
      });
    }
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
