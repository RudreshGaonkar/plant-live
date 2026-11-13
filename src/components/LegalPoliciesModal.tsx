import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';

export type LegalPolicyType = 'terms' | 'privacy';

export interface LegalPoliciesModalProps {
  visible: boolean;
  type: LegalPolicyType;
  onClose: () => void;
}

export function LegalPoliciesModal({ visible, type, onClose }: LegalPoliciesModalProps) {
  const { colors, radii, spacing } = useAppTheme();
  const isPrivacy = type === 'privacy';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <Ionicons
              name={isPrivacy ? 'shield-checkmark-outline' : 'document-text-outline'}
              size={22}
              color={colors.palette.forest}
            />
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {isPrivacy ? 'Privacy Policy' : 'Terms & Conditions'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: colors.palette.mist, borderRadius: radii.full }]}
            accessibilityLabel="Close policy"
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { padding: spacing.lg }]}
          showsVerticalScrollIndicator={true}
        >
          {isPrivacy ? (
            <>
              <Text style={[styles.effectiveDate, { color: colors.textMuted }]}>
                Effective Date: November 2026 · LeafLink Plant-Watering System
              </Text>

              <Text style={[styles.leadText, { color: colors.text }]}>
                LeafLink is committed to protecting your privacy and ensuring transparent handling of your data. This policy outlines how sensor telemetry, weather location data, and device tokens are processed.
              </Text>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.palette.forest }]}>
                  1. Sensor Telemetry & Controller Data
                </Text>
                <Text style={[styles.bodyText, { color: colors.text }]}>
                  When you pair a LeafLink controller (ESP8266 / NodeMCU), the device transmits sensor telemetry including soil moisture percentage, ambient air temperature, relative humidity, light sensor (LDR) status, and pump runtime metrics. This data is securely stored in your private Firebase Realtime Database tenant and used solely to visualize plant vitals and drive automated irrigation.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.palette.forest }]}>
                  2. Open-Meteo Weather & Location Usage
                </Text>
                <Text style={[styles.bodyText, { color: colors.text }]}>
                  To enable smart terrace rain delays and outdoor microclimate protection, the app fetches forecast data from the Open-Meteo API using coarse device coordinates. If location permissions are denied, LeafLink defaults to fallback coordinates (Goa, India). Your location is never tracked continuously, sold, or shared with third-party advertisers.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.palette.forest }]}>
                  3. Push Notification Tokens
                </Text>
                <Text style={[styles.bodyText, { color: colors.text }]}>
                  Expo Push Tokens are stored under your authenticated account profile (`users/{"{uid}"}/pushTokens`). These tokens are strictly used to deliver critical notifications, such as empty water reservoirs, extreme heat alerts, and offline controller sweeps.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.palette.forest }]}>
                  4. Data Retention & Pruning
                </Text>
                <Text style={[styles.bodyText, { color: colors.text }]}>
                  Active unresolved alerts remain in your alert feed until acknowledged. Resolved alerts are automatically pruned after a 7-day retention period. Historical telemetry snapshots are capped to avoid unbounded data storage.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.palette.forest }]}>
                  5. Account & Data Deletion
                </Text>
                <Text style={[styles.bodyText, { color: colors.text }]}>
                  You have the right to delete your account and all associated data at any time. Triggering &quot;Delete Account&quot; in Settings permanently unlinks all paired devices, purges your user profile, alert logs, and push tokens from the database, and deletes your Firebase Authentication record.
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.effectiveDate, { color: colors.textMuted }]}>
                Last Updated: November 2026 · LeafLink Plant-Watering System
              </Text>

              <Text style={[styles.leadText, { color: colors.text }]}>
                Please review these Terms & Conditions before using LeafLink. By creating an account or pairing a LeafLink device, you agree to these terms.
              </Text>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.palette.forest }]}>
                  1. Scope of Service & Hardware Operation
                </Text>
                <Text style={[styles.bodyText, { color: colors.text }]}>
                  LeafLink provides automated plant-watering monitoring and cloud controller interfaces. Manual watering commands and automatic scheduled cycles are executed by hardware relays. Safe operation requires proper soil sensor calibration and adequate reservoir water levels.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.palette.forest }]}>
                  2. Safety Failsafes & Hardware Caps
                </Text>
                <Text style={[styles.bodyText, { color: colors.text }]}>
                  The LeafLink firmware implements hardware-level safety caps: maximum pump runtimes are restricted to 15 seconds per cycle, and a 60-second cooldown is enforced between manual actuations. Commands older than 30 seconds are rejected (`STALE_COMMAND_EXPIRED`) to prevent delayed execution after network disconnects.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.palette.forest }]}>
                  3. User Responsibilities
                </Text>
                <Text style={[styles.bodyText, { color: colors.text }]}>
                  Users are responsible for maintaining hardware power, plumbing connections, and ensuring submersible pumps are submerged in liquid before activation. LeafLink is not liable for plant damage resulting from pump run-dry conditions, empty reservoirs, or improper sensor calibration.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.palette.forest }]}>
                  4. Intellectual Property & Firmware
                </Text>
                <Text style={[styles.bodyText, { color: colors.text }]}>
                  The LeafLink mobile application, firmware contracts, and design systems are protected by copyright. Firmware credentials and access tokens must remain secure.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.palette.forest }]}>
                  5. Termination & Modification
                </Text>
                <Text style={[styles.bodyText, { color: colors.text }]}>
                  We reserve the right to modify these terms. You may terminate your agreement at any time by deleting your account through the Settings screen.
                </Text>
              </View>
            </>
          )}

          <TouchableOpacity
            onPress={onClose}
            style={[styles.doneBtn, { backgroundColor: colors.palette.forest, borderRadius: radii.md }]}
          >
            <Text style={[styles.doneBtnText, { color: colors.palette.white }]}>
              I Understand
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingBottom: 40,
  },
  effectiveDate: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 12,
  },
  leadText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.9,
  },
  doneBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 20,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
