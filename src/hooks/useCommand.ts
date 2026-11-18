/**
 * useCommand
 * Hook for managing hardware command lifecycle, safety checks, and telemetry logging:
 * - Max 15s pump runtime cap per command
 * - 60s cooldown enforcement between manual waterings
 * - Empty reservoir guard (checks bottle remainingMl)
 * - Real-time command/ack tracking: idle -> sent -> received -> running -> done / timeout
 * - Haptic feedback on pump activation and completion
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLiveDevice, hasFreshSoilTelemetry } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import {
  sendDeviceCommand,
  listenToDeviceCommand,
} from '@/services/devices';

export type CommandLifecycleStage =
  | 'idle'
  | 'sent'
  | 'received'
  | 'running'
  | 'done'
  | 'timeout'
  | 'rejected';

export interface UseCommandReturn {
  stage: CommandLifecycleStage;
  activeDuration: number;
  secondsRemaining: number;
  cooldownSecondsLeft: number;
  errorMessage: string | null;
  canWater: boolean;
  isCommandPending: boolean;
  isWatering: boolean;
  executeWaterNow: (durationSec?: number, forceIfWet?: boolean) => Promise<boolean>;
  triggerWaterNow: (durationSec?: number, forceIfWet?: boolean) => Promise<boolean>;
  resetCommandState: () => void;
  refillBottle: () => void;
}

const pendingByDevice = new Map<string, string>();
// Maximum safe runtime constant
const MAX_PUMP_RUNTIME_SEC = 15;

export function useCommand(): UseCommandReturn {
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const isWateringActive = useLiveDevice((s) => s.isWateringActive);
  const wateringSecondsLeft = useLiveDevice((s) => s.wateringSecondsLeft);
  const storeRefillBottle = useLiveDevice((s) => s.refillBottle);

  const [commandDeviceId, setCommandDeviceId] = useState<string | null>(null);
  const [stage, setStage] = useState<CommandLifecycleStage>('idle');
  const [activeDuration, setActiveDuration] = useState<number>(5);
  const [now, setNow] = useState(Date.now);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeCmdIdRef = useRef<string | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKey = useRef<string | null>(null);
  const pumpObservedActiveRef = useRef<boolean>(false);

  const deviceId = device?.id ?? '';
  const uid = useSession((s) => s.user?.uid);
  const pairingStatus = useSession((s) => s.pairingStatus);

  const cooldownUntil = useLiveDevice((state) => state.manualCooldownUntilByDevice[deviceId] ?? 0);
  const cooldownSecondsLeft = Math.max(0, Math.min(60, Math.ceil((cooldownUntil - now) / 1000)));
  useEffect(() => {
    const tickCooldown = () => setNow(Date.now());
    const initialTick = setTimeout(tickCooldown, 0);
    if (cooldownUntil <= Date.now()) return () => clearTimeout(initialTick);
    const tick = setInterval(tickCooldown, 1000);
    const end = setTimeout(() => {
      clearInterval(tick);
      tickCooldown();
    }, Math.max(0, cooldownUntil - Date.now()));
    return () => {
      clearTimeout(initialTick);
      clearInterval(tick);
      clearTimeout(end);
    };
  }, [cooldownUntil]);

  // Synchronize with store watering seconds
  const secondsRemaining = isWateringActive ? wateringSecondsLeft : 0;

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const clearPendingCommand = useCallback(() => {
    if (pendingKey.current && pendingByDevice.get(pendingKey.current) === activeCmdIdRef.current) {
      pendingByDevice.delete(pendingKey.current);
    }
    pendingKey.current = null;
    activeCmdIdRef.current = null;
    pumpObservedActiveRef.current = false;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    timeoutTimerRef.current = null;
  }, []);

  useEffect(() => clearPendingCommand, [uid, clearPendingCommand]);

  const resetCommandState = useCallback(() => {
    if (activeCmdIdRef.current) return;
    setStage('idle');
    setErrorMessage(null);
    if (deviceId) {
      useLiveDevice.getState().resetWateringState(deviceId);
    }
  }, [deviceId]);

  const isPumpActiveTelemetry = Boolean(device?.telemetry?.pumpOn || device?.telemetry?.isPumpActive);
  const isOnline = Boolean(device?.status?.online);
  const hasFreshTelemetry = hasFreshSoilTelemetry(device?.telemetry);
  const isReserveKnown = Boolean(
    device &&
    device.config?.bottle?.capacityMl > 0 &&
    typeof device.config?.bottle?.remainingMl === 'number'
  );
  const hasSufficientReserve = isReserveKnown && (device?.config?.bottle?.remainingMl ?? 0) > 20;

  // Block watering commands until target, connection, fresh soil reading, and reserve are known
  const canWater =
    Boolean(deviceId) &&
    isOnline &&
    pairingStatus !== 'cached' &&
    hasFreshTelemetry &&
    hasSufficientReserve &&
    !isWateringActive &&
    cooldownSecondsLeft === 0;

  // Core command dispatcher with Optimistic UI feedback
  const dispatchWaterCommand = useCallback(
    async (clampedDuration: number): Promise<boolean> => {
      const key = JSON.stringify([uid, deviceId]);
      const state = useLiveDevice.getState();
      if (!uid || useSession.getState().user?.uid !== uid || state.activeDeviceId !== deviceId ||
          state.isWateringActive || activeCmdIdRef.current || pendingByDevice.has(key)) return false;
      console.log('[LeafLink] Active Device ID:', deviceId);
      const cmdId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      pendingKey.current = key;
      pendingByDevice.set(key, cmdId);
      activeCmdIdRef.current = cmdId;
      const stillCurrent = () => activeCmdIdRef.current === cmdId && useSession.getState().user?.uid === uid;
      setCommandDeviceId(deviceId);
      pumpObservedActiveRef.current = false;

      // Extended timeout: covers full watering duration + 20s network buffer for controller ack flush
      timeoutTimerRef.current = setTimeout(() => {
        if (!stillCurrent()) return;
        clearPendingCommand();
        setStage('timeout');
        setErrorMessage("Device didn't respond. Check Wi-Fi connection.");
        useLiveDevice.getState().resetWateringState(deviceId);
      }, clampedDuration * 1000 + 20000);

      const unsubCommand = listenToDeviceCommand(deviceId, (command) => {
        const ack = command?.ack;
        if (!stillCurrent() || ack?.id !== cmdId) return;

        if (ack.status === 'done') {
          clearPendingCommand();
          setStage('done');
          useLiveDevice.getState().startManualCooldown(deviceId);
          useLiveDevice.getState().resetWateringState(deviceId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
        } else if (ack.status === 'rejected' || ack.status === 'failed') {
          clearPendingCommand();
          setStage('rejected');
          setErrorMessage(ack.reason || 'Controller could not complete the watering command.');
          useLiveDevice.getState().resetWateringState(deviceId);
        } else if (ack.status === 'running') {
          setStage('running');
        }
      });

      const unsubStore = useLiveDevice.subscribe((state) => {
        if (!stillCurrent()) return;
        const targetDev = state.devices[deviceId];
        if (!targetDev) return;

        const ack = targetDev.command?.ack;
        if (ack && ack.id === cmdId) {
          if (ack.status === 'done') {
            clearPendingCommand();
            setStage('done');
            useLiveDevice.getState().startManualCooldown(deviceId);
            useLiveDevice.getState().resetWateringState(deviceId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
            return;
          } else if (ack.status === 'rejected' || ack.status === 'failed') {
            clearPendingCommand();
            setStage('rejected');
            setErrorMessage(ack.reason || 'Controller could not complete the watering command.');
            useLiveDevice.getState().resetWateringState(deviceId);
            return;
          } else if (ack.status === 'running') {
            setStage('running');
          }
        }

        const telemPump = Boolean(targetDev.telemetry?.pumpOn || targetDev.telemetry?.isPumpActive);
        if (telemPump) {
          pumpObservedActiveRef.current = true;
          setStage((prev) => (prev === 'sent' ? 'running' : prev));
        } else if (pumpObservedActiveRef.current) {
          console.log('[useCommand] Pump completed run observed via telemetry cutoff.');
          pumpObservedActiveRef.current = false;
          clearPendingCommand();
          setStage('done');
          useLiveDevice.getState().startManualCooldown(deviceId);
          useLiveDevice.getState().resetWateringState(deviceId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
        }
      });

      unsubscribeRef.current = () => {
        unsubCommand?.();
        unsubStore?.();
      };

      // 1. Initial State: "Sending request" awaiting controller acknowledgement
      setErrorMessage(null);
      setStage('sent');
      useLiveDevice.getState().triggerWaterNow(clampedDuration, deviceId);

      // Haptic pulse on command initiation
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);

      try {
        // Dispatch ONLY ONE command write with unique command.id to /devices/{deviceId}/command
        void sendDeviceCommand(deviceId, {
          type: 'waterNow',
          durationSec: clampedDuration,
        }, cmdId).catch((err: unknown) => {
          if (!stillCurrent()) return;
          clearPendingCommand();
          setStage('timeout');
          setErrorMessage(err instanceof Error ? err.message : 'Failed to dispatch command.');
          useLiveDevice.getState().resetWateringState(deviceId);
        });

        return true;
      } catch (err) {
        if (!stillCurrent()) return false;
        clearPendingCommand();
        setStage('timeout');
        setErrorMessage(err instanceof Error ? err.message : 'Failed to dispatch command.');
        useLiveDevice.getState().resetWateringState(deviceId);
        return false;
      }
    },
    [uid, deviceId, clearPendingCommand]
  );

  // Execute Water Now with safety checks (manual watering explicitly bypasses soil moisture checks)
  const executeWaterNow = useCallback(
    async (requestedDuration: number = 5): Promise<boolean> => {
      if (!Number.isFinite(requestedDuration)) {
        Alert.alert('Invalid Duration', 'Enter a watering duration from 1 to 15 seconds.');
        return false;
      }
      if (!device || !deviceId) {
        Alert.alert('No Device Connected', 'Please pair or select a plant device first.');
        return false;
      }

      if (pairingStatus === 'cached') {
        Alert.alert('Connection Unconfirmed', 'Commands are disabled until controller ownership is reconfirmed.');
        return false;
      }

      if (!device.status.online) {
        Alert.alert('Device Offline', 'Cannot water while the controller is offline.');
        return false;
      }

      if (!hasFreshSoilTelemetry(device.telemetry)) {
        Alert.alert('No Telemetry', 'Waiting for fresh soil telemetry from controller before watering.');
        return false;
      }

      if (!isReserveKnown || !hasSufficientReserve) {
        Alert.alert(
          'Water Reservoir Empty',
          'Estimated bottle level is below minimum reserve. Refill the bottle to enable pump.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'I Refilled', onPress: () => storeRefillBottle(deviceId) },
          ]
        );
        return false;
      }

      // Safety Guard 1: Enforce strict 1-15s bounds
      const clampedDuration = Math.max(1, Math.min(MAX_PUMP_RUNTIME_SEC, Math.round(requestedDuration)));
      setActiveDuration(clampedDuration);

      const deadline = useLiveDevice.getState().manualCooldownUntilByDevice[deviceId] ?? 0;
      const cooldownLeft = Math.ceil((deadline - Date.now()) / 1000);
      if (cooldownLeft > 0) {
        Alert.alert(
          'Pump Cooldown Active',
          `Please wait ${cooldownLeft} seconds before triggering another manual cycle.`
        );
        return false;
      }

      return dispatchWaterCommand(clampedDuration);
    },
    [
      device,
      deviceId,
      pairingStatus,
      isReserveKnown,
      hasSufficientReserve,
      storeRefillBottle,
      dispatchWaterCommand,
    ]
  );

  const isCommandPending = Boolean(deviceId && commandDeviceId === deviceId && (stage === 'sent' || stage === 'running'));
  const isWatering = Boolean(isPumpActiveTelemetry || (Boolean(deviceId) && commandDeviceId === deviceId && (isWateringActive || stage === 'running')));

  return {
    stage: commandDeviceId === deviceId ? stage : (isPumpActiveTelemetry ? 'running' : 'idle'),
    activeDuration,
    secondsRemaining: commandDeviceId === deviceId ? secondsRemaining : 0,
    cooldownSecondsLeft,
    errorMessage: commandDeviceId === deviceId ? errorMessage : null,
    canWater,
    isCommandPending,
    isWatering,
    executeWaterNow,
    triggerWaterNow: executeWaterNow,
    resetCommandState,
    refillBottle: () => {
      if (deviceId) {
        console.log('[LeafLink] Active Device ID:', deviceId);
        storeRefillBottle(deviceId);
      }
    },
  };
}
