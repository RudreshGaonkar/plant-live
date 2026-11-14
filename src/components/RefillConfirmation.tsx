import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice, RefillOutcome } from '@/store/useLiveDevice';

export type RefillStepState = 'idle' | 'confirming' | 'waiting' | 'confirmed' | 'error';

export interface RefillConfirmationProps {
  deviceId: string;
  controllerName?: string;
  targetCapacity?: number;
  onClose: () => void;
  onSuccess?: (confirmedCapacity: number) => void;
  style?: StyleProp<ViewStyle>;
}

export function RefillConfirmation({
  deviceId,
  controllerName,
  targetCapacity,
  onClose,
  onSuccess,
  style,
}: RefillConfirmationProps) {
  const { colors, radii } = useAppTheme();
  const requestRefill = useLiveDevice((s) => s.requestRefill);
  const device = useLiveDevice((s) => s.devices[deviceId]);

  const resolvedName =
    controllerName ||
    device?.config?.name ||
    device?.config?.plantName ||
    'LeafLink Controller';

  const resolvedCapacity =
    targetCapacity ||
    device?.config?.bottle?.capacityMl ||
    (device?.config as any)?.bottleCapacityMl ||
    1000;

  const [stepState, setStepState] = useState<RefillStepState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [confirmedCapacity, setConfirmedCapacity] = useState<number>(resolvedCapacity);

  const isWaiting = stepState === 'confirming' || stepState === 'waiting';

  const handleConfirmRefill = useCallback(async () => {
    if (isWaiting) return;
    setStepState('waiting');
    setErrorMessage('');

    try {
      const outcome: RefillOutcome = await requestRefill(deviceId);
      if (outcome.success) {
        setConfirmedCapacity(outcome.capacityMl);
        setStepState('confirmed');
        if (onSuccess) {
          onSuccess(outcome.capacityMl);
        }
      } else {
        setErrorMessage(outcome.message || 'Controller did not confirm');
        setStepState('error');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to dispatch refill command');
      setStepState('error');
    }
  }, [deviceId, isWaiting, onSuccess, requestRefill]);

  return (
    <View style={[styles.container, { backgroundColor: colors.palette.white, borderRadius: radii.card }, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconPill, { backgroundColor: `${colors.palette.forest}15` }]}>
          <Ionicons name="water" size={24} color={colors.palette.forest} />
        </View>
        <Text style={[styles.title, { color: colors.palette.ink }]}>Refill Reservoir</Text>
        <Text style={[styles.subtitle, { color: colors.palette.sage }]}>
          {resolvedName} • Target {resolvedCapacity} ml
        </Text>
      </View>

      {/* Description info */}
      <Text style={[styles.bodyText, { color: `${colors.palette.ink}B0` }]}>
        Confirm that the water reservoir has been refilled to full capacity. The controller will verify and update local calibrations.
      </Text>

      {/* Reserved status slot with fixed height so buttons NEVER shift */}
      <View style={styles.reservedStatusSlot}>
        {isWaiting && (
          <View style={styles.statusContentRow}>
            <ActivityIndicator size="small" color={colors.palette.forest} style={{ marginRight: 8 }} />
            <Text style={[styles.statusText, { color: colors.palette.forest }]}>
              Waiting for controller confirmation...
            </Text>
          </View>
        )}

        {stepState === 'confirmed' && (
          <View style={styles.statusContentRow}>
            <Ionicons name="checkmark-circle" size={18} color="#059669" style={{ marginRight: 6 }} />
            <Text style={[styles.statusText, { color: '#047857', fontWeight: '700' }]}>
              Reservoir confirmed full ({confirmedCapacity} ml)
            </Text>
          </View>
        )}

        {stepState === 'error' && (
          <View style={styles.statusContentRow}>
            <Ionicons name="alert-circle" size={18} color={colors.palette.critical} style={{ marginRight: 6 }} />
            <Text style={[styles.statusText, { color: colors.palette.critical }]} numberOfLines={2}>
              {errorMessage || 'Controller did not confirm'}
            </Text>
          </View>
        )}
      </View>

      {/* Action buttons with minHeight >= 48dp */}
      <View style={styles.buttonRow}>
        {stepState === 'idle' && (
          <>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.button,
                styles.cancelButton,
                { borderColor: `${colors.palette.ink}20`, borderRadius: radii.full },
              ]}
              accessibilityLabel="Cancel refill"
              accessibilityRole="button"
            >
              <Text style={[styles.cancelButtonText, { color: colors.palette.ink }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleConfirmRefill}
              style={[
                styles.button,
                styles.primaryButton,
                { backgroundColor: colors.palette.forest, borderRadius: radii.full },
              ]}
              accessibilityLabel="Confirm refill"
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>Confirm refill</Text>
            </TouchableOpacity>
          </>
        )}

        {isWaiting && (
          <>
            <TouchableOpacity
              disabled
              style={[
                styles.button,
                styles.cancelButton,
                { borderColor: `${colors.palette.ink}15`, borderRadius: radii.full, opacity: 0.5 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.cancelButtonText, { color: colors.palette.ink }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled
              style={[
                styles.button,
                styles.primaryButton,
                { backgroundColor: colors.palette.forest, borderRadius: radii.full, opacity: 0.7 },
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>Confirming...</Text>
            </TouchableOpacity>
          </>
        )}

        {stepState === 'confirmed' && (
          <TouchableOpacity
            onPress={onClose}
            style={[
              styles.button,
              styles.fullWidthButton,
              { backgroundColor: colors.palette.forest, borderRadius: radii.full },
            ]}
            accessibilityLabel="Done"
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Done</Text>
          </TouchableOpacity>
        )}

        {stepState === 'error' && (
          <>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.button,
                styles.cancelButton,
                { borderColor: `${colors.palette.ink}20`, borderRadius: radii.full },
              ]}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Text style={[styles.cancelButtonText, { color: colors.palette.ink }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleConfirmRefill}
              style={[
                styles.button,
                styles.primaryButton,
                { backgroundColor: colors.palette.forest, borderRadius: radii.full },
              ]}
              accessibilityLabel="Try again"
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

export interface RefillConfirmationModalProps {
  visible: boolean;
  deviceId: string;
  controllerName?: string;
  targetCapacity?: number;
  onClose: () => void;
  onSuccess?: (confirmedCapacity: number) => void;
}

export function RefillConfirmationModal({
  visible,
  deviceId,
  controllerName,
  targetCapacity,
  onClose,
  onSuccess,
}: RefillConfirmationModalProps) {
  const insets = useSafeAreaInsets();
  const { shadow } = useAppTheme();

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        {/* Sibling backdrop press-to-dismiss */}
        <Pressable
          style={styles.modalBackdrop}
          onPress={onClose}
          accessibilityLabel="Dismiss refill dialog"
        />

        {/* Centered / bottom modal container with safe-area handling */}
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={[
            styles.modalCardWrapper,
            {
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
          pointerEvents="box-none"
        >
          <ScrollView
            contentContainerStyle={styles.scrollFooterContent}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <RefillConfirmation
              deviceId={deviceId}
              controllerName={controllerName}
              targetCapacity={targetCapacity}
              onClose={onClose}
              onSuccess={onSuccess}
              style={{
                shadowColor: shadow.color,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.16,
                shadowRadius: 20,
                elevation: 16,
              }}
            />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24, // 20–24dp padding
    gap: 12,     // 8–12dp gaps
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  iconPill: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  reservedStatusSlot: {
    minHeight: 48, // Reserved status slot so text/spinner swaps never shift buttons
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  statusContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 13,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10, // 8–12dp gaps
    marginTop: 4,
  },
  button: {
    flex: 1,
    minHeight: 48, // >= 48dp action buttons
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  fullWidthButton: {
    flex: 1,
  },
  cancelButton: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {},
  primaryButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  modalCardWrapper: {
    width: '100%',
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  scrollFooterContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
});
