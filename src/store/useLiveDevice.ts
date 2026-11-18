import { auth, db } from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { set as fbSet, onValue, ref, update } from 'firebase/database';
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
    waterDurationSec?: number;
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
  pumpDurationSec?: number;
  waterDurationSec?: number;
  flowMlPerSec?: number;
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
  autoCooldownRemainingSec?: number;
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

export type RefillOutcome =
  | { success: true; capacityMl: number }
  | { success: false; reason: 'rejected' | 'failed' | 'timeout'; message: string };

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

export type SnapshotStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface DeviceRecord {
  id: string;
  config: DeviceConfig;
  telemetry: DeviceTelemetry | null;
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
  configStatus?: SnapshotStatus;
  telemetryStatus?: SnapshotStatus;
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
  wateringDeviceId: string | null;
  waterLogs: WaterLog[];
  manualCooldownUntilByDevice: Record<string, number>;
  startManualCooldown: (deviceId: string) => void;
  isWateringActive: boolean;
  isWatering: boolean;
  isCommandPending: boolean;
  wateringSecondsLeft: number;
  weather: WeatherData | null;
  weatherLoading: boolean;

  // Actions
  setActiveDeviceId: (id: string) => void;
  seedDeviceRecords: (deviceIds: string[], preferredActiveId?: string | null) => string;
  triggerWaterNow: (durationSec?: number, deviceId?: string) => void;
  resetWateringState: (targetDeviceId?: string) => void;
  stopWatering: (targetDeviceId?: string) => void;
  toggleMode: () => void | Promise<void>;
  refillBottle: (deviceId?: string) => Promise<boolean> | void;
  requestRefill: (deviceId?: string) => Promise<RefillOutcome>;
  clearDeviceState: () => void;
  updateLocation: (location: PlantLocation) => void;
  updateThresholds: (thresholds: Partial<DeviceConfig['thresholds']>) => void;
  updateSensors: (sensors: Partial<DeviceConfig['sensors']>) => void;
  updateTelemetry: (telemetry: Partial<DeviceTelemetry>, targetDeviceId?: string) => void;
  clearTelemetry: (deviceId: string) => void;
  updateConfig: (config: Partial<DeviceConfig>, targetDeviceId?: string) => void;
  updateCalibration: (calibration: DeviceConfig['calibration'], targetDeviceId?: string) => void;
  removeDevice: (id: string) => void;
  addDevice: (device: DeviceRecord) => void;
  setOnlineStatus: (online: boolean) => void;
  setWeather: (weather: WeatherData | null) => void;
  setWeatherLoading: (loading: boolean) => void;
}

export const createDefaultDeviceRecord = (id: string): DeviceRecord => ({
  id,
  isConfigHydrated: false,
  configStatus: 'loading',
  telemetryStatus: 'loading',
  config: {
    name: '',
    plantName: '',
    plantSpecies: '',
    hubId: '',
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
    pairedAt: 0,
  },
  telemetry: null,
  status: {
    online: false,
    lastSeen: 0,
    firmware: '',
  },
  control: {
    pumpState: false,
    manualOverride: false,
    timestamp: 0,
  },
});

let activeWateringTimer: ReturnType<typeof setInterval> | null = null;
const inFlightRefills = new Map<string, Promise<RefillOutcome>>();

const modeWrites = new Set<string>();

export const useLiveDevice = create<LiveDeviceStore>((set, get) => ({
  devices: {},
  activeDeviceId: '',
  wateringDeviceId: null,
  waterLogs: [],
  manualCooldownUntilByDevice: {},
  startManualCooldown: (deviceId) => set((state) => ({
    manualCooldownUntilByDevice: {
      ...state.manualCooldownUntilByDevice,
      [deviceId]: Date.now() + 60_000,
    },
  })),
  isWateringActive: false,
  isWatering: false,
  isCommandPending: false,
  wateringSecondsLeft: 0,
  weather: null,
  weatherLoading: false,

  setActiveDeviceId: (id) => {
    const { devices, wateringDeviceId, isWateringActive } = get();
    const dev = devices[id];
    const devPumpOn = Boolean(dev?.telemetry?.pumpOn || dev?.telemetry?.isPumpActive);
    const isThisDeviceWatering = wateringDeviceId === id ? isWateringActive : devPumpOn;

    set({
      activeDeviceId: id,
      isWateringActive: isThisDeviceWatering,
      isWatering: isThisDeviceWatering,
      ...(!isThisDeviceWatering && {
        wateringSecondsLeft: 0,
        isCommandPending: false,
      }),
    });
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

  seedDeviceRecords: (deviceIds: string[], preferredActiveId?: string | null) => {
    const { devices, activeDeviceId } = get();
    const nextDevices: Record<string, DeviceRecord> = {};

    // 1. Reconcile records: preserve existing in-memory records, initialize missing ones with createDefaultDeviceRecord
    for (const id of deviceIds) {
      nextDevices[id] = devices[id] || createDefaultDeviceRecord(id);
    }

    // 2. Resolve activeDeviceId atomically
    let resolvedActiveId = '';
    if (preferredActiveId && deviceIds.includes(preferredActiveId)) {
      resolvedActiveId = preferredActiveId;
    } else if (activeDeviceId && deviceIds.includes(activeDeviceId)) {
      resolvedActiveId = activeDeviceId;
    } else if (deviceIds.length > 0) {
      resolvedActiveId = deviceIds[0];
    }

    // Ensure active device is present in nextDevices if resolvedActiveId exists
    if (resolvedActiveId && !nextDevices[resolvedActiveId]) {
      nextDevices[resolvedActiveId] = devices[resolvedActiveId] || createDefaultDeviceRecord(resolvedActiveId);
    }

    const dev = resolvedActiveId ? nextDevices[resolvedActiveId] : undefined;
    const devPumpOn = Boolean(dev?.telemetry?.pumpOn || dev?.telemetry?.isPumpActive);

    // Atomically commit devices and activeDeviceId together
    set({
      devices: nextDevices,
      activeDeviceId: resolvedActiveId,
      isWateringActive: devPumpOn,
      isWatering: devPumpOn,
    });

    const uid = auth.currentUser?.uid;
    if (uid) {
      if (resolvedActiveId) {
        AsyncStorage.setItem(`@plant_live_active_device_${uid}`, resolvedActiveId).catch(() => { });
      } else {
        AsyncStorage.removeItem(`@plant_live_active_device_${uid}`).catch(() => { });
      }
    }

    return resolvedActiveId;
  },

  resetWateringState: (targetDeviceId?: string) => {
    const { activeDeviceId, devices, wateringDeviceId } = get();
    const targetId = targetDeviceId || activeDeviceId;
    const resetGlobal = (wateringDeviceId || activeDeviceId) === targetId;
    if (resetGlobal && activeWateringTimer) {
      clearInterval(activeWateringTimer);
      activeWateringTimer = null;
    }
    if (!targetId || !devices[targetId]) {
      if (resetGlobal) set({
        isWateringActive: false,
        isWatering: false,
        isCommandPending: false,
        wateringSecondsLeft: 0,
        wateringDeviceId: null,
      });
      return;
    }
    const active = devices[targetId];

    set({
      ...(resetGlobal && {
        isWateringActive: false,
        isWatering: false,
        isCommandPending: false,
        wateringSecondsLeft: 0,
        wateringDeviceId: null,
      }),
      devices: {
        ...devices,
        [targetId]: {
          ...active,
          control: {
            ...active.control,
            pumpState: false,
          },
          telemetry: active.telemetry
            ? {
              ...active.telemetry,
              pumpOn: false,
              isPumpActive: false,
            }
            : null,
        },
      },
    });
  },

  stopWatering: (targetDeviceId?: string) => {
    get().resetWateringState(targetDeviceId);
  },

  triggerWaterNow: (durationSec = 5, deviceId?: string) => {
    if (activeWateringTimer) {
      clearInterval(activeWateringTimer);
      activeWateringTimer = null;
    }

    const { activeDeviceId, devices } = get();
    const targetId = deviceId || activeDeviceId;
    if (!targetId || !devices[targetId]) return;
    console.log('[LeafLink] Active Device ID:', targetId);
    const active = devices[targetId];

    // Optimistic activation of pump state locally
    set({
      activeDeviceId: targetId,
      wateringDeviceId: targetId,
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
          telemetry: active.telemetry
            ? {
              ...active.telemetry,
              pumpOn: true,
              isPumpActive: true,
            }
            : null,
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

        // Controller is single source of truth: no simulated moisture additions or client water log writes
        set({
          isWateringActive: false,
          isWatering: false,
          isCommandPending: false,
          wateringSecondsLeft: 0,
          wateringDeviceId: null,
          devices: {
            ...stateNow.devices,
            [targetId]: {
              ...dev,
              control: {
                ...dev.control,
                pumpState: false,
              },
              telemetry: dev.telemetry
                ? {
                  ...dev.telemetry,
                  pumpOn: false,
                  isPumpActive: false,
                }
                : null,
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
    const targetId = activeDeviceId;
    if (!targetId) return;
    console.log('[LeafLink] Active Device ID:', targetId);
    const active = devices[targetId];
    if (!active) return;
    const prevMode = active.config.mode;
    const nextMode = prevMode === 'auto' ? 'manual' : 'auto';

    const account = auth.currentUser;
    const writeKey = JSON.stringify([account?.uid, targetId]);
    if (modeWrites.has(writeKey)) return;
    modeWrites.add(writeKey);

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
      await update(ref(db, `devices/${targetId}/config`), { mode: nextMode });
    } catch (err: any) {
      if (auth.currentUser !== account) return;
      // Revert local state with an error toast if the write fails
      const currentDevices = get().devices;
      const currentActive = currentDevices[targetId];
      if (currentActive?.config.mode === nextMode) {
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
    } finally {
      modeWrites.delete(writeKey);
    }
  },

  requestRefill: async (deviceId?: string): Promise<RefillOutcome> => {
    const { activeDeviceId } = get();
    const targetId = (typeof deviceId === 'string' && deviceId.trim()) ? deviceId : activeDeviceId;
    if (!targetId || !get().devices[targetId]) {
      return { success: false, reason: 'failed', message: 'No target device available for refill' };
    }

    // Deduplicate concurrent refills per device
    const existingInFlight = inFlightRefills.get(targetId);
    if (existingInFlight) {
      return existingInFlight;
    }

    const refillPromise = (async (): Promise<RefillOutcome> => {
      console.log('[LeafLink] Active Device ID for Refill:', targetId);
      const active = get().devices[targetId] || createDefaultDeviceRecord(targetId);
      const devConfig = active.config;
      const configuredCapacity = devConfig.bottle?.capacityMl || devConfig.bottleCapacityMl || 0;
      const validatedCapacity = configuredCapacity > 0 ? configuredCapacity : 500;

      const uniqueId = `cmd-${Date.now()}`;

      // 1. Keep the refill status pending until ack arrives
      set((state) => {
        const cur = state.devices[targetId] || active;
        return {
          devices: {
            ...state.devices,
            [targetId]: {
              ...cur,
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
        };
      });

      // 2. Correlate acknowledgement from /devices/{id}/command/ack matching uniqueId
      return new Promise<RefillOutcome>((resolve) => {
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

                // Confirm refill in store using actual applied capacity returned/confirmed by controller
                const appliedCapacity =
                  typeof ack.capacityMl === 'number' && ack.capacityMl > 0
                    ? ack.capacityMl
                    : validatedCapacity;

                const currentDevices = get().devices;
                const cur = currentDevices[targetId] || active;
                set({
                  devices: {
                    ...currentDevices,
                    [targetId]: {
                      ...cur,
                      config: {
                        ...cur.config,
                        bottleCapacityMl: appliedCapacity,
                        remainingMl: appliedCapacity,
                        bottle: {
                          ...cur.config.bottle,
                          capacityMl: appliedCapacity,
                          remainingMl: appliedCapacity,
                        },
                      },
                      command: {
                        id: uniqueId,
                        type: 'refilled',
                        capacityMl: appliedCapacity,
                        requestedAt: cur.command?.requestedAt || Date.now(),
                        status: 'done',
                        ack: {
                          id: uniqueId,
                          status: 'done',
                          ts: ack.ts || Date.now(),
                          ...(typeof ack.capacityMl === 'number' ? { capacityMl: ack.capacityMl } : {}),
                        },
                      },
                    },
                  },
                });
                resolve({ success: true, capacityMl: appliedCapacity });
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

                if (ack.status === 'rejected') {
                  resolve({
                    success: false,
                    reason: 'rejected',
                    message: ack.reason || 'Controller rejected refill',
                  });
                } else {
                  resolve({
                    success: false,
                    reason: 'failed',
                    message: ack.reason || 'Refill failed on controller',
                  });
                }
              }
            }
          }
        });

        const fail = (reason: 'timeout' | 'failed', message: string) => {
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
                    ack: { id: uniqueId, status: 'failed', reason: message, ts: Date.now() },
                  },
                },
              },
            };
          });
          resolve({ success: false, reason, message });
        };

        timeoutHandle = setTimeout(() => fail('timeout', 'Controller did not confirm'), 20000);
        void fbSet(ref(db, `devices/${targetId}/command`), {
          id: uniqueId,
          type: 'refilled',
          capacityMl: validatedCapacity,
          requestedAt: Date.now(),
        }).catch(() => fail('failed', 'Failed to send refill command to device'));
      });
    })();

    inFlightRefills.set(targetId, refillPromise);
    try {
      return await refillPromise;
    } finally {
      inFlightRefills.delete(targetId);
    }
  },

  refillBottle: async (deviceId?: string): Promise<boolean> => {
    const outcome = await get().requestRefill(deviceId);
    return outcome.success;
  },

  clearDeviceState: () => {
    if (activeWateringTimer) clearInterval(activeWateringTimer);
    activeWateringTimer = null;
    set({
      devices: {},
      activeDeviceId: '',
      waterLogs: [],
      manualCooldownUntilByDevice: {},
      wateringDeviceId: null,
      isCommandPending: false,
      isWatering: false,
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
    // Preserves active sensors.lightMode so user/firmware light sensor configuration is retained
    let moistureMin = 30;
    let moistureMax = 60;
    const currentLightMode = active.config.sensors?.lightMode ?? 'digital';

    if (location === 'indoor') {
      moistureMin = 35;
      moistureMax = 65;
    } else if (location === 'balcony') {
      moistureMin = 30;
      moistureMax = 60;
    } else if (location === 'terrace') {
      moistureMin = 25;
      moistureMax = 55;
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
              ...active.config.sensors,
              lightMode: currentLightMode,
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
    const targetId = targetDeviceId || activeDeviceId;
    if (!targetId || !devices[targetId]) return;
    const active = devices[targetId];

    const incomingActive = telemetry.isPumpActive;
    const incomingOn = telemetry.pumpOn;

    let isPump: boolean;
    if (incomingActive !== undefined || incomingOn !== undefined) {
      isPump = Boolean(incomingActive === true || incomingOn === true);
    } else {
      isPump = Boolean(active.telemetry?.isPumpActive || active.telemetry?.pumpOn);
    }

    // Immediately cancel pending local watering interval and reset flags if pump transitions to false
    const isActiveDevice = targetId === activeDeviceId;
    if (isActiveDevice && (!isPump || incomingOn === false || incomingActive === false)) {
      if (activeWateringTimer) {
        clearInterval(activeWateringTimer);
        activeWateringTimer = null;
      }
    }

    set({
      ...(isActiveDevice && {
        isWateringActive: isPump,
        isWatering: isPump,
        isCommandPending: isPump ? get().isCommandPending : false,
        wateringSecondsLeft: isPump ? get().wateringSecondsLeft : 0,
      }),
      devices: {
        ...devices,
        [targetId]: {
          ...active,
          control: {
            ...active.control,
            pumpState: isPump ? active.control?.pumpState : false,
          },
          telemetry: {
            ...(active.telemetry || {
              soilRaw: 0,
              soilMoisture: 0,
              temperature: 0,
              humidity: 0,
              light: null,
              pumpOn: false,
              rssi: 0,
              ts: 0,
            }),
            ...telemetry,
            isPumpActive: isPump,
            pumpOn: isPump,
            ts: Number.isFinite(telemetry.soilMoisture) ? (telemetry.ts ?? 0) : (active.telemetry?.ts ?? 0),
          },
          telemetryStatus: 'ready',
        },
      },
    });
  },

  clearTelemetry: (deviceId) => {
    const { devices } = get();
    const device = devices[deviceId];
    if (device) {
      set({
        devices: {
          ...devices,
          [deviceId]: {
            ...device,
            telemetry: null,
            telemetryStatus: 'empty',
          },
        },
      });
    }
  },

  updateConfig: (configPartial, targetDeviceId?: string) => {
    const { activeDeviceId, devices } = get();
    const targetId = targetDeviceId || activeDeviceId;
    if (!targetId) return;
    const active = devices[targetId] || createDefaultDeviceRecord(targetId);

    const rawBottle = (configPartial as any).bottle || {};
    const currentBottle = active.config.bottle || { capacityMl: 0, flowMlPerSec: 15, remainingMl: 0 };

    // Standardize nested bottle.remainingMl and bottle.capacityMl as single source of truth
    const resolvedCapacity =
      rawBottle.capacityMl ??
      (configPartial as any).bottleCapacityMl ??
      (currentBottle.capacityMl > 0 ? currentBottle.capacityMl : 0);

    let resolvedRemaining: number = currentBottle.remainingMl ?? 0;
    if (typeof rawBottle.remainingMl === 'number') {
      resolvedRemaining = rawBottle.remainingMl;
    } else if (typeof (configPartial as any).remainingMl === 'number') {
      resolvedRemaining = (configPartial as any).remainingMl;
    } else if (typeof active.telemetry?.waterLevel === 'number' && active.telemetry.waterLevel >= 0) {
      resolvedRemaining = Math.round((active.telemetry.waterLevel * resolvedCapacity) / 100);
    }

    // Reconcile remaining water volume if bottle size is lowered below current remaining volume
    if (resolvedCapacity > 0 && resolvedRemaining > resolvedCapacity) {
      resolvedRemaining = resolvedCapacity;
    }

    set({
      devices: {
        ...devices,
        [targetId]: {
          ...active,
          isConfigHydrated: true,
          configStatus: 'ready',
          config: {
            ...active.config,
            ...configPartial,
            thresholds: {
              ...active.config.thresholds,
              ...configPartial.thresholds,
              pumpDurationSec:
                configPartial.thresholds?.pumpDurationSec ??
                configPartial.thresholds?.waterDurationSec ??
                configPartial.pumpDurationSec ??
                configPartial.waterDurationSec ??
                active.config.thresholds.pumpDurationSec,
            },
            sensors: { ...active.config.sensors, ...configPartial.sensors },
            calibration: { ...active.config.calibration, ...configPartial.calibration },
            bottleCapacityMl: resolvedCapacity,
            remainingMl: resolvedRemaining,
            bottle: {
              ...currentBottle,
              ...rawBottle,
              capacityMl: resolvedCapacity,
              remainingMl: resolvedRemaining,
              flowMlPerSec: rawBottle.flowMlPerSec ?? configPartial.flowMlPerSec ?? currentBottle.flowMlPerSec ?? 15,
            },
          },
        },
      },
    });
  },

  updateCalibration: (calibration, targetDeviceId?: string) => {
    const { activeDeviceId, devices } = get();
    const targetId = targetDeviceId || activeDeviceId;
    if (!targetId) return;
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
        AsyncStorage.setItem(`@plant_live_active_device_${uid}`, nextActiveId).catch(() => { });
      } else {
        AsyncStorage.removeItem(`@plant_live_active_device_${uid}`).catch(() => { });
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

export const TELEMETRY_MAX_AGE_MS = 3 * 60 * 1000;

export const hasFreshSoilTelemetry = (telemetry?: DeviceTelemetry | null, now = Date.now()): boolean =>
  !!telemetry &&
  Number.isFinite(telemetry.ts) &&
  telemetry.ts > 0 &&
  now - telemetry.ts < TELEMETRY_MAX_AGE_MS &&
  Number.isFinite(telemetry.soilMoisture) &&
  telemetry.soilMoisture >= 0 &&
  telemetry.soilMoisture <= 100;

export const computePlantHealthState = (device?: DeviceRecord): PlantHealthState => {
  if (!device || !device.status.online || !device.telemetry || !hasFreshSoilTelemetry(device.telemetry)) return 'unknown';
  const { soilMoisture } = device.telemetry;
  const { moistureMin, moistureMax } = device.config.thresholds;

  if (soilMoisture < moistureMin) return 'thirsty';
  if (soilMoisture > moistureMax) return 'overwatered';
  return 'healthy';
};
