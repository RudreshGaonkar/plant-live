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
        iconColor: colors.palette.white,
        banner: `Watering Active (${secondsLeft}s)...`,
        glowColor: colors.palette.forest,
      };
    }
    switch (health) {
      case 'thirsty':
        return {
          iconName: 'alert-circle' as const,
          iconColor: colors.palette.warningText,
          banner: 'Moisture Below Minimum Threshold',
          glowColor: colors.palette.blush,
        };
      case 'overwatered':
        return {
          iconName: 'warning' as const,
          iconColor: colors.palette.warningText,
          banner: 'Soil Moisture High / Soggy Roots',
          glowColor: colors.palette.blush,
        };
      case 'healthy':
      default:
        return {
          iconName: 'leaf' as const,
          iconColor: colors.palette.forest,
          banner: 'Optimal Photosynthesis & Soil Balance',
          glowColor: colors.palette.mint,
        };
    }
  };

  const { iconName, iconColor, banner, glowColor } = getVisual();

  const getCardBg = () => {
    if (health === 'thirsty' || health === 'overwatered') {
      return colors.palette.blush;
    }
    return colors.palette.mist;
  };

  const getCardBorder = () => {
    if (isWatering) return colors.palette.forest;
    if (health === 'thirsty' || health === 'overwatered') return colors.palette.warningBorder;
    return colors.palette.lime;
  };

  return (
    <View
      style={[
        styles.heroContainer,
        {
          backgroundColor: getCardBg(),
          borderRadius: radii.hero,
          borderTopRightRadius: radii.hero * 1.5,
          borderColor: getCardBorder(),
        },
      ]}
    >
      {/* Decorative background circles */}
      <View style={[styles.bgCircleLg, { backgroundColor: glowColor, opacity: 0.15 }]} />
      <View style={[styles.bgCircleSm, { backgroundColor: colors.palette.lime, opacity: 0.12 }]} />

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
        {/* Layered glow rings */}
        <View
          style={[
            styles.outerGlow,
            {
              backgroundColor: glowColor,
              opacity: 0.2,
            },
          ]}
        />
        <View
          style={[
            styles.potGlow,
            {
              backgroundColor: isWatering ? colors.palette.mint : glowColor,
            },
          ]}
        >
          {/* Watering indicator drops */}
          {isWatering && (
            <View style={styles.wateringOverlay}>
              <Ionicons name="water" size={18} color={colors.palette.forest} style={{ opacity: 0.6, position: 'absolute', top: -10, left: 20 }} />
              <Ionicons name="water" size={14} color={colors.palette.forest} style={{ opacity: 0.4, position: 'absolute', top: -6, right: 18 }} />
              <Ionicons name="water" size={10} color={colors.palette.forest} style={{ opacity: 0.3, position: 'absolute', top: -14, left: 50 }} />
            </View>
          )}
          <Ionicons name={iconName} size={64} color={iconColor} />
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
              : health === 'thirsty' || health === 'overwatered'
              ? colors.palette.warningBorder
              : colors.palette.lime,
            borderRadius: radii.md,
          },
        ]}
      >
        <View style={styles.footerRow}>
          <View
            style={[
              styles.pulseDot,
              {
                backgroundColor: isWatering || health === 'thirsty' || health === 'overwatered'
                  ? colors.palette.white
                  : colors.palette.forest,
              },
            ]}
          />
          <Text
            style={[
              styles.bannerText,
              {
                color: isWatering || health === 'thirsty' || health === 'overwatered'
                  ? colors.palette.white
                  : colors.palette.ink,
              },
            ]}
          >
            {banner}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroContainer: {
    height: 320,
    padding: 18,
    justifyContent: 'space-between',
    borderWidth: 1.5,
    marginVertical: 10,
    elevation: 3,
    overflow: 'hidden',
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  bgCircleLg: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    top: -40,
    right: -60,
  },
  bgCircleSm: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    bottom: 20,
    left: -30,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  tagWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
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
    zIndex: 2,
  },
  outerGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  potGlow: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  wateringOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  plantTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  plantSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  footerBanner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
