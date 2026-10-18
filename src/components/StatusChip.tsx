import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { PlantHealthState } from '@/store/useLiveDevice';

export interface StatusChipProps {
  status: PlantHealthState;
  label?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, label }) => {
  const { colors, radii } = useAppTheme();

  const getDetails = () => {
    switch (status) {
      case 'healthy':
        return {
          bg: colors.palette.mint,
          textColor: colors.palette.ink,
          iconName: 'leaf-outline' as const,
          iconColor: colors.palette.forest,
          text: label || 'Healthy & Thriving',
        };
      case 'thirsty':
        return {
          bg: colors.palette.blush,
          textColor: colors.palette.warningText,
          iconName: 'water-outline' as const,
          iconColor: colors.palette.warningText,
          text: label || 'Needs Water',
        };
      case 'overwatered':
        return {
          bg: colors.palette.blush,
          textColor: colors.palette.warningText,
          iconName: 'warning-outline' as const,
          iconColor: colors.palette.warningText,
          text: label || 'Too Wet / Soggy',
        };
      case 'unknown':
      default:
        return {
          bg: colors.palette.lime,
          textColor: colors.palette.ink,
          iconName: 'cloud-offline-outline' as const,
          iconColor: colors.palette.forest,
          text: label || 'Device Offline',
        };
    }
  };

  const { bg, textColor, iconName, iconColor, text } = getDetails();

  return (
    <View style={[styles.chip, { backgroundColor: bg, borderRadius: radii.full }]}>
      <Ionicons name={iconName} size={14} color={iconColor} style={styles.icon} />
      <Text style={[styles.text, { color: textColor }]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
