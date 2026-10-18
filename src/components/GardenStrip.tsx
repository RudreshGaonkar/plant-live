/**
 * GardenStrip
 * Horizontal plant switcher strip that slides down from the top bar.
 * Each card: plant name, status dot, moisture %.
 * Last card: "+ Add plant" button.
 * uiLayout.md Section 3.4
 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useAppTheme } from '@/theme';
import { DeviceRecord, PlantHealthState } from '@/store/useLiveDevice';

const STATUS_DOTS: Record<PlantHealthState, string> = {
  healthy: '#AEE09A',
  thirsty: '#F8D7DA',
  overwatered: '#CEEA9F',
  unknown: '#B0BEC5',
};

interface GardenStripProps {
  devices: DeviceRecord[];
  activeDeviceId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function GardenStrip({
  devices,
  activeDeviceId,
  onSelect,
  onClose,
}: GardenStripProps) {
  const { colors, radii } = useAppTheme();

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16)}
      exiting={FadeOutUp.duration(200)}
      style={[
        styles.container,
        {
          backgroundColor: `${colors.palette.white}F0`,
          borderRadius: radii.card,
          shadowColor: colors.palette.ink,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 20,
          elevation: 16,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.palette.ink }]}>
          Your Plants
        </Text>
        <TouchableOpacity
          onPress={onClose}
          accessibilityLabel="Close plant switcher"
          style={styles.closeBtn}
        >
          <Ionicons
            name="close"
            size={18}
            color={colors.palette.ink}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {devices.map((device) => {
          const isActive = device.id === activeDeviceId;
          const moisture = device.telemetry.soilMoisture;
          const health: PlantHealthState = device.status.online
            ? moisture < device.config.thresholds.moistureMin
              ? 'thirsty'
              : moisture > device.config.thresholds.moistureMax
              ? 'overwatered'
              : 'healthy'
            : 'unknown';

          return (
            <TouchableOpacity
              key={device.id}
              onPress={() => {
                onSelect(device.id);
                onClose();
              }}
              style={[
                styles.card,
                {
                  backgroundColor: isActive
                    ? colors.palette.forest
                    : colors.palette.white,
                  borderRadius: radii.card,
                  borderColor: isActive
                    ? colors.palette.mint
                    : colors.border,
                  borderWidth: isActive ? 2 : 1.5,
                },
              ]}
              accessibilityLabel={`Switch to ${device.config.plantName}`}
            >
              {/* Status dot */}
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: STATUS_DOTS[health] },
                ]}
              />
              <Text
                style={[
                  styles.cardName,
                  {
                    color: isActive
                      ? colors.palette.white
                      : colors.palette.ink,
                  },
                ]}
                numberOfLines={1}
              >
                {device.config.plantName}
              </Text>
              <Text
                style={[
                  styles.cardMoisture,
                  {
                    color: isActive
                      ? `${colors.palette.lime}`
                      : colors.palette.forest,
                  },
                ]}
              >
                {moisture}%
              </Text>
              {isActive && (
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={colors.palette.mint}
                  style={{ marginTop: 4 }}
                />
              )}
            </TouchableOpacity>
          );
        })}

        {/* + Add plant card */}
        <TouchableOpacity
          onPress={() => {
            onClose();
            router.push('/add-device');
          }}
          style={[
            styles.card,
            styles.addCard,
            {
              backgroundColor: `${colors.palette.lime}50`,
              borderRadius: radii.card,
              borderColor: `${colors.palette.forest}40`,
              borderStyle: 'dashed',
            },
          ]}
          accessibilityLabel="Add a new plant device"
        >
          <Ionicons
            name="add-circle-outline"
            size={24}
            color={colors.palette.forest}
          />
          <Text
            style={[styles.addCardText, { color: colors.palette.forest }]}
          >
            Add plant
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 4,
  },
  card: {
    width: 100,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 4,
  },
  cardName: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardMoisture: {
    fontSize: 18,
    fontWeight: '800',
  },
  addCard: {
    borderWidth: 1.5,
    justifyContent: 'center',
  },
  addCardText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
});
