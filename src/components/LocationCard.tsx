import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { PlantLocation } from '@/store/useLiveDevice';

export interface LocationCardProps {
  location: PlantLocation;
  selected?: boolean;
  onSelect?: (loc: PlantLocation) => void;
}

export const LocationCard: React.FC<LocationCardProps> = ({
  location,
  selected = false,
  onSelect,
}) => {
  const { colors, radii, spacing } = useAppTheme();

  const getInfo = () => {
    switch (location) {
      case 'balcony':
        return {
          title: 'Balcony',
          iconName: 'flower-outline' as const,
          moistureTarget: '30% – 60%',
          desc: 'Partial sun & rain exposure. Balanced watering rhythm.',
          lightSensor: 'LDR Recommended',
        };
      case 'terrace':
        return {
          title: 'Terrace',
          iconName: 'sunny-outline' as const,
          moistureTarget: '25% – 55%',
          desc: 'Full sun and windy conditions. Fastest soil evaporation.',
          lightSensor: 'LDR Recommended',
        };
      case 'indoor':
      default:
        return {
          title: 'Indoor',
          iconName: 'home-outline' as const,
          moistureTarget: '35% – 65%',
          desc: 'Lower ambient evaporation. Waters less often.',
          lightSensor: 'LDR Not Needed',
        };
    }
  };

  const { title, iconName, moistureTarget, desc, lightSensor } = getInfo();

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onSelect && onSelect(location)}
      style={[
        styles.card,
        {
          backgroundColor: selected ? colors.palette.lime : colors.palette.white,
          borderRadius: radii.card,
          borderColor: selected ? colors.palette.forest : colors.palette.lime,
          borderWidth: selected ? 2 : 1,
          padding: spacing.md,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Ionicons
            name={iconName}
            size={20}
            color={selected ? colors.palette.forest : colors.palette.sage}
          />
          <Text style={[styles.title, { color: colors.palette.ink }]}>{title}</Text>
        </View>
        <View
          style={[
            styles.radio,
            {
              borderColor: selected ? colors.palette.forest : colors.palette.sage,
              backgroundColor: selected ? colors.palette.forest : colors.palette.white,
            },
          ]}
        >
          {selected && <View style={[styles.radioInner, { backgroundColor: colors.palette.white }]} />}
        </View>
      </View>

      <Text style={[styles.desc, { color: colors.palette.forest }]}>{desc}</Text>

      <View style={styles.footerRow}>
        <View
          style={[
            styles.tag,
            { backgroundColor: selected ? colors.palette.mint : colors.palette.lime },
          ]}
        >
          <Text style={[styles.tagText, { color: colors.palette.ink }]}>
            Target: {moistureTarget}
          </Text>
        </View>
        <Text style={[styles.lightHint, { color: colors.palette.sage }]}>{lightSensor}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 6,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  desc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  lightHint: {
    fontSize: 11,
    fontWeight: '600',
  },
});
