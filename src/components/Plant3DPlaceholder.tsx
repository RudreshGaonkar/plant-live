import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { PlantHealthState } from '@/store/useLiveDevice';
import { StatusChip } from './StatusChip';

export interface Plant3DPlaceholderProps {
  health: PlantHealthState;
  isWatering?: boolean;
  secondsLeft?: number;
  location?: string;
  plantName?: string;
  plantSpecies?: string;
}

export const Plant3DPlaceholder: React.FC<Plant3DPlaceholderProps> = ({
  health,
  isWatering = false,
  secondsLeft = 0,
  location = 'Balcony',
  plantName = 'Monstera Deliciosa',
  plantSpecies = 'Swiss Cheese Plant',
}) => {
  const { colors, radii } = useAppTheme();

  const getVisual = () => {
    if (isWatering) {
      return {
        iconName: 'water' as const,
        iconColor: colors.palette.forest,
        banner: `Watering Active (${secondsLeft}s)...`,
      };
    }
    switch (health) {
      case 'thirsty':
        return {
          iconName: 'alert-circle' as const,
          iconColor: colors.palette.warningText,
          banner: 'Moisture Below Minimum Threshold',
        };
      case 'overwatered':
        return {
          iconName: 'warning' as const,
          iconColor: colors.palette.warningText,
          banner: 'Soil Moisture High / Soggy Roots',
        };
      case 'healthy':
      default:
        return {
          iconName: 'leaf' as const,
          iconColor: colors.palette.forest,
          banner: 'Optimal Photosynthesis & Soil Balance',
        };
    }
  };

  const { iconName, iconColor, banner } = getVisual();

  const getCardBg = () => {
    if (health === 'thirsty' || health === 'overwatered') {
      return colors.palette.blush;
    }
    return colors.palette.mist;
  };

  return (
    <View
      style={[
        styles.heroContainer,
        {
          backgroundColor: getCardBg(),
          borderRadius: radii.hero,
          borderTopRightRadius: radii.hero * 1.5,
          borderColor: isWatering ? colors.palette.forest : colors.palette.lime,
        },
      ]}
    >
      {/* Top Tag Badges */}
      <View style={styles.topRow}>
        <View style={[styles.tagWrap, { backgroundColor: colors.palette.white }]}>
          <Ionicons name="location-outline" size={13} color={colors.palette.forest} />
          <Text style={[styles.locationBadge, { color: colors.palette.forest }]}>
            {location.toUpperCase()}
          </Text>
        </View>
        <StatusChip status={health} />
      </View>

      {/* 3D Scene / Illustration Stage */}
      <View style={styles.stage}>
        {isWatering && (
          <View style={styles.wateringDrops}>
            <Ionicons name="water" size={24} color={colors.palette.forest} />
          </View>
        )}

        <View
          style={[
            styles.potGlow,
            {
              backgroundColor: isWatering ? colors.palette.mint : colors.palette.lime,
            },
          ]}
        >
          <Ionicons name={iconName} size={72} color={iconColor} />
        </View>

        <Text style={[styles.plantTitle, { color: colors.palette.ink }]}>{plantName}</Text>
        <Text style={[styles.plantSubtitle, { color: colors.palette.forest }]}>{plantSpecies}</Text>
      </View>

      {/* Status Bar / Watering Countdown */}
      <View
        style={[
          styles.footerBanner,
          {
            backgroundColor: isWatering
              ? colors.palette.forest
              : colors.palette.lime,
            borderRadius: radii.md,
          },
        ]}
      >
        <Text
          style={[
            styles.bannerText,
            { color: isWatering ? colors.palette.white : colors.palette.ink },
          ]}
        >
          {banner}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroContainer: {
    height: 310,
    padding: 16,
    justifyContent: 'space-between',
    borderWidth: 1.5,
    marginVertical: 10,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  locationBadge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  wateringDrops: {
    position: 'absolute',
    top: -16,
    zIndex: 10,
  },
  potGlow: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  plantTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  plantSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  footerBanner: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
