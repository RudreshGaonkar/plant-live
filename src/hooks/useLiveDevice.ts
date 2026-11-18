import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ref, onValue, runTransaction } from 'firebase/database';
import { db } from '@/services/firebase';
import { useSession } from '@/store/useSession';
import {
  useLiveDevice as useLiveDeviceStore,
  DeviceConfig,
  DeviceTelemetry,
  DeviceStatus,
  SnapshotStatus,
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
  RefillOutcome,
} from '@/store/useLiveDevice';
export { computePlantHealthState, createDefaultDeviceRecord } from '@/store/useLiveDevice';

export const useLiveDevice = useLiveDeviceStore;

export function useLiveDeviceSync() {
  const uid = useSession((state) => state.user?.uid);
  const paired = useSession((state) => state.pairingStatus === 'paired');
  const bootLoading = useSession((state) => state.isLoading);
  const activeDeviceId = useLiveDeviceStore((state) => state.activeDeviceId);
  const deviceIds = useLiveDeviceStore(useShallow((state) => Object.keys(state.devices)));

  useEffect(() => {
    if (!uid || bootLoading) return;
    let active = true;
    const unsubscribe = onValue(ref(db, `users/${uid}/devices`), (snapshot) => {
      if (!active || useSession.getState().user?.uid !== uid) return;
      const membership = snapshot.val();
      const ids = membership && typeof membership === 'object'
        ? Object.keys(membership).filter((id) => Boolean(membership[id]))
        : [];
      const activeId = useLiveDeviceStore.getState().seedDeviceRecords(ids);
      useSession.setState({
        activeDeviceId: activeId,
        pairingStatus: ids.length ? 'paired' : 'unpaired',
      });
    }, (error) => console.warn('[LeafLink] Device membership unavailable:', error.message));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, bootLoading]);

  useEffect(() => {
    if (!uid || bootLoading) return;
    let active = true;
    const unsubs = deviceIds.map((deviceId) => {
      const isCurrent = () => active && useSession.getState().user?.uid === uid &&
        Boolean(useLiveDeviceStore.getState().devices[deviceId]);
      const setStatus = (field: 'configStatus' | 'telemetryStatus', status: SnapshotStatus) => {
        if (!isCurrent()) return;
        useLiveDeviceStore.setState(({ devices }) => ({
          devices: { ...devices, [deviceId]: { ...devices[deviceId], [field]: status } },
        }));
      };
      const deviceRef = `devices/${deviceId}`;
      if (paired) {
        void runTransaction(ref(db, `${deviceRef}/meta/ownerUid`), (owner) => owner === null ? uid : undefined, {
          applyLocally: false,
        }).catch((error) => console.warn('[LeafLink] Ownership backfill failed:', error.message));
      }
      const timeout = setTimeout(() => {
        const record = useLiveDeviceStore.getState().devices[deviceId];
        if (record?.configStatus === 'loading') setStatus('configStatus', 'error');
        if (record?.telemetryStatus === 'loading') setStatus('telemetryStatus', 'error');
      }, 8000);

      const configUnsub = onValue(ref(db, `${deviceRef}/config`), (snapshot) => {
        if (!isCurrent()) return;
        if (snapshot.exists()) {
          useLiveDeviceStore.getState().updateConfig(snapshot.val() as DeviceConfig, deviceId);
        } else {
          setStatus('configStatus', 'empty');
        }
      }, () => setStatus('configStatus', 'error'));
      const telemetryUnsub = onValue(ref(db, `${deviceRef}/telemetry`), (snapshot) => {
        if (!isCurrent()) return;
        if (snapshot.exists()) {
          useLiveDeviceStore.getState().updateTelemetry(snapshot.val() as DeviceTelemetry, deviceId);
        } else {
          useLiveDeviceStore.getState().clearTelemetry(deviceId);
        }
      }, () => setStatus('telemetryStatus', 'error'));
      const statusUnsub = onValue(ref(db, `${deviceRef}/status`), (snapshot) => {
        if (!isCurrent() || !snapshot.exists()) return;
        const status = snapshot.val() as DeviceStatus;
        useLiveDeviceStore.setState(({ devices }) => ({
          devices: {
            ...devices,
            [deviceId]: { ...devices[deviceId], status: { ...devices[deviceId].status, ...status } },
          },
        }));
      }, (error) => console.warn('[LeafLink] Device status unavailable:', error.message));
      return () => {
        clearTimeout(timeout);
        configUnsub();
        telemetryUnsub();
        statusUnsub();
      };
    });

    return () => {
      active = false;
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [uid, bootLoading, deviceIds, paired]);

  useEffect(() => {
    if (!uid || !activeDeviceId) return;
    let active = true;
    const controlRef = ref(db, `devices/${activeDeviceId}/control`);
    const unsubscribe = onValue(controlRef, (snapshot) => {
      if (!active || useSession.getState().user?.uid !== uid || !snapshot.exists()) return;
      const { devices } = useLiveDeviceStore.getState();
      const device = devices[activeDeviceId];
      if (device) {
        useLiveDeviceStore.setState({
          devices: {
            ...devices,
            [activeDeviceId]: { ...device, control: { ...device.control, ...snapshot.val() } },
          },
        });
      }
    }, (error) => console.warn('[LeafLink] Controller state unavailable:', error.message));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, activeDeviceId]);
}
