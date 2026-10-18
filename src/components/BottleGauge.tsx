import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '@/theme';

export interface BottleGaugeProps {
  remainingMl: number;
  capacityMl: number;
  flowMlPerSec?: number;
  onRefill?: () => void;
}

export const BottleGauge: React.FC<BottleGaugeProps> = ({
  remainingMl,
  capacityMl,
  flowMlPerSec = 15,
  onRefill,
}) => {
  const { colors, radii, spacing } = useAppTheme();

  const percentage = Math.max(0, Math.min(100, Math.round((remainingMl / capacityMl) * 100)));
  const isLow = percentage <= 20;
  const isCritical = percentage <= 5;
  const wateringsLeft = Math.floor(remainingMl / (flowMlPerSec * 5));

  const totalHeight = 84;
  const fillHeight = (percentage / 100) * totalHeight;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isLow ? colors.palette.blush : colors.palette.white,
          borderRadius: radii.card,
          borderColor: isLow ? colors.palette.warningBorder : colors.palette.lime,
          padding: spacing.md,
        },
      ]}
    >
      {/* Native Rendered Water Bottle */}
      <View style={styles.bottleContainer}>
        {/* Cap */}
        <View style={[styles.bottleCap, { backgroundColor: colors.palette.forest }]} />
        {/* Neck */}
        <View style={[styles.bottleNeck, { backgroundColor: colors.palette.mist }]} />
        {/* Body */}
        <View
          style={[
            styles.bottleBody,
            {
              backgroundColor: colors.palette.mist,
              borderColor: isLow ? colors.palette.warningBorder : colors.palette.sage,
            },
          ]}
        >
          {/* Water Fill Level */}
          <View
            style={[
              styles.bottleFill,
              {
                height: Math.max(4, fillHeight),
                backgroundColor: isLow ? colors.palette.warningBorder : colors.palette.forest,
              },
            ]}
          />
        </View>
      </View>

      {/* Info Column */}
      <View style={styles.infoColumn}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.palette.ink }]}>Reservoir Level</Text>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: isLow ? colors.palette.white : colors.palette.lime,
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: isLow ? colors.palette.warningText : colors.palette.ink },
              ]}
            >
              Estimated
            </Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <Text
            style={[
              styles.percentText,
              { color: isLow ? colors.palette.warningText : colors.palette.forest },
            ]}
          >
            {percentage}%
          </Text>
          <Text style={[styles.mlText, { color: colors.palette.forest }]}>
            {remainingMl} / {capacityMl} ml
          </Text>
        </View>

        <Text style={[styles.wateringsText, { color: colors.palette.forest }]}>
          {isCritical
            ? 'Reservoir critically low. Refill required.'
            : isLow
            ? 'Low reservoir (~' + wateringsLeft + ' waterings left)'
            : 'Sufficient level (~' + wateringsLeft + ' waterings remaining)'}
        </Text>

        {onRefill && (
          <TouchableOpacity
            onPress={onRefill}
            style={[
              styles.refillButton,
              {
                backgroundColor: isLow ? colors.palette.forest : colors.palette.lime,
                borderRadius: radii.sm,
              },
            ]}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.refillButtonText,
                { color: isLow ? colors.palette.white : colors.palette.ink },
              ]}
            >
              I Refilled Bottle
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    marginVertical: 6,
    elevation: 2,
  },
  bottleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    width: 48,
  },
  bottleCap: {
    width: 14,
    height: 7,
    borderRadius: 2,
  },
  bottleNeck: {
    width: 18,
    height: 8,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  bottleBody: {
    width: 38,
    height: 84,
    borderRadius: 14,
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  bottleFill: {
    width: '100%',
    borderBottomLeftRadius: 11,
    borderBottomRightRadius: 11,
  },
  infoColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  percentText: {
    fontSize: 26,
    fontWeight: '800',
  },
  mlText: {
    fontSize: 13,
    fontWeight: '600',
  },
  wateringsText: {
    fontSize: 12,
    marginBottom: 8,
  },
  refillButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refillButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
