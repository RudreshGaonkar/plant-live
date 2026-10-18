import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { DeviceConfig, DeviceStatus, DeviceTelemetry } from '@/store/useLiveDevice';

export interface PlantPassportHeaderProps {
  config: DeviceConfig;
  status: DeviceStatus;
  telemetry: DeviceTelemetry;
}

export function PlantPassportHeader({
  config,
  status,
  telemetry,
}: PlantPassportHeaderProps) {
  const { colors, shadow } = useAppTheme();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Helper for last-seen human-readable time
  const formatLastSeen = (timestamp: number) => {
    if (!timestamp) return 'Unknown';
    const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
    if (diffSec < 15) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Wi-Fi signal helper
  const getWifiSignalInfo = (rssi: number) => {
    if (rssi >= -60) return { label: `${rssi} dBm (Strong)`, icon: 'wifi' as const };
    if (rssi >= -75) return { label: `${rssi} dBm (Good)`, icon: 'wifi' as const };
    return { label: `${rssi} dBm (Weak)`, icon: 'wifi-outline' as const };
  };

  const wifiInfo = getWifiSignalInfo(telemetry.rssi);

  // Location display mapping
  const locationMeta: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
    balcony: { label: 'Balcony', icon: 'leaf-outline' },
    terrace: { label: 'Terrace', icon: 'sunny-outline' },
    indoor: { label: 'Indoor', icon: 'home-outline' },
  };

  const currentLocation = locationMeta[config.location] ?? {
    label: config.location.charAt(0).toUpperCase() + config.location.slice(1),
    icon: 'leaf-outline',
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.palette.mint,
          shadowColor: shadow.color,
          shadowOffset: { width: 0, height: shadow.offsetY },
          shadowOpacity: shadow.opacity,
          shadowRadius: shadow.blur,
          elevation: shadow.elevation,
        },
      ]}
    >
      {/* Decorative organic background watermark / emblem */}
      <View style={styles.topPatternAccent}>
        <View
          style={[
            styles.passportBadgePill,
            { backgroundColor: colors.palette.forest },
          ]}
        >
          <Ionicons name="document-text-outline" size={11} color={colors.palette.white} />
          <Text style={[styles.passportBadgeText, { color: colors.palette.white }]}>
            PLANT PASSPORT
          </Text>
        </View>
      </View>

      {/* Main Passport Identity Row */}
      <View style={styles.identityRow}>
        {/* Plant Thumbnail / Avatar */}
        <View
          style={[
            styles.avatarContainer,
            {
              backgroundColor: colors.palette.mist,
              borderColor: colors.palette.mint,
            },
          ]}
        >
          <Text style={styles.avatarEmoji}>🌿</Text>
          <View
            style={[
              styles.onlineDot,
              {
                backgroundColor: status.online
                  ? colors.palette.mint
                  : colors.palette.warningBorder,
              },
            ]}
          />
        </View>

        {/* Title, Species, and Location Chip */}
        <View style={styles.infoCol}>
          <View style={styles.nameLocationRow}>
            <Text
              style={[styles.plantName, { color: colors.palette.ink }]}
              numberOfLines={1}
            >
              {config.name || config.plantName || 'Monstera Deliciosa'}
            </Text>
          </View>

          <Text style={[styles.speciesText, { color: colors.palette.forest }]}>
            {config.plantSpecies || 'Epipremnum aureum'}
          </Text>

          {/* Location Chip */}
          <View
            style={[
              styles.locationChip,
              {
                backgroundColor: colors.palette.lime,
                borderColor: colors.palette.mint,
              },
            ]}
          >
            <Ionicons
              name={currentLocation.icon}
              size={12}
              color={colors.palette.forest}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.locationChipText, { color: colors.palette.forest }]}>
              {currentLocation.label}
            </Text>
          </View>
        </View>
      </View>

      {/* Passport Perforation / Divider */}
      <View style={[styles.divider, { borderColor: colors.palette.mint }]} />

      {/* Device Status Row: Wi-Fi Signal (rssi), Firmware, Last Seen */}
      <View style={styles.statusRow}>
        {/* Wi-Fi Signal */}
        <View style={styles.statusItem}>
          <View style={[styles.statusIconWrap, { backgroundColor: colors.palette.mist }]}>
            <Ionicons name={wifiInfo.icon} size={13} color={colors.palette.forest} />
          </View>
          <View>
            <Text style={[styles.statusKey, { color: colors.textMuted }]}>Signal</Text>
            <Text style={[styles.statusVal, { color: colors.palette.ink }]}>
              {telemetry.rssi} dBm
            </Text>
          </View>
        </View>

        {/* Firmware Version */}
        <View style={styles.statusItem}>
          <View style={[styles.statusIconWrap, { backgroundColor: colors.palette.mist }]}>
            <Ionicons name="hardware-chip-outline" size={13} color={colors.palette.forest} />
          </View>
          <View>
            <Text style={[styles.statusKey, { color: colors.textMuted }]}>Firmware</Text>
            <Text
              style={[styles.statusVal, { color: colors.palette.ink }]}
              numberOfLines={1}
            >
              {status.firmware}
            </Text>
          </View>
        </View>

        {/* Last Seen */}
        <View style={styles.statusItem}>
          <View style={[styles.statusIconWrap, { backgroundColor: colors.palette.mist }]}>
            <Ionicons name="time-outline" size={13} color={colors.palette.forest} />
          </View>
          <View>
            <Text style={[styles.statusKey, { color: colors.textMuted }]}>Last Seen</Text>
            <Text style={[styles.statusVal, { color: colors.palette.ink }]}>
              {formatLastSeen(status.lastSeen)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderTopLeftRadius: 48, // 48px organic corner from uiLayout §8
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 16,
    overflow: 'hidden',
  },
  topPatternAccent: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  passportBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  passportBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarEmoji: {
    fontSize: 32,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  infoCol: {
    flex: 1,
  },
  nameLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plantName: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  speciesText: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 2,
    fontWeight: '600',
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    marginTop: 6,
  },
  locationChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 0.8,
    marginVertical: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  statusIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusKey: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statusVal: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
});
