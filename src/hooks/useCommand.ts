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
import { useLiveDevice, DeviceCommandAckStatus } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import {
  sendDeviceCommand,
  listenToDeviceCommand,
  appendWaterLogInRTDB,
  updateDeviceConfigInRTDB,
} from '@/services/devices';
import { simulatedDevice } from '@/services/simulator';

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
  const isDemoMode = useSession((s) => s.isDemoMode);

  const [stage, setStage] = useState<CommandLifecycleStage>('idle');
  const [activeDuration, setActiveDuration] = useState<number>(5);
  const [cooldownSecondsLeft, setCooldownSecondsLeft] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeCmdIdRef = useRef<string | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMoistureBeforeRef = useRef<number>(50);

  const deviceId = device?.id ?? 'demo-leaf-01';

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

  // Listen to remote RTDB command ack if online device
  useEffect(() => {
    if (isDemoMode || !device) return;

    const unsubscribe = listenToDeviceCommand(deviceId, (cmd) => {
      if (!cmd || !activeCmdIdRef.current || cmd.id !== activeCmdIdRef.current) {
        return;
      }

      const ackStatus: DeviceCommandAckStatus | undefined = cmd.ack?.status;

      if (ackStatus === 'received') {
        setStage('received');
      } else if (ackStatus === 'running') {
        setStage('running');
        // Clear 15s timeout once hardware acknowledges running
        if (timeoutTimerRef.current) {
          clearTimeout(timeoutTimerRef.current);
          timeoutTimerRef.current = null;
        }
      } else if (ackStatus === 'done') {
        setStage('done');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);

        // Start 60s cooldown
        setCooldownSecondsLeft(COOLDOWN_DURATION_SEC);
        activeCmdIdRef.current = null;
      } else if (ackStatus === 'rejected') {
        setStage('rejected');
        setErrorMessage('Device rejected watering command (coastal guard or safe lock).');
        activeCmdIdRef.current = null;
      }
    });

    return () => {
      unsubscribe();
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    };
  }, [deviceId, isDemoMode, device]);

  // Reset command lifecycle state
  const resetCommandState = useCallback(() => {
    setStage('idle');
    setErrorMessage(null);
    activeCmdIdRef.current = null;
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
  }, []);

  // Check if watering can be triggered safely
  const canWater =
    !isWateringActive &&
    cooldownSecondsLeft === 0 &&
    (device ? device.config.bottle.remainingMl > 20 : true);

  // Core command dispatcher
  const dispatchWaterCommand = useCallback(
    async (clampedDuration: number, currentMoisture: number): Promise<boolean> => {
      if (!device) return false;

      // Start lifecycle
      setErrorMessage(null);
      setStage('sent');
      lastMoistureBeforeRef.current = currentMoisture;

      // Haptic pulse on command initiation
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);

      // Mode A: Demo Simulator execution
      if (isDemoMode) {
        const cmdId = `cmd-sim-${Date.now()}`;
        activeCmdIdRef.current = cmdId;

        // Transition: sent -> received -> running
        setTimeout(() => setStage('received'), 300);
        setTimeout(() => {
          setStage('running');
          simulatedDevice.runWaterCycle('manual', clampedDuration);
        }, 800);

        // Completion transition
        setTimeout(() => {
          setStage('done');
          setCooldownSecondsLeft(COOLDOWN_DURATION_SEC);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
        }, clampedDuration * 1000 + 1000);

        return true;
      }

      // Mode B: Hardware RTDB dispatch
      try {
        const cmdId = await sendDeviceCommand(deviceId, {
          type: 'waterNow',
          durationSec: clampedDuration,
        });
        activeCmdIdRef.current = cmdId;

        // Set 15s timeout for hardware response
        timeoutTimerRef.current = setTimeout(() => {
          if (stage !== 'running' && stage !== 'done') {
            setStage('timeout');
            setErrorMessage("Device didn't respond within 15 seconds. Check Wi-Fi connection.");
          }
        }, 15000);

        // Deduct water volume and record log
        const flowRate = device.config.bottle.flowMlPerSec || 15;
        const deducted = flowRate * clampedDuration;
        const newRemaining = Math.max(0, device.config.bottle.remainingMl - deducted);

        updateDeviceConfigInRTDB(deviceId, {
          bottle: {
            ...device.config.bottle,
            remainingMl: newRemaining,
          },
        }).catch(() => null);

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
        setStage('timeout');
        setErrorMessage(err instanceof Error ? err.message : 'Failed to dispatch command.');
        return false;
      }
    },
    [device, isDemoMode, deviceId, stage]
  );

  // Execute Water Now with safety checks
  const executeWaterNow = useCallback(
    async (requestedDuration: number = 5, forceIfWet: boolean = false): Promise<boolean> => {
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

      // Safety Guard 4: Saturated soil warning
      const currentMoisture = device.telemetry.soilMoisture;
      if (!forceIfWet && currentMoisture > device.config.thresholds.moistureMax) {
        Alert.alert(
          'Soil Already Wet',
          `Soil moisture is currently ${currentMoisture}% (above recommended ${device.config.thresholds.moistureMax}%). Water anyway?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Water Anyway',
              onPress: () => {
                dispatchWaterCommand(clampedDuration, currentMoisture);
              },
            },
          ]
        );
        return false;
      }

      return dispatchWaterCommand(clampedDuration, currentMoisture);
    },
    [device, cooldownSecondsLeft, storeRefillBottle, dispatchWaterCommand]
  );

  return {
    stage,
    activeDuration,
    secondsRemaining,
    cooldownSecondsLeft,
    errorMessage,
    canWater,
    executeWaterNow,
    resetCommandState,
    refillBottle: storeRefillBottle,
  };
}
