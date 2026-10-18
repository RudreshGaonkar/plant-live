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
        <View style={styles.tabBar}>
          <TouchableOpacity
            onPress={() => setActiveTab('24h')}
            style={[
              styles.tabItem,
              {
                backgroundColor: activeTab === '24h' ? colors.palette.forest : 'transparent',
                borderRadius: radii.md,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === '24h' ? '#FFF' : colors.text },
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
                borderRadius: radii.md,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === '7d' ? '#FFF' : colors.text },
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
              borderColor: colors.border,
              padding: spacing.md,
            },
          ]}
        >
          <View style={styles.insightHeader}>
            <Ionicons name="bulb-outline" size={18} color={colors.palette.forest} />
            <Text style={[styles.insightTitle, { color: colors.text }]}>Coastal Smart Guard</Text>
          </View>
          <Text style={[styles.insightBody, { color: colors.textMuted }]}>
            High coastal humidity (68%) detected yesterday morning. Automatic watering cycle was
            prudently delayed by 40 minutes to prevent root over-saturation and fungal risk.
          </Text>
        </View>

        {/* Watering Log List */}
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Watering Logs</Text>
          <Text style={[styles.sectionBadge, { color: colors.palette.forest }]}>
            {waterLogs.length} events
          </Text>
        </View>

        {waterLogs.map((log) => {
          const dateStr = new Date(log.ts).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <View
              key={log.id}
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
                      },
                    ]}
                  >
                    <Ionicons
                      name={log.trigger === 'auto' ? 'flash' : 'hand-left'}
                      size={10}
                      color="#1F2A21"
                      style={{ marginRight: 3 }}
                    />
                    <Text style={styles.triggerTagText}>
                      {log.trigger === 'auto' ? 'AUTO' : 'MANUAL'}
                    </Text>
                  </View>
                  <Text style={[styles.logDuration, { color: colors.text }]}>
                    {log.durationSec}s cycle
                  </Text>
                </View>
                <Text style={[styles.logTime, { color: colors.textMuted }]}>{dateStr}</Text>
              </View>

              <View style={styles.moistureChangeRow}>
                <Text style={[styles.moistureText, { color: colors.text }]}>
                  Moisture: {log.moistureBefore}% →{' '}
                  <Text style={{ color: colors.palette.forest, fontWeight: '800' }}>
                    {log.moistureAfter}%
                  </Text>
                </Text>
              </View>

              {log.note && (
                <Text style={[styles.logNote, { color: colors.textMuted }]}>{log.note}</Text>
              )}
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
    paddingBottom: 90,
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
    backgroundColor: '#E7EFE6',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
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
    gap: 8,
    marginBottom: 6,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  insightBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionBadge: {
    fontSize: 12,
    fontWeight: '700',
  },
  logCard: {
    borderWidth: 1,
    marginVertical: 5,
  },
  logTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
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
    borderRadius: 6,
  },
  triggerTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1F2A21',
  },
  logDuration: {
    fontSize: 13,
    fontWeight: '700',
  },
  logTime: {
    fontSize: 12,
  },
  moistureChangeRow: {
    marginVertical: 2,
  },
  moistureText: {
    fontSize: 13,
  },
  logNote: {
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
});
