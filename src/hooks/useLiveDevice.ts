import { useEffect } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { db } from '@/services/firebase';
import { useSession } from '@/store/useSession';
import { simulatedDevice } from '@/services/simulator';
import {
  useLiveDevice as useLiveDeviceStore,
  LiveDeviceStore,
  DeviceConfig,
  DeviceTelemetry,
  DeviceStatus,
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
export { computePlantHealthState, mockDevice } from '@/store/useLiveDevice';

export const useLiveDevice: typeof useLiveDeviceStore = Object.assign(
  function useLiveDeviceHook<U = LiveDeviceStore>(
    selector?: (state: LiveDeviceStore) => U
  ): U {
    const isDemoMode = useSession((s) => s.isDemoMode);
    const user = useSession((s) => s.user);
    const activeDeviceId = useLiveDeviceStore((s) => s.activeDeviceId);
    const setActiveDeviceId = useLiveDeviceStore((s) => s.setActiveDeviceId);

    useEffect(() => {
      if (isDemoMode) return;

      simulatedDevice.stop();

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
          } else {
            setActiveDeviceId('');
            useLiveDeviceStore.setState({ devices: {} });
          }
        } else {
          setActiveDeviceId('');
          useLiveDeviceStore.setState({ devices: {} });
        }
      });

      return () => {
        off(userDevicesRef, 'value', unsubUserDevices);
      };
    }, [isDemoMode, user?.uid, setActiveDeviceId]);

    useEffect(() => {
      if (isDemoMode) return;

      simulatedDevice.stop();

      if (!activeDeviceId) return;

      const telemetryRef = ref(db, `devices/${activeDeviceId}/telemetry`);
      const unsubTelemetry = onValue(telemetryRef, (snapshot) => {
        if (snapshot.exists()) {
          const telemetry = snapshot.val() as DeviceTelemetry;
          useLiveDeviceStore.getState().updateTelemetry(telemetry);
        }
      });

      const statusRef = ref(db, `devices/${activeDeviceId}/status`);
      const unsubStatus = onValue(statusRef, (snapshot) => {
        if (snapshot.exists()) {
          const status = snapshot.val() as DeviceStatus;
          useLiveDeviceStore.setState((prev) => {
            const cur = prev.devices[activeDeviceId];
            if (!cur) return prev;
            return {
              devices: {
                ...prev.devices,
                [activeDeviceId]: { ...cur, status: { ...cur.status, ...status } },
              },
            };
          });
        }
      });

      const configRef = ref(db, `devices/${activeDeviceId}/config`);
      const unsubConfig = onValue(configRef, (snapshot) => {
        if (snapshot.exists()) {
          const config = snapshot.val() as DeviceConfig;
          useLiveDeviceStore.setState((prev) => {
            const cur = prev.devices[activeDeviceId];
            if (!cur) return prev;
            return {
              devices: {
                ...prev.devices,
                [activeDeviceId]: { ...cur, config: { ...cur.config, ...config } },
              },
            };
          });
        }
      });

      return () => {
        off(telemetryRef, 'value', unsubTelemetry);
        off(statusRef, 'value', unsubStatus);
        off(configRef, 'value', unsubConfig);
      };
    }, [isDemoMode, activeDeviceId]);

    return useLiveDeviceStore(
      selector ?? ((s: LiveDeviceStore) => s as unknown as U)
    );
  },
  useLiveDeviceStore
) as unknown as typeof useLiveDeviceStore;
