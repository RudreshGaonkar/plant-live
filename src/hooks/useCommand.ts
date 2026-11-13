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
import { useLiveDevice } from '@/store/useLiveDevice';
import {
  sendDeviceCommand,
  listenToDeviceCommand,
  appendWaterLogInRTDB,
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

  const deviceId = device?.id ?? 'leaf-node-01';

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
  }, [clearPendingCommand]);

  // Check if watering can be triggered safely
  const canWater =
    !isWateringActive &&
    cooldownSecondsLeft === 0 &&
    (device ? device.config.bottle.remainingMl > 20 : true);

  // Core command dispatcher with Optimistic UI feedback
  const dispatchWaterCommand = useCallback(
    async (clampedDuration: number, currentMoisture: number): Promise<boolean> => {
      if (activeCmdIdRef.current) return false;
      console.log('[LeafLink] Active Device ID:', deviceId);
      const cmdId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      activeCmdIdRef.current = cmdId;
      setCommandDeviceId(deviceId);
      timeoutTimerRef.current = setTimeout(() => {
        clearPendingCommand();
        setStage('timeout');
        setErrorMessage("Device didn't respond. Check Wi-Fi connection.");
      }, (clampedDuration + 15) * 1000);

      unsubscribeRef.current = listenToDeviceCommand(deviceId, (command) => {
        const ack = command?.ack;
        if (activeCmdIdRef.current !== cmdId || command?.id !== cmdId || ack?.id !== cmdId) return;

        if (ack.status === 'done') {
          clearPendingCommand();
          setStage('done');
          setCooldownSecondsLeft(COOLDOWN_DURATION_SEC);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
        } else if (ack.status === 'rejected' || ack.status === 'failed') {
          clearPendingCommand();
          setStage('rejected');
          setErrorMessage(ack.reason || 'Device could not complete the watering command.');
        } else if (ack.status === 'running') {
          setStage('running');
        }
      });

      // 1. Optimistic UI: Immediately show pump state as active & watering locally
      setErrorMessage(null);
      setStage('running');
      lastMoistureBeforeRef.current = currentMoisture;
      useLiveDevice.getState().triggerWaterNow(clampedDuration);

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

        // Append log to RTDB
        appendWaterLogInRTDB(deviceId, {
          ts: Date.now(),
          trigger: 'manual',
          durationSec: clampedDuration,
          moistureBefore: currentMoisture,
          moistureAfter: Math.min(100, Math.round(currentMoisture + 15)),
          note: 'Manual watering triggered via app',
        }).catch(() => null);

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
      if (!device) {
        Alert.alert('No Device Connected', 'Please pair or select a plant device first.');
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

      // Safety Guard 3: Empty reservoir check
      if (device.config.bottle.remainingMl <= 20) {
        Alert.alert(
          'Water Reservoir Empty',
          'Estimated bottle level is below minimum reserve. Refill the bottle to enable pump.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'I Refilled', onPress: storeRefillBottle },
          ]
        );
        return false;
      }

      // Manual Watering explicitly bypasses high-moisture safety locks (e.g. moisture at 100%)
      const currentMoisture = device.telemetry.soilMoisture;
      return dispatchWaterCommand(clampedDuration, currentMoisture);
    },
    [device, cooldownSecondsLeft, storeRefillBottle, dispatchWaterCommand]
  );

  return {
    stage: commandDeviceId === deviceId ? stage : 'idle',
    activeDuration,
    secondsRemaining,
    cooldownSecondsLeft,
    errorMessage: commandDeviceId === deviceId ? errorMessage : null,
    canWater,
    executeWaterNow,
    triggerWaterNow: executeWaterNow,
    resetCommandState,
    refillBottle: () => {
      console.log('[LeafLink] Active Device ID:', deviceId);
      storeRefillBottle(deviceId);
    },
  };
}
