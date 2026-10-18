/**
 * CalibrationWizard
 * Guided 2-step soil moisture sensor calibration (Dry Air & Wet Water).
 * Stores raw ADC values (soilDryRaw & soilWetRaw) and computes sensor delta.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';

export interface CalibrationValues {
  soilDryRaw: number;
  soilWetRaw: number;
}

export interface CalibrationWizardProps {
  initialValues?: CalibrationValues;
  onCalibrationComplete: (values: CalibrationValues) => void;
  onSkip?: () => void;
}

export function CalibrationWizard({
  initialValues = { soilDryRaw: 1024, soilWetRaw: 400 },
  onCalibrationComplete,
  onSkip,
}: CalibrationWizardProps) {
  const { colors, radii } = useAppTheme();

  const [activeStep, setActiveStep] = useState<1 | 2>(1);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [dryRaw, setDryRaw] = useState<number | null>(initialValues.soilDryRaw);
  const [wetRaw, setWetRaw] = useState<number | null>(initialValues.soilWetRaw);

  const captureDry = () => {
    setIsCapturing(true);
    // Simulate reading ADC value from sensor/RTDB
    setTimeout(() => {
      const sampled = Math.round(1020 + Math.random() * 4);
      setDryRaw(sampled);
      setIsCapturing(false);
      setActiveStep(2);
    }, 1200);
  };

  const captureWet = () => {
    setIsCapturing(true);
    // Simulate reading ADC value in water from sensor/RTDB
    setTimeout(() => {
      const sampled = Math.round(380 + Math.random() * 20);
      setWetRaw(sampled);
      setIsCapturing(false);
    }, 1200);
  };

  const handleFinish = () => {
    onCalibrationComplete({
      soilDryRaw: dryRaw ?? 1024,
      soilWetRaw: wetRaw ?? 400,
    });
  };

  const dynamicRange = (dryRaw ?? 1024) - (wetRaw ?? 400);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.card, borderColor: colors.border }]}>
      {/* Step Progress Pills */}
      <View style={styles.stepHeader}>
        <View style={styles.stepIndicators}>
          <View
            style={[
              styles.stepBadge,
              {
                backgroundColor: activeStep >= 1 ? colors.palette.forest : colors.palette.mist,
                borderRadius: radii.full,
              },
            ]}
          >
            <Text
              style={[
                styles.stepBadgeText,
                { color: activeStep >= 1 ? colors.palette.white : colors.palette.sage },
              ]}
            >
              1
            </Text>
          </View>
          <View
            style={[
              styles.stepLine,
              { backgroundColor: dryRaw ? colors.palette.forest : colors.border },
            ]}
          />
          <View
            style={[
              styles.stepBadge,
              {
                backgroundColor: activeStep >= 2 ? colors.palette.forest : colors.palette.mist,
                borderRadius: radii.full,
              },
            ]}
          >
            <Text
              style={[
                styles.stepBadgeText,
                { color: activeStep >= 2 ? colors.palette.white : colors.palette.sage },
              ]}
            >
              2
            </Text>
          </View>
        </View>

        <Text style={[styles.stepCountText, { color: colors.textMuted }]}>
          Step {activeStep} of 2
        </Text>
      </View>

      {/* STEP 1: Dry Air / Soil */}
      {activeStep === 1 && (
        <View style={styles.contentWrap}>
          <View style={[styles.iconCircle, { backgroundColor: colors.palette.blush }]}>
            <Ionicons name="sunny" size={32} color={colors.palette.warningText} />
          </View>
          <Text style={[styles.stepTitle, { color: colors.text }]}>Capture Dry Air (0% Baseline)</Text>
          <Text style={[styles.stepDesc, { color: colors.textMuted }]}>
            Hold the capacitive probe in dry air or completely dry soil away from moisture.
          </Text>

          <View style={[styles.valueBox, { backgroundColor: colors.palette.mist, borderRadius: radii.md }]}>
            <Text style={[styles.valueLabel, { color: colors.textMuted }]}>Dry Raw Reading (ADC)</Text>
            <Text style={[styles.valueText, { color: colors.palette.forest }]}>
              {dryRaw ?? '—'}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: colors.primary, borderRadius: radii.xl },
            ]}
            onPress={captureDry}
            disabled={isCapturing}
          >
            {isCapturing ? (
              <ActivityIndicator color={colors.palette.white} size="small" />
            ) : (
              <>
                <Ionicons name="hardware-chip-outline" size={18} color={colors.palette.white} style={{ marginRight: 6 }} />
                <Text style={styles.actionButtonText}>Capture Dry Reading</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* STEP 2: Wet Water / Saturated Soil */}
      {activeStep === 2 && (
        <View style={styles.contentWrap}>
          <View style={[styles.iconCircle, { backgroundColor: colors.palette.mint }]}>
            <Ionicons name="water" size={32} color={colors.palette.forest} />
          </View>
          <Text style={[styles.stepTitle, { color: colors.text }]}>Capture Wet (100% Saturation)</Text>
          <Text style={[styles.stepDesc, { color: colors.textMuted }]}>
            Place the probe in a glass of water or thoroughly soaked soil up to the white line.
          </Text>

          <View style={[styles.valueBox, { backgroundColor: colors.palette.mist, borderRadius: radii.md }]}>
            <Text style={[styles.valueLabel, { color: colors.textMuted }]}>Wet Raw Reading (ADC)</Text>
            <Text style={[styles.valueText, { color: colors.palette.forest }]}>
              {wetRaw ?? '—'}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: colors.primary, borderRadius: radii.xl },
            ]}
            onPress={captureWet}
            disabled={isCapturing}
          >
            {isCapturing ? (
              <ActivityIndicator color={colors.palette.white} size="small" />
            ) : (
              <>
                <Ionicons name="water-outline" size={18} color={colors.palette.white} style={{ marginRight: 6 }} />
                <Text style={styles.actionButtonText}>Capture Wet Reading</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Dynamic Range Summary Indicator */}
      {dryRaw && wetRaw && (
        <View style={[styles.summaryCard, { backgroundColor: colors.palette.lime, borderRadius: radii.md }]}>
          <View style={styles.summaryRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.palette.forest} />
            <Text style={[styles.summaryTitle, { color: colors.palette.ink }]}>
              Calibrated Sensitivity Delta: {dynamicRange} counts
            </Text>
          </View>
          <Text style={[styles.summarySub, { color: colors.palette.forest }]}>
            Span: {dryRaw} (dry) → {wetRaw} (wet). Ideal resolution: 500–650 counts.
          </Text>
        </View>
      )}

      {/* Navigation Footer */}
      <View style={styles.footer}>
        {activeStep === 2 && (
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border, borderRadius: radii.xl }]}
            onPress={() => setActiveStep(1)}
          >
            <Ionicons name="arrow-back" size={14} color={colors.palette.forest} style={{ marginRight: 4 }} />
            <Text style={[styles.secondaryBtnText, { color: colors.palette.forest }]}>Back</Text>
          </TouchableOpacity>
        )}

        {onSkip && (
          <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip (Use Factory Defaults)</Text>
          </TouchableOpacity>
        )}

        {activeStep === 2 && wetRaw && (
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.palette.forest, borderRadius: radii.xl }]}
            onPress={handleFinish}
          >
            <Ionicons name="save-outline" size={16} color={colors.palette.white} style={{ marginRight: 6 }} />
            <Text style={styles.saveBtnText}>Save Calibration</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderWidth: 1,
    marginVertical: 10,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepBadge: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  stepLine: {
    width: 32,
    height: 2,
    marginHorizontal: 4,
  },
  stepCountText: {
    fontSize: 12,
    fontWeight: '700',
  },
  contentWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  stepDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  valueBox: {
    width: '100%',
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  valueLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  valueText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  summaryCard: {
    padding: 14,
    marginTop: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  summarySub: {
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  skipBtn: {
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
