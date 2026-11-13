import { useEffect, useState } from 'react';
import { ref, onValue, runTransaction } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/services/firebase';
import { useSession } from '@/store/useSession';
import {
  useLiveDevice as useLiveDeviceStore,
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

export const useLiveDevice = useLiveDeviceStore;

export function useLiveDeviceSync() {
  const user = useSession((s) => s.user);
  const activeDeviceId = useLiveDeviceStore((s) => s.activeDeviceId);
  const setActiveDeviceId = useLiveDeviceStore((s) => s.setActiveDeviceId);
  const [pairings, setPairings] = useState<{ uid: string; ids: string[] }>();

  // 1. Sync User Device List & Hydrate paired devices into store
  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    let active = true;
    let revision = 0;
    const userDevicesRef = ref(db, `users/${user.uid}/devices`);
    const unsubUserDevices = onValue(userDevicesRef, async (snapshot) => {
      const currentRevision = ++revision;
      if (snapshot.exists()) {
        const val = snapshot.val();
        const deviceIds =
          typeof val === 'object' && val !== null
            ? Object.keys(val).filter((k) => Boolean(val[k]))
            : [];

        setPairings({ uid, ids: deviceIds });

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

          if (!active || revision !== currentRevision) return;
          const current = useLiveDeviceStore.getState().activeDeviceId;
          if (!current || !deviceIds.includes(current)) {
            const target = (savedId && deviceIds.includes(savedId)) ? savedId : deviceIds[0];
            setActiveDeviceId(target);
          }
        } else {
          useLiveDeviceStore.getState().clearDeviceState();
        }
      } else {
        setPairings({ uid, ids: [] });
        useLiveDeviceStore.getState().clearDeviceState();
      }
    });

    return () => {
      active = false;
      unsubUserDevices();
    };
  }, [user?.uid, setActiveDeviceId]);

  // 2. Realtime Sync for ALL Paired Devices (config, status, telemetry) so switcher dropdown has live data
  useEffect(() => {
    if (!pairings || pairings.uid !== user?.uid) return;

    const unsubs: (() => void)[] = [];

    pairings.ids.forEach((devId) => {
      const ownerRef = ref(db, `devices/${devId}/meta/ownerUid`);
      void runTransaction(ownerRef, (owner) => owner === null ? pairings.uid : undefined, {
        applyLocally: false,
      }).catch((error) => {
        console.warn(`[LeafLink] Ownership backfill failed for ${devId}:`, error.message);
      });

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
          } else {
            useLiveDeviceStore.getState().clearTelemetry(devId);
          }
        }, (error) => {
          console.warn(`[LeafLink] Telemetry unavailable for ${devId}:`, error.message);
          useLiveDeviceStore.getState().clearTelemetry(devId);
        })
      );
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [pairings, user?.uid]);

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

}
