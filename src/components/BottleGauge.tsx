import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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

  const totalHeight = 90;
  const fillHeight = (percentage / 100) * totalHeight;

  const getFillColor = () => {
    if (isCritical) return colors.palette.warningBorder;
    if (isLow) return colors.palette.warningText;
    return colors.palette.forest;
  };

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
      {/* Section Label */}
      <View style={styles.sectionLabel}>
        <Ionicons
          name="flask-outline"
          size={16}
          color={isLow ? colors.palette.warningText : colors.palette.forest}
        />
        <Text
          style={[
            styles.sectionLabelText,
            { color: isLow ? colors.palette.warningText : colors.palette.forest },
          ]}
        >
          RESERVOIR
        </Text>
      </View>

      <View style={styles.contentRow}>
        {/* Native Rendered Water Bottle */}
        <View style={styles.bottleContainer}>
          {/* Cap */}
          <View
            style={[
              styles.bottleCap,
              { backgroundColor: isLow ? colors.palette.warningBorder : colors.palette.forest },
            ]}
          />
          {/* Neck */}
          <View
            style={[
              styles.bottleNeck,
              {
                backgroundColor: colors.palette.mist,
                borderColor: isLow ? colors.palette.warningBorder : colors.palette.sage,
              },
            ]}
          />
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
                  backgroundColor: getFillColor(),
                  opacity: 0.85,
                },
              ]}
            />
            {/* Water surface line */}
            {fillHeight > 10 && (
              <View
                style={[
                  styles.waterSurface,
                  {
                    bottom: Math.max(4, fillHeight) - 1,
                    backgroundColor: colors.palette.white,
                  },
                ]}
              />
            )}
          </View>
          {/* Percentage below bottle */}
          <Text
            style={[
              styles.bottlePercent,
              { color: isLow ? colors.palette.warningText : colors.palette.forest },
            ]}
          >
            {percentage}%
          </Text>
        </View>

        {/* Info Column */}
        <View style={styles.infoColumn}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.palette.ink }]}>Water Level</Text>
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
                styles.mlText,
                { color: isLow ? colors.palette.warningText : colors.palette.ink },
              ]}
            >
              {remainingMl}
              <Text style={[styles.mlUnit, { color: colors.palette.sage }]}> / {capacityMl} ml</Text>
            </Text>
          </View>

          {/* Horizontal bar gauge */}
          <View style={[styles.barTrack, { backgroundColor: colors.palette.mist }]}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${percentage}%`,
                  backgroundColor: getFillColor(),
                },
              ]}
            />
          </View>

          <Text style={[styles.wateringsText, { color: isLow ? colors.palette.warningText : colors.palette.sage }]}>
            {isCritical
              ? 'Reservoir critically low. Refill required.'
              : isLow
              ? `Low reservoir (~${wateringsLeft} waterings left)`
              : `~${wateringsLeft} waterings remaining`}
          </Text>

          {onRefill && (
            <TouchableOpacity
              onPress={onRefill}
              style={[
                styles.refillButton,
                {
                  backgroundColor: isLow ? colors.palette.forest : colors.palette.lime,
                  borderRadius: radii.md,
                },
              ]}
              activeOpacity={0.8}
            >
              <Ionicons
                name="refresh-outline"
                size={14}
                color={isLow ? colors.palette.white : colors.palette.ink}
                style={{ marginRight: 4 }}
              />
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.5,
    marginVertical: 6,
    elevation: 2,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 18,
    width: 52,
  },
  bottleCap: {
    width: 16,
    height: 8,
    borderRadius: 3,
  },
  bottleNeck: {
    width: 20,
    height: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderWidth: 1.5,
    borderBottomWidth: 0,
  },
  bottleBody: {
    width: 42,
    height: 90,
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
  waterSurface: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: 2,
    borderRadius: 1,
    opacity: 0.5,
  },
  bottlePercent: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
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
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statRow: {
    marginBottom: 6,
  },
  mlText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  mlUnit: {
    fontSize: 13,
    fontWeight: '600',
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  wateringsText: {
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 16,
  },
  refillButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  refillButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
