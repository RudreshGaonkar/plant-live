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

  const getBorderColor = () => {
    if (status === 'warning' || status === 'alert') return colors.palette.warningBorder;
    return colors.palette.lime;
  };

  const getBadgeBg = () => {
    if (status === 'warning' || status === 'alert') return colors.palette.blush;
    return colors.palette.lime;
  };

  const getIconColor = () => {
    if (status === 'warning' || status === 'alert') return colors.palette.warningText;
    return colors.palette.forest;
  };

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
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.palette.forest }]}>{label}</Text>
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
    minHeight: 110,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  unit: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 3,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
});
