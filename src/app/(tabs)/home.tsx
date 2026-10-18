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
          <View
            style={[
              styles.emptyIconWrap,
              { backgroundColor: colors.palette.lime },
            ]}
          >
            <Ionicons name="leaf-outline" size={48} color={colors.palette.forest} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Device Connected</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            Pair your ESP8266 plant companion to start monitoring
          </Text>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: radii.xl }]}
            onPress={() => router.push('/add-device')}
          >
            <Ionicons name="add" size={18} color={colors.palette.white} style={{ marginRight: 6 }} />
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
                  borderRadius: radii.full,
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
              style={[
                styles.iconButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
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
              color={colors.palette.white}
              style={{ marginRight: 8 }}
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
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionDot, { backgroundColor: colors.palette.forest }]} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Live Telemetry</Text>
          </View>
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
        <View style={{ marginTop: 8 }}>
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
    paddingBottom: 100,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  greeting: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  onlineText: {
    fontSize: 11,
    fontWeight: '700',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 6,
  },
  primaryActionBtn: {
    flex: 1.8,
    flexDirection: 'row',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flex: 1.2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  modeLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  modeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  modeValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 11,
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
    padding: 32,
  },
  emptyIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  addBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
