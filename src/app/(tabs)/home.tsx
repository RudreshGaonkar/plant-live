import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice } from '@/store/useLiveDevice';
import { usePlantState } from '@/hooks/usePlantState';
import {
  Plant3DPlaceholder,
  MetricTile,
  BottleGauge,
} from '@/components';

export default function HomeScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const { device, health, isWatering, secondsLeft } = usePlantState();
  const triggerWaterNow = useLiveDevice((s) => s.triggerWaterNow);
  const toggleMode = useLiveDevice((s) => s.toggleMode);
  const refillBottle = useLiveDevice((s) => s.refillBottle);

  if (!device) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text }]}>No device connected</Text>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/add-device')}
          >
            <Ionicons name="add" size={18} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={styles.addBtnText}>Add First Plant Device</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { telemetry, config, status } = device;
  const isDigitalLight = config.sensors.lightMode === 'digital';
  const hasLightSensor = config.sensors.lightMode !== 'none';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Bar */}
        <View style={styles.headerBar}>
          <View>
            <Text style={[styles.greeting, { color: colors.textMuted }]}>LeafLink IoT System</Text>
            <Text style={[styles.appTitle, { color: colors.text }]}>{config.name}</Text>
          </View>
          <View style={styles.headerActions}>
            <View
              style={[
                styles.onlineBadge,
                {
                  backgroundColor: status.online
                    ? colors.palette.mint
                    : colors.palette.blush,
                },
              ]}
            >
              <View
                style={[
                  styles.onlineDot,
                  {
                    backgroundColor: status.online
                      ? colors.palette.forest
                      : colors.palette.warningText,
                  },
                ]}
              />
              <Text
                style={[
                  styles.onlineText,
                  {
                    color: status.online
                      ? colors.palette.forest
                      : colors.palette.warningText,
                  },
                ]}
              >
                {status.online ? 'Online' : 'Offline'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/add-device')}
              style={[styles.iconButton, { backgroundColor: colors.surface }]}
            >
              <Ionicons name="add" size={20} color={colors.palette.forest} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero 3D Card */}
        <Plant3DPlaceholder
          health={health}
          isWatering={isWatering}
          secondsLeft={secondsLeft}
          location={config.location}
          plantName={config.plantName}
          plantSpecies={config.plantSpecies}
        />

        {/* Quick Actions Row */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => triggerWaterNow(config.thresholds.pumpDurationSec)}
            disabled={isWatering}
            style={[
              styles.primaryActionBtn,
              {
                backgroundColor: isWatering ? colors.palette.sage : colors.palette.forest,
                borderRadius: radii.xl,
              },
            ]}
          >
            <Ionicons
              name={isWatering ? 'hourglass-outline' : 'water'}
              size={18}
              color="#FFF"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.primaryActionText}>
              {isWatering ? `Watering (${secondsLeft}s)...` : 'Water Now'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={toggleMode}
            style={[
              styles.secondaryActionBtn,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radii.xl,
              },
            ]}
          >
            <Text style={[styles.modeLabel, { color: colors.textMuted }]}>Mode</Text>
            <View style={styles.modeValueRow}>
              <Ionicons
                name={config.mode === 'auto' ? 'flash' : 'hand-left'}
                size={14}
                color={colors.palette.forest}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.modeValue, { color: colors.palette.forest }]}>
                {config.mode === 'auto' ? 'AUTO' : 'MANUAL'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 2x2 Metric Tiles */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Live Telemetry</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
            Synced via ESP8266
          </Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <MetricTile
              label="Soil Moisture"
              value={telemetry.soilMoisture}
              unit="%"
              iconName="leaf-outline"
              subtitle={`Target: ${config.thresholds.moistureMin}% - ${config.thresholds.moistureMax}%`}
              status={
                telemetry.soilMoisture < config.thresholds.moistureMin
                  ? 'warning'
                  : 'normal'
              }
            />
            <MetricTile
              label="Temperature"
              value={telemetry.temperature}
              unit="°C"
              iconName="thermometer-outline"
              subtitle="DHT11 Sensor"
              status={telemetry.temperature > config.thresholds.tempMax ? 'alert' : 'normal'}
            />
          </View>

          <View style={styles.gridRow}>
            <MetricTile
              label="Humidity"
              value={telemetry.humidity}
              unit="%"
              iconName="water-outline"
              subtitle="Relative Humidity"
            />
            {hasLightSensor ? (
              <MetricTile
                label="Sunlight"
                value={isDigitalLight ? (telemetry.light === 1 ? 'Bright' : 'Dim') : `${telemetry.light || 0}%`}
                iconName="sunny-outline"
                subtitle={isDigitalLight ? 'Digital LDR Pin' : 'Analog LDR'}
              />
            ) : (
              <MetricTile
                label="Sunlight"
                value="No Sensor"
                iconName="close-circle-outline"
                subtitle="Sensor Not Fitted"
              />
            )}
          </View>
        </View>

        {/* Water Reservoir Bottle Gauge */}
        <View style={{ marginTop: 12 }}>
          <BottleGauge
            remainingMl={config.bottle.remainingMl}
            capacityMl={config.bottle.capacityMl}
            flowMlPerSec={config.bottle.flowMlPerSec}
            onRefill={refillBottle}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 90,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  onlineText: {
    fontSize: 11,
    fontWeight: '700',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(90, 138, 92, 0.2)',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 6,
  },
  primaryActionBtn: {
    flex: 1.8,
    flexDirection: 'row',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flex: 1.2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  modeLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  modeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  modeValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 14,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  grid: {
    marginHorizontal: -4,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addBtnText: {
    color: '#FFF',
    fontWeight: '700',
  },
});
