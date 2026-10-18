import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice } from '@/store/useLiveDevice';

export default function HistoryScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const waterLogs = useLiveDevice((s) => s.waterLogs);
  const [activeTab, setActiveTab] = useState<'24h' | '7d'>('24h');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text }]}>Insights & History</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Moisture balance & pump telemetry logs.
        </Text>

        {/* Time Window Tabs */}
        <View style={[styles.tabBar, { backgroundColor: colors.palette.mist, borderRadius: radii.md }]}>
          <TouchableOpacity
            onPress={() => setActiveTab('24h')}
            style={[
              styles.tabItem,
              {
                backgroundColor: activeTab === '24h' ? colors.palette.forest : 'transparent',
                borderRadius: radii.md - 2,
              },
            ]}
          >
            <Ionicons
              name="time-outline"
              size={14}
              color={activeTab === '24h' ? colors.palette.white : colors.palette.sage}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === '24h' ? colors.palette.white : colors.text },
              ]}
            >
              Past 24 Hours
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('7d')}
            style={[
              styles.tabItem,
              {
                backgroundColor: activeTab === '7d' ? colors.palette.forest : 'transparent',
                borderRadius: radii.md - 2,
              },
            ]}
          >
            <Ionicons
              name="calendar-outline"
              size={14}
              color={activeTab === '7d' ? colors.palette.white : colors.palette.sage}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === '7d' ? colors.palette.white : colors.text },
              ]}
            >
              7-Day Trend
            </Text>
          </TouchableOpacity>
        </View>

        {/* Rule-based Smart Insight Card (spec section 7.5) */}
        <View
          style={[
            styles.insightCard,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              borderColor: colors.palette.lime,
              padding: spacing.md,
            },
          ]}
        >
          <View style={styles.insightHeader}>
            <View style={[styles.insightIconWrap, { backgroundColor: colors.palette.lime }]}>
              <Ionicons name="bulb-outline" size={16} color={colors.palette.forest} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.insightTitle, { color: colors.text }]}>Coastal Smart Guard</Text>
              <Text style={[styles.insightLabel, { color: colors.palette.sage }]}>AI INSIGHT</Text>
            </View>
          </View>
          <Text style={[styles.insightBody, { color: colors.textMuted }]}>
            High coastal humidity (68%) detected yesterday morning. Automatic watering cycle was
            prudently delayed by 40 minutes to prevent root over-saturation and fungal risk.
          </Text>
        </View>

        {/* Quick Stats Row */}
        <View style={styles.statsRow}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: colors.palette.white,
                borderRadius: radii.lg,
                borderColor: colors.palette.lime,
              },
            ]}
          >
            <Text style={[styles.statNumber, { color: colors.palette.forest }]}>
              {waterLogs.length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.palette.sage }]}>Total Events</Text>
          </View>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: colors.palette.white,
                borderRadius: radii.lg,
                borderColor: colors.palette.lime,
              },
            ]}
          >
            <Text style={[styles.statNumber, { color: colors.palette.forest }]}>
              {waterLogs.filter((l) => l.trigger === 'auto').length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.palette.sage }]}>Auto Cycles</Text>
          </View>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: colors.palette.white,
                borderRadius: radii.lg,
                borderColor: colors.palette.lime,
              },
            ]}
          >
            <Text style={[styles.statNumber, { color: colors.palette.forest }]}>
              {waterLogs.filter((l) => l.trigger === 'manual').length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.palette.sage }]}>Manual</Text>
          </View>
        </View>

        {/* Watering Log List */}
        <View style={styles.sectionRow}>
          <View style={styles.sectionTitleGroup}>
            <View style={[styles.sectionDot, { backgroundColor: colors.palette.forest }]} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Watering Logs</Text>
          </View>
          <View style={[styles.eventCountBadge, { backgroundColor: colors.palette.lime, borderRadius: radii.full }]}>
            <Text style={[styles.sectionBadge, { color: colors.palette.forest }]}>
              {waterLogs.length}
            </Text>
          </View>
        </View>

        {waterLogs.map((log, index) => {
          const dateStr = new Date(log.ts).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          const dateDay = new Date(log.ts).toLocaleDateString([], {
            day: 'numeric',
            month: 'short',
          });
          const isLast = index === waterLogs.length - 1;

          return (
            <View key={log.id} style={styles.logRow}>
              {/* Timeline indicator */}
              <View style={styles.timelineCol}>
                <View
                  style={[
                    styles.timelineDot,
                    {
                      backgroundColor: log.trigger === 'auto'
                        ? colors.palette.forest
                        : colors.palette.sage,
                      borderColor: colors.palette.lime,
                    },
                  ]}
                />
                {!isLast && (
                  <View style={[styles.timelineLine, { backgroundColor: colors.palette.lime }]} />
                )}
              </View>

              {/* Log Card */}
              <View
                style={[
                  styles.logCard,
                  {
                    backgroundColor: colors.surface,
                    borderRadius: radii.lg,
                    borderColor: colors.border,
                    padding: spacing.md,
                  },
                ]}
              >
                <View style={styles.logTop}>
                  <View style={styles.logTriggerGroup}>
                    <View
                      style={[
                        styles.triggerTag,
                        {
                          backgroundColor:
                            log.trigger === 'auto'
                              ? colors.palette.lime
                              : colors.palette.blush,
                          borderRadius: 6,
                        },
                      ]}
                    >
                      <Ionicons
                        name={log.trigger === 'auto' ? 'flash' : 'hand-left'}
                        size={10}
                        color={colors.palette.ink}
                        style={{ marginRight: 3 }}
                      />
                      <Text style={[styles.triggerTagText, { color: colors.palette.ink }]}>
                        {log.trigger === 'auto' ? 'AUTO' : 'MANUAL'}
                      </Text>
                    </View>
                    <Text style={[styles.logDuration, { color: colors.text }]}>
                      {log.durationSec}s cycle
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.logTime, { color: colors.text }]}>{dateStr}</Text>
                    <Text style={[styles.logDate, { color: colors.textMuted }]}>{dateDay}</Text>
                  </View>
                </View>

                <View style={styles.moistureChangeRow}>
                  <View style={styles.moistureItem}>
                    <Text style={[styles.moistureLabel, { color: colors.palette.sage }]}>Before</Text>
                    <Text style={[styles.moistureValue, { color: colors.text }]}>{log.moistureBefore}%</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={colors.palette.sage} />
                  <View style={styles.moistureItem}>
                    <Text style={[styles.moistureLabel, { color: colors.palette.sage }]}>After</Text>
                    <Text style={[styles.moistureValue, { color: colors.palette.forest }]}>{log.moistureAfter}%</Text>
                  </View>
                  <View
                    style={[
                      styles.changeBadge,
                      { backgroundColor: colors.palette.lime, borderRadius: radii.sm },
                    ]}
                  >
                    <Text style={[styles.changeText, { color: colors.palette.forest }]}>
                      +{log.moistureAfter - log.moistureBefore}%
                    </Text>
                  </View>
                </View>

                {log.note && (
                  <Text style={[styles.logNote, { color: colors.textMuted }]}>{log.note}</Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    paddingBottom: 100,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: 16,
  },
  tabBar: {
    flexDirection: 'row',
    padding: 4,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  insightCard: {
    borderWidth: 1.5,
    marginBottom: 16,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  insightIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  insightLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  insightBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderWidth: 1,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleGroup: {
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
  eventCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  sectionBadge: {
    fontSize: 12,
    fontWeight: '800',
  },
  logRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  timelineCol: {
    width: 24,
    alignItems: 'center',
    marginRight: 8,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    marginTop: 16,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  logCard: {
    flex: 1,
    borderWidth: 1,
    marginVertical: 4,
  },
  logTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  logTriggerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  triggerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  triggerTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  logDuration: {
    fontSize: 13,
    fontWeight: '700',
  },
  logTime: {
    fontSize: 13,
    fontWeight: '700',
  },
  logDate: {
    fontSize: 11,
    marginTop: 1,
  },
  moistureChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  moistureItem: {
    alignItems: 'center',
  },
  moistureLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  moistureValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  changeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 'auto',
  },
  changeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  logNote: {
    fontSize: 11,
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 15,
  },
});
