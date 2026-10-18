import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';

export interface MetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  status?: 'normal' | 'warning' | 'alert';
  subtitle?: string;
}

export const MetricTile: React.FC<MetricTileProps> = ({
  label,
  value,
  unit,
  iconName,
  status = 'normal',
  subtitle,
}) => {
  const { colors, radii, spacing } = useAppTheme();

  const isAlert = status === 'warning' || status === 'alert';

  const getBorderColor = () => {
    if (isAlert) return colors.palette.warningBorder;
    return colors.palette.lime;
  };

  const getBadgeBg = () => {
    if (isAlert) return colors.palette.blush;
    return colors.palette.lime;
  };

  const getIconColor = () => {
    if (isAlert) return colors.palette.warningText;
    return colors.palette.forest;
  };

  // Calculate a rough progress percentage for the visual bar
  const getProgress = (): number => {
    if (typeof value !== 'number') return 0;
    return Math.min(100, Math.max(0, value));
  };

  const progressValue = getProgress();
  const showProgress = typeof value === 'number';

  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: colors.palette.white,
          borderRadius: radii.card,
          borderColor: getBorderColor(),
          padding: spacing.md,
        },
      ]}
    >
      {/* Subtle top accent bar */}
      <View
        style={[
          styles.accentBar,
          {
            backgroundColor: isAlert ? colors.palette.warningBorder : colors.palette.forest,
          },
        ]}
      />

      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.palette.sage }]}>{label}</Text>
        {iconName && (
          <View style={[styles.iconWrap, { backgroundColor: getBadgeBg() }]}>
            <Ionicons name={iconName} size={15} color={getIconColor()} />
          </View>
        )}
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: colors.palette.ink }]}>{value}</Text>
        {unit && <Text style={[styles.unit, { color: colors.palette.forest }]}>{unit}</Text>}
      </View>

      {/* Mini progress bar for numeric values */}
      {showProgress && (
        <View style={[styles.progressTrack, { backgroundColor: colors.palette.mist }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressValue}%`,
                backgroundColor: isAlert ? colors.palette.warningBorder : colors.palette.sage,
              },
            ]}
          />
        </View>
      )}

      {subtitle && (
        <Text style={[styles.subtitle, { color: colors.palette.sage }]}>{subtitle}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: '45%',
    borderWidth: 1.5,
    margin: 4,
    elevation: 2,
    justifyContent: 'space-between',
    minHeight: 120,
    overflow: 'hidden',
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  unit: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 3,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  subtitle: {
    fontSize: 10,
    marginTop: 6,
    fontWeight: '500',
  },
});
