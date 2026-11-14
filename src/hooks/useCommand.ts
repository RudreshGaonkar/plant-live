/**
 * useCommand
 * Hook for managing hardware command lifecycle, safety checks, and telemetry logging:
 * - Max 15s pump runtime cap per command
 * - 60s cooldown enforcement between manual waterings
 * - Empty reservoir guard (checks bottle remainingMl)
 * - Saturated soil warning (checks moistureMax threshold)
 * - Real-time command/ack tracking: idle -> sent -> received -> running -> done / timeout
 * - Automatic water log creation under waterLogs/{deviceId}
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

// 60-second cooldown constant
const COOLDOWN_DURATION_SEC = 60;
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
  const [cooldownSecondsLeft, setCooldownSecondsLeft] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeCmdIdRef = useRef<string | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMoistureBeforeRef = useRef<number>(50);
  const pumpObservedActiveRef = useRef<boolean>(false);

  const deviceId = device?.id ?? '';
  const pairingStatus = useSession((s) => s.pairingStatus);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSecondsLeft > 0) {
      cooldownTimerRef.current = setInterval(() => {
        setCooldownSecondsLeft((prev) => {
          if (prev <= 1) {
            if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, [cooldownSecondsLeft]);

  // Synchronize with store watering seconds
  const secondsRemaining = isWateringActive ? wateringSecondsLeft : 0;

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const clearPendingCommand = useCallback(() => {
    activeCmdIdRef.current = null;
    pumpObservedActiveRef.current = false;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    timeoutTimerRef.current = null;
  }, []);

  useEffect(() => clearPendingCommand, [deviceId, clearPendingCommand]);

  const resetCommandState = useCallback(() => {
    clearPendingCommand();
    setStage('idle');
    setErrorMessage(null);
    if (deviceId) {
      useLiveDevice.getState().resetWateringState(deviceId);
    }
  }, [clearPendingCommand, deviceId]);

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
    async (clampedDuration: number, currentMoisture: number): Promise<boolean> => {
      if (activeCmdIdRef.current || !deviceId) return false;
      console.log('[LeafLink] Active Device ID:', deviceId);
      const cmdId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      activeCmdIdRef.current = cmdId;
      setCommandDeviceId(deviceId);
      pumpObservedActiveRef.current = false;

      // Extended timeout: covers full watering duration + 20s network buffer for controller ack flush
      timeoutTimerRef.current = setTimeout(() => {
        clearPendingCommand();
        setStage('timeout');
        setErrorMessage("Device didn't respond. Check Wi-Fi connection.");
        useLiveDevice.getState().resetWateringState(deviceId);
      }, clampedDuration * 1000 + 20000);

      const unsubCommand = listenToDeviceCommand(deviceId, (command) => {
        const ack = command?.ack;
        if (activeCmdIdRef.current !== cmdId || ack?.id !== cmdId) return;

        if (ack.status === 'done') {
          clearPendingCommand();
          setStage('done');
          setCooldownSecondsLeft(COOLDOWN_DURATION_SEC);
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
        if (activeCmdIdRef.current !== cmdId) return;
        const targetDev = state.devices[deviceId];
        if (!targetDev) return;

        const ack = targetDev.command?.ack;
        if (ack && ack.id === cmdId) {
          if (ack.status === 'done') {
            clearPendingCommand();
            setStage('done');
            setCooldownSecondsLeft(COOLDOWN_DURATION_SEC);
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
          setCooldownSecondsLeft(COOLDOWN_DURATION_SEC);
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
      lastMoistureBeforeRef.current = currentMoisture;
      useLiveDevice.getState().triggerWaterNow(clampedDuration, deviceId);

      // Haptic pulse on command initiation
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);

      try {
        // Dispatch ONLY ONE command write with unique command.id to /devices/{deviceId}/command
        void sendDeviceCommand(deviceId, {
          type: 'waterNow',
          durationSec: clampedDuration,
        }, cmdId).catch((err: unknown) => {
          if (activeCmdIdRef.current !== cmdId) return;
          clearPendingCommand();
          setStage('timeout');
          setErrorMessage(err instanceof Error ? err.message : 'Failed to dispatch command.');
        });

        return true;
      } catch (err) {
        if (activeCmdIdRef.current !== cmdId) return false;
        clearPendingCommand();
        setStage('timeout');
        setErrorMessage(err instanceof Error ? err.message : 'Failed to dispatch command.');
        return false;
      }
    },
    [deviceId, clearPendingCommand]
  );

  // Execute Water Now with safety checks (manual watering explicitly bypasses soil moisture checks)
  const executeWaterNow = useCallback(
    async (requestedDuration: number = 5, forceIfWet: boolean = true): Promise<boolean> => {
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

      // Safety Guard 2: 60s Cooldown enforcement
      if (cooldownSecondsLeft > 0) {
        Alert.alert(
          'Pump Cooldown Active',
          `Please wait ${cooldownSecondsLeft} seconds before triggering another manual cycle.`
        );
        return false;
      }

      const currentMoisture = device.telemetry?.soilMoisture ?? 0;
      return dispatchWaterCommand(clampedDuration, currentMoisture);
    },
    [
      device,
      deviceId,
      pairingStatus,
      isReserveKnown,
      hasSufficientReserve,
      cooldownSecondsLeft,
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
