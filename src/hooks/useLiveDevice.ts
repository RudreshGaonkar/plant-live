import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/services/firebase';
import { useSession } from '@/store/useSession';
import {
  useLiveDevice as useLiveDeviceStore,
  LiveDeviceStore,
  DeviceConfig,
  DeviceTelemetry,
  DeviceStatus,
  createDefaultDeviceRecord,
} from '@/store/useLiveDevice';

export type {
  PlantLocation,
  DeviceMode,
  LightMode,
  PlantHealthState,
  DeviceConfig,
  DeviceTelemetry,
  DeviceStatus,
  DeviceCommandAckStatus,
  DeviceCommand,
  WaterLog,
  DeviceRecord,
  LiveDeviceStore,
} from '@/store/useLiveDevice';
export { computePlantHealthState, mockDevice, createDefaultDeviceRecord } from '@/store/useLiveDevice';

export const useLiveDevice: typeof useLiveDeviceStore = Object.assign(
  function useLiveDeviceHook<U = LiveDeviceStore>(
    selector?: (state: LiveDeviceStore) => U
  ): U {
    const user = useSession((s) => s.user);
    const activeDeviceId = useLiveDeviceStore((s) => s.activeDeviceId);
    const setActiveDeviceId = useLiveDeviceStore((s) => s.setActiveDeviceId);
    const [pairedDeviceIds, setPairedDeviceIds] = useState<string[]>([]);

    // 1. Sync User Device List & Hydrate paired devices into store
    useEffect(() => {
      if (!user?.uid) {
        setPairedDeviceIds([]);
        return;
      }

      const userDevicesRef = ref(db, `users/${user.uid}/devices`);
      const unsubUserDevices = onValue(userDevicesRef, async (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          const deviceIds =
            typeof val === 'object' && val !== null
              ? Object.keys(val).filter((k) => Boolean(val[k]))
              : [];

          setPairedDeviceIds(deviceIds);

          if (deviceIds.length > 0) {
            // Seed any uninitialized paired devices into store
            useLiveDeviceStore.setState((prev) => {
              const nextDevices = { ...prev.devices };
              for (const existingId of Object.keys(nextDevices)) {
                if (!deviceIds.includes(existingId)) {
                  delete nextDevices[existingId];
                }
              }
              for (const devId of deviceIds) {
                if (!nextDevices[devId]) {
                  nextDevices[devId] = createDefaultDeviceRecord(devId);
                }
              }
              return { devices: nextDevices };
            });

            // Hydrate active device from AsyncStorage if valid
            let savedId: string | null = null;
            try {
              savedId = await AsyncStorage.getItem(`@plant_live_active_device_${user.uid}`);
            } catch (err) {
              console.warn('[useLiveDevice] Failed to read stored active device:', err);
            }

            const current = useLiveDeviceStore.getState().activeDeviceId;
            if (!current || !deviceIds.includes(current)) {
              const target = (savedId && deviceIds.includes(savedId)) ? savedId : deviceIds[0];
              setActiveDeviceId(target);
            }
          } else {
            useLiveDeviceStore.getState().clearDeviceState();
          }
        } else {
          setPairedDeviceIds([]);
          useLiveDeviceStore.getState().clearDeviceState();
        }
      });

      return () => {
        unsubUserDevices();
      };
    }, [user?.uid, setActiveDeviceId]);

    // 2. Realtime Sync for ALL Paired Devices (config, status, telemetry) so switcher dropdown has live data
    useEffect(() => {
      if (pairedDeviceIds.length === 0) return;

      const unsubs: (() => void)[] = [];

      pairedDeviceIds.forEach((devId) => {
        // Config listener
        const configRef = ref(db, `devices/${devId}/config`);
        unsubs.push(
          onValue(configRef, (snapshot) => {
            if (snapshot.exists()) {
              const config = snapshot.val() as DeviceConfig;
              useLiveDeviceStore.getState().updateConfig(config, devId);
            }
          })
        );

        // Status listener
        const statusRef = ref(db, `devices/${devId}/status`);
        unsubs.push(
          onValue(statusRef, (snapshot) => {
            if (snapshot.exists()) {
              const status = snapshot.val() as DeviceStatus;
              useLiveDeviceStore.setState((prev) => {
                const cur = prev.devices[devId] || createDefaultDeviceRecord(devId);
                return {
                  devices: {
                    ...prev.devices,
                    [devId]: { ...cur, status: { ...cur.status, ...status } },
                  },
                };
              });
            }
          })
        );

        // Telemetry listener
        const telemetryRef = ref(db, `devices/${devId}/telemetry`);
        unsubs.push(
          onValue(telemetryRef, (snapshot) => {
            if (snapshot.exists()) {
              const telemetry = snapshot.val() as DeviceTelemetry;
              useLiveDeviceStore.getState().updateTelemetry(telemetry, devId);
            }
          })
        );
      });

      return () => {
        unsubs.forEach((unsub) => unsub());
      };
    }, [pairedDeviceIds]);

    // 3. Realtime Sync for Active Device Control State
    useEffect(() => {
      if (!activeDeviceId) return;

      const controlRef = ref(db, `devices/${activeDeviceId}/control`);
      const unsubControl = onValue(controlRef, (snapshot) => {
        if (snapshot.exists()) {
          const control = snapshot.val();
          useLiveDeviceStore.setState((prev) => {
            const cur = prev.devices[activeDeviceId] || createDefaultDeviceRecord(activeDeviceId);
            return {
              devices: {
                ...prev.devices,
                [activeDeviceId]: {
                  ...cur,
                  control: { ...cur.control, ...control },
                },
              },
            };
          });
        }
      });

      return () => {
        unsubControl();
      };
    }, [activeDeviceId]);

    return useLiveDeviceStore(
      selector ?? ((s: LiveDeviceStore) => s as unknown as U)
    );
  },
  useLiveDeviceStore
) as unknown as typeof useLiveDeviceStore;
