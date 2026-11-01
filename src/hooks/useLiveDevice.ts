import { useEffect } from 'react';
import { ref, onValue, off } from 'firebase/database';
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

    // 1. Sync User Device List
    useEffect(() => {
      if (!user?.uid) return;

      const userDevicesRef = ref(db, `users/${user.uid}/devices`);
      const unsubUserDevices = onValue(userDevicesRef, (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          const deviceIds =
            typeof val === 'object' && val !== null
              ? Object.keys(val).filter((k) => Boolean(val[k]))
              : [];

          if (deviceIds.length > 0) {
            const current = useLiveDeviceStore.getState().activeDeviceId;
            if (!current || !deviceIds.includes(current)) {
              setActiveDeviceId(deviceIds[0]);
            }
          }
        }
      });

      return () => {
        off(userDevicesRef, 'value', unsubUserDevices);
      };
    }, [user?.uid, setActiveDeviceId]);

    // 2. Persistent Realtime Sync for Active Device (telemetry, status, config, control)
    useEffect(() => {
      const targetId = activeDeviceId || 'leaf-node-01';

      // Telemetry listener
      const telemetryRef = ref(db, `devices/${targetId}/telemetry`);
      const unsubTelemetry = onValue(telemetryRef, (snapshot) => {
        if (snapshot.exists()) {
          const telemetry = snapshot.val() as DeviceTelemetry;
          useLiveDeviceStore.getState().updateTelemetry(telemetry);
        }
      });

      // Status listener
      const statusRef = ref(db, `devices/${targetId}/status`);
      const unsubStatus = onValue(statusRef, (snapshot) => {
        if (snapshot.exists()) {
          const status = snapshot.val() as DeviceStatus;
          useLiveDeviceStore.setState((prev) => {
            const cur = prev.devices[targetId] || createDefaultDeviceRecord(targetId);
            return {
              devices: {
                ...prev.devices,
                [targetId]: { ...cur, status: { ...cur.status, ...status } },
              },
            };
          });
        }
      });

      // Config listener
      const configRef = ref(db, `devices/${targetId}/config`);
      const unsubConfig = onValue(configRef, (snapshot) => {
        if (snapshot.exists()) {
          const config = snapshot.val() as DeviceConfig;
          useLiveDeviceStore.setState((prev) => {
            const cur = prev.devices[targetId] || createDefaultDeviceRecord(targetId);
            return {
              devices: {
                ...prev.devices,
                [targetId]: { ...cur, config: { ...cur.config, ...config } },
              },
            };
          });
        }
      });

      // Control listener (for real-time pump status & optimistic override sync)
      const controlRef = ref(db, `devices/${targetId}/control`);
      const unsubControl = onValue(controlRef, (snapshot) => {
        if (snapshot.exists()) {
          const control = snapshot.val();
          useLiveDeviceStore.setState((prev) => {
            const cur = prev.devices[targetId] || createDefaultDeviceRecord(targetId);
            const isPump = Boolean(control?.pumpState || cur.telemetry.isPumpActive || cur.telemetry.pumpOn);
            return {
              devices: {
                ...prev.devices,
                [targetId]: {
                  ...cur,
                  control: { ...cur.control, ...control },
                  telemetry: {
                    ...cur.telemetry,
                    isPumpActive: isPump,
                    pumpOn: isPump,
                  },
                },
              },
            };
          });
        }
      });

      return () => {
        off(telemetryRef, 'value', unsubTelemetry);
        off(statusRef, 'value', unsubStatus);
        off(configRef, 'value', unsubConfig);
        off(controlRef, 'value', unsubControl);
      };
    }, [activeDeviceId]);

    return useLiveDeviceStore(
      selector ?? ((s: LiveDeviceStore) => s as unknown as U)
    );
  },
  useLiveDeviceStore
) as unknown as typeof useLiveDeviceStore;
