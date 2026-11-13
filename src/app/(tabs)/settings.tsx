/**
 * Settings Screen – "Plant Passport & Account Settings"
 * Production-ready UI with local avatar picker, inline user info editing,
 * plant passport thresholds, and clean collapsible accordion secondary options.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Image,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '@/theme';
import { useLiveDevice, LightMode } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import { updateDeviceConfigInRTDB, removeDeviceWithAudit } from '@/services/devices';
import {
  PlantPassportHeader,
  SliderControl,
  CalibrationWizard,
  CalibrationValues,
} from '@/components';

export default function SettingsScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const {
    user,
    signOut,
    setAvatarUri,
    updateUserDisplayName,
    updateUserPassword,
  } = useSession();

  // Store bindings
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const updateThresholds = useLiveDevice((s) => s.updateThresholds);
  const updateSensors = useLiveDevice((s) => s.updateSensors);
  const updateConfig = useLiveDevice((s) => s.updateConfig);
  const updateCalibration = useLiveDevice((s) => s.updateCalibration);
  const refillBottle = useLiveDevice((s) => s.refillBottle);

  // Calibration Wizard modal state
  const [calibrationModalOpen, setCalibrationModalOpen] = useState<boolean>(false);
  const [isRefilling, setIsRefilling] = useState<boolean>(false);
  const [isRemovingDevice, setIsRemovingDevice] = useState<boolean>(false);

  // User Profile Form States
  const [displayNameDraft, setDisplayNameDraft] = useState<string | null>(null);
  const displayNameInput = displayNameDraft ?? (user?.displayName || '');
  const [isUpdatingName, setIsUpdatingName] = useState<boolean>(false);
  const [isPickingAvatar, setIsPickingAvatar] = useState<boolean>(false);

  // Change Password Modal States
  const [passwordModalOpen, setPasswordModalOpen] = useState<boolean>(false);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState<boolean>(false);

  // Temperature unit preference
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');

  // Alert Category Toggles
  const [alerts, setAlerts] = useState({
    bottle: true,
    dry: true,
    wet: true,
    heat: true,
    offline: true,
  });
  const [quietHoursEnabled, setQuietHoursEnabled] = useState<boolean>(false);
  const quietHoursRange = '22:00 - 07:00';

  // Collapsible Accordion Sections State (Secondary Options)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    alerts: false,
    deviceInfo: false,
    firmware: false,
    security: false,
  });

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  // Avatar Image Picker Handler
  const handlePickAvatar = async () => {
    try {
      setIsPickingAvatar(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Camera roll access is needed to select a profile avatar photo.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const pickedUri = result.assets[0].uri;
        await setAvatarUri(pickedUri);
        Alert.alert('Avatar Updated', 'Your profile avatar has been saved locally on your device.');
      }
    } catch (err: any) {
      console.warn('[Settings] Failed to pick avatar:', err);
      Alert.alert('Image Selection Failed', err?.message || 'Could not select photo.');
    } finally {
      setIsPickingAvatar(false);
    }
  };

  // Display Name Update Handler
  const handleSaveDisplayName = async () => {
    const trimmed = displayNameInput.trim();
    if (!trimmed) {
      Alert.alert('Invalid Name', 'Display name cannot be empty.');
      return;
    }
    if (trimmed === user?.displayName) {
      return;
    }

    try {
      setIsUpdatingName(true);
      await updateUserDisplayName(trimmed);
      setDisplayNameDraft(null);
      Alert.alert('Profile Saved', 'Your display name has been updated successfully.');
    } catch (err: any) {
      console.warn('[Settings] Display name update error:', err);
      Alert.alert('Update Failed', err?.message || 'Failed to update display name.');
    } finally {
      setIsUpdatingName(false);
    }
  };

  // Password Update Handler
  const handleSavePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Invalid Password', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirmation password do not match.');
      return;
    }

    try {
      setIsUpdatingPassword(true);
      await updateUserPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordModalOpen(false);
      Alert.alert('Password Changed', 'Your account password has been updated securely.');
    } catch (err: any) {
      console.warn('[Settings] Password update error:', err);
      if (err?.code === 'auth/requires-recent-login') {
        Alert.alert(
          'Re-authentication Required',
          'For security reasons, please log out and sign back in before modifying your password.'
        );
      } else {
        Alert.alert('Update Failed', err?.message || 'Failed to change password.');
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleRemoveDevice = () => {
    if (!device || !user?.uid) return;
    const plantName = device.config.plantName || device.config.name || 'Plant';
    const deviceId = device.id;

    Alert.alert(
      'Remove Device',
      `Are you sure you want to remove ${plantName} (${deviceId})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsRemovingDevice(true);
              const result = await removeDeviceWithAudit(
                user.uid,
                user.email,
                deviceId,
                plantName
              );
              Alert.alert('Device Removed', `${plantName} (${deviceId}) was successfully removed.`);
              if (!result.nextDeviceId) {
                router.replace('/add-device');
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to remove device.');
            } finally {
              setIsRemovingDevice(false);
            }
          },
        },
      ]
    );
  };

  const handleCalibrationComplete = (values: CalibrationValues) => {
    updateCalibration(values);
    setCalibrationModalOpen(false);
    Alert.alert(
      'Calibration Saved',
      `Soil sensor calibrated!\nDry Air Raw: ${values.soilDryRaw}\nWet Water Raw: ${values.soilWetRaw}`
    );
  };

  if (!device) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.emptyContainer}>
          <Ionicons name="leaf-outline" size={48} color={colors.palette.sage} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Active Plant Device</Text>
          <TouchableOpacity
            onPress={() => router.push('/add-device' as any)}
            style={[styles.primaryBtn, { backgroundColor: colors.palette.forest, borderRadius: radii.md }]}
          >
            <Ionicons name="add" size={18} color={colors.palette.white} />
            <Text style={[styles.primaryBtnText, { color: colors.palette.white }]}>Add Device</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { config, status, telemetry } = device;
  const isNameChanged = displayNameInput.trim() !== (user?.displayName || '');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Page Title & Subtitle */}
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Settings</Text>
          <Text style={[styles.screenSubtitle, { color: colors.textMuted }]}>
            Profile, plant passport & hardware preferences · ID: {device.id}
          </Text>
        </View>

        {/* ── 1. USER PROFILE & ACCOUNT CARD ──────────────────────────── */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.profileHeaderRow}>
            {/* Avatar with Camera Overlay */}
            <View style={styles.avatarWrapper}>
              <TouchableOpacity
                onPress={handlePickAvatar}
                activeOpacity={0.8}
                style={[
                  styles.avatarContainer,
                  {
                    backgroundColor: colors.palette.mist,
                    borderColor: colors.palette.forest,
                  },
                ]}
                accessibilityLabel="Change profile avatar"
              >
                {user?.avatarUri ? (
                  <Image source={{ uri: user.avatarUri }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={36} color={colors.palette.forest} />
                )}
                {isPickingAvatar && (
                  <View style={styles.avatarLoadingOverlay}>
                    <ActivityIndicator size="small" color={colors.palette.white} />
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handlePickAvatar}
                style={[
                  styles.cameraBadge,
                  { backgroundColor: colors.palette.forest, borderColor: colors.surface },
                ]}
                accessibilityLabel="Choose photo"
              >
                <Ionicons name="camera" size={13} color={colors.palette.white} />
              </TouchableOpacity>
            </View>

            {/* Email and Quick Avatar Prompt */}
            <View style={styles.profileInfoWrap}>
              <Text style={[styles.profileEmail, { color: colors.text }]} numberOfLines={1}>
                {user?.email || 'Plant Parent'}
              </Text>
              <TouchableOpacity onPress={handlePickAvatar} style={styles.changePhotoBtn}>
                <Ionicons name="image-outline" size={14} color={colors.palette.forest} />
                <Text style={[styles.changePhotoText, { color: colors.palette.forest }]}>
                  {user?.avatarUri ? 'Change Avatar' : 'Set Profile Avatar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Inline Display Name Editor */}
          <View style={styles.inputSection}>
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Display Name</Text>
            <View style={styles.inputWithActionRow}>
              <TextInput
                value={displayNameInput}
                onChangeText={setDisplayNameDraft}
                placeholder="Enter your name"
                placeholderTextColor={colors.palette.sage}
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.palette.mist,
                    borderColor: isNameChanged ? colors.palette.forest : colors.border,
                    color: colors.text,
                    borderRadius: radii.sm,
                  },
                ]}
              />
              {isNameChanged && (
                <TouchableOpacity
                  onPress={handleSaveDisplayName}
                  disabled={isUpdatingName}
                  style={[
                    styles.saveNameBtn,
                    {
                      backgroundColor: colors.palette.forest,
                      borderRadius: radii.sm,
                    },
                  ]}
                >
                  {isUpdatingName ? (
                    <ActivityIndicator size="small" color={colors.palette.white} />
                  ) : (
                    <Text style={[styles.saveNameBtnText, { color: colors.palette.white }]}>
                      Save
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Change Password Trigger */}
          <TouchableOpacity
            onPress={() => setPasswordModalOpen(true)}
            style={[
              styles.passwordRowBtn,
              { backgroundColor: colors.palette.mist, borderRadius: radii.sm },
            ]}
          >
            <View style={styles.rowCentered}>
              <Ionicons name="key-outline" size={16} color={colors.palette.forest} />
              <Text style={[styles.passwordRowBtnText, { color: colors.palette.ink }]}>
                Change Account Password
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.palette.sage} />
          </TouchableOpacity>
        </View>

        {/* ── 2. PLANT PASSPORT HEADER CARD ──────────────────────────── */}
        <PlantPassportHeader
          deviceId={device.id}
          config={config}
          status={status}
          telemetry={telemetry}
        />

        {/* ── 3. CORE WATERING THRESHOLDS CARD ───────────────────────── */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconPill, { backgroundColor: colors.palette.mint }]}>
              <Ionicons name="water-outline" size={18} color={colors.palette.forest} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Watering & Soil Moisture</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                Automated irrigation bounds & pump timing
              </Text>
            </View>
          </View>

          {/* Moisture Min Slider */}
          <SliderControl
            label="Moisture Threshold Min"
            description="Triggers auto-watering when soil drops below this %"
            value={config.thresholds.moistureMin}
            min={10}
            max={50}
            step={5}
            unit="%"
            accentColor={colors.palette.warningBorder}
            onChange={(val) => updateThresholds({ moistureMin: val })}
          />

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Moisture Max Slider */}
          <SliderControl
            label="Moisture Threshold Max"
            description="Target soil saturation limit for irrigation shut-off"
            value={config.thresholds.moistureMax}
            min={50}
            max={90}
            step={5}
            unit="%"
            accentColor={colors.palette.forest}
            onChange={(val) => updateThresholds({ moistureMax: val })}
          />

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Pump Duration Slider */}
          <SliderControl
            label="Auto Pump Duration"
            description="Run-time per automatic irrigation cycle (max 15s)"
            value={config.thresholds.pumpDurationSec}
            min={1}
            max={15}
            step={1}
            unit="s"
            accentColor={colors.palette.sage}
            onChange={(val) => updateThresholds({ pumpDurationSec: val })}
          />
        </View>

        {/* ── 4. SENSORS & RESERVOIR CARD ────────────────────────────── */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconPill, { backgroundColor: colors.palette.lime }]}>
              <Ionicons name="hardware-chip-outline" size={18} color={colors.palette.forest} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Sensors & Reservoir</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                Soil calibration, reservoir capacity & refill
              </Text>
            </View>
          </View>

          {/* Light Sensor Mode */}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>Light Sensor (LDR)</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Sunlight mode ({config.sensors.lightMode})
              </Text>
            </View>
            <View style={styles.pillSelectorRow}>
              {(['none', 'digital', 'analog'] as LightMode[]).map((mode) => {
                const isSelected = config.sensors.lightMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => updateSensors({ lightMode: mode })}
                    style={[
                      styles.modePill,
                      {
                        backgroundColor: isSelected ? colors.palette.forest : colors.palette.mist,
                        borderColor: isSelected ? colors.palette.forest : colors.border,
                        borderRadius: radii.sm,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modePillText,
                        { color: isSelected ? colors.palette.white : colors.palette.ink },
                      ]}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Soil Calibration Wizard Trigger */}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>Soil Sensor Calibration</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Dry: {config.calibration.soilDryRaw} | Wet: {config.calibration.soilWetRaw}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setCalibrationModalOpen(true)}
              style={[
                styles.actionBtnOutline,
                { borderColor: colors.palette.forest, borderRadius: radii.sm },
              ]}
            >
              <Ionicons name="speedometer-outline" size={14} color={colors.palette.forest} />
              <Text style={[styles.actionBtnText, { color: colors.palette.forest }]}>
                Calibrate
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Reservoir Capacity */}
          <SliderControl
            label="Bottle Capacity"
            description="Volume of reservoir attached to the plant node"
            value={config.bottle.capacityMl}
            min={250}
            max={2000}
            step={50}
            unit=" ml"
            accentColor={colors.palette.forest}
            onChange={(val) => {
              updateConfig({
                bottleCapacityMl: val,
                bottle: {
                  ...config.bottle,
                  capacityMl: val,
                },
              }, device?.id);
              if (device?.id) {
                updateDeviceConfigInRTDB(device.id, {
                  bottleCapacityMl: val,
                  'bottle/capacityMl': val,
                } as any).catch((err) => console.warn('[settings] Failed to persist bottle capacity to RTDB:', err));
              }
            }}
          />

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Pump Flow Rate */}
          <SliderControl
            label="Pump Flow Rate"
            description="Calibration flow rate measured during bottle pump test"
            value={config.bottle.flowMlPerSec}
            min={5}
            max={30}
            step={1}
            unit=" ml/s"
            accentColor={colors.palette.sage}
            onChange={(val) => {
              updateConfig({
                bottle: {
                  ...config.bottle,
                  flowMlPerSec: val,
                },
              }, device?.id);
              if (device?.id) {
                updateDeviceConfigInRTDB(device.id, {
                  'bottle/flowMlPerSec': val,
                } as any).catch((err) => console.warn('[settings] Failed to persist flow rate to RTDB:', err));
              }
            }}
          />

          {/* Shortcut refill button */}
          <TouchableOpacity
            disabled={isRefilling}
            onPress={async () => {
              setIsRefilling(true);
              try {
                const confirmed = await refillBottle(device?.id);
                if (confirmed) {
                  Alert.alert('Reservoir Refilled', `Reset bottle level to ${config.bottle.capacityMl} ml.`);
                } else {
                  Alert.alert(
                    'Refill Pending',
                    'Waiting for device acknowledgement. Please check hardware connection.'
                  );
                }
              } catch (err: any) {
                Alert.alert('Refill Error', err?.message || 'Failed to dispatch refill command.');
              } finally {
                setIsRefilling(false);
              }
            }}
            style={[
              styles.refillRowBtn,
              { backgroundColor: colors.palette.lime, borderRadius: radii.sm, opacity: isRefilling ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="refresh" size={15} color={colors.palette.forest} />
            <Text style={[styles.refillRowText, { color: colors.palette.forest }]}>
              {isRefilling
                ? 'Confirming Refill with Device...'
                : `Mark Bottle as Refilled (${config.bottle.remainingMl} / ${config.bottle.capacityMl} ml)`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 5. SECONDARY OPTIONS ACCORDION (COLLAPSIBLE GROUPING) ──── */}
        <View style={styles.accordionGroupWrap}>
          <View style={styles.accordionHeaderTitleWrap}>
            <Ionicons name="layers-outline" size={18} color={colors.palette.forest} />
            <Text style={[styles.accordionSectionTitle, { color: colors.text }]}>
              Advanced & Secondary Preferences
            </Text>
          </View>

          {/* ACCORDION 1: Notifications & Alerts */}
          <View
            style={[
              styles.accordionCard,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.card,
                borderColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => toggleSection('alerts')}
              style={styles.accordionTitleRow}
              activeOpacity={0.7}
            >
              <View style={styles.rowCentered}>
                <View style={[styles.iconPillSm, { backgroundColor: colors.palette.blush }]}>
                  <Ionicons name="notifications-outline" size={16} color={colors.palette.warningText} />
                </View>
                <View>
                  <Text style={[styles.accordionItemTitle, { color: colors.text }]}>
                    Alerts & Push Notifications
                  </Text>
                  <Text style={[styles.accordionItemSubtitle, { color: colors.textMuted }]}>
                    Threshold warnings & quiet hours
                  </Text>
                </View>
              </View>
              <Ionicons
                name={expandedSections.alerts ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.palette.sage}
              />
            </TouchableOpacity>

            {expandedSections.alerts && (
              <View style={styles.accordionBody}>
                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                {/* Bottle Low / Empty */}
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemLabel, { color: colors.text }]}>Reservoir Low / Empty</Text>
                    <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                      Alert when bottle level drops below 20%
                    </Text>
                  </View>
                  <Switch
                    value={alerts.bottle}
                    onValueChange={(val) => setAlerts((prev) => ({ ...prev, bottle: val }))}
                    trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
                    thumbColor={colors.palette.white}
                  />
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                {/* Dry Soil */}
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemLabel, { color: colors.text }]}>Dry Soil Warning</Text>
                    <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                      Alert if moisture stays under min threshold
                    </Text>
                  </View>
                  <Switch
                    value={alerts.dry}
                    onValueChange={(val) => setAlerts((prev) => ({ ...prev, dry: val }))}
                    trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
                    thumbColor={colors.palette.white}
                  />
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                {/* Overwatered Risk */}
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemLabel, { color: colors.text }]}>Over-watering Risk</Text>
                    <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                      Alert if soil moisture exceeds max cap with high humidity
                    </Text>
                  </View>
                  <Switch
                    value={alerts.wet}
                    onValueChange={(val) => setAlerts((prev) => ({ ...prev, wet: val }))}
                    trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
                    thumbColor={colors.palette.white}
                  />
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                {/* Extreme Heat */}
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemLabel, { color: colors.text }]}>Extreme Heat & Weather</Text>
                    <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                      Alert if temperature exceeds {config.thresholds.tempMax}°C
                    </Text>
                  </View>
                  <Switch
                    value={alerts.heat}
                    onValueChange={(val) => setAlerts((prev) => ({ ...prev, heat: val }))}
                    trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
                    thumbColor={colors.palette.white}
                  />
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                {/* Device Offline */}
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemLabel, { color: colors.text }]}>Device Offline</Text>
                    <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                      Alert if no telemetry signal received for &gt; 3 mins
                    </Text>
                  </View>
                  <Switch
                    value={alerts.offline}
                    onValueChange={(val) => setAlerts((prev) => ({ ...prev, offline: val }))}
                    trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
                    thumbColor={colors.palette.white}
                  />
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                {/* Quiet Hours Picker */}
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemLabel, { color: colors.text }]}>Quiet Hours</Text>
                    <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                      Silence notifications during night ({quietHoursRange})
                    </Text>
                  </View>
                  <Switch
                    value={quietHoursEnabled}
                    onValueChange={setQuietHoursEnabled}
                    trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
                    thumbColor={colors.palette.white}
                  />
                </View>
              </View>
            )}
          </View>

          {/* ACCORDION 2: Device Information & Network */}
          <View
            style={[
              styles.accordionCard,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.card,
                borderColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => toggleSection('deviceInfo')}
              style={styles.accordionTitleRow}
              activeOpacity={0.7}
            >
              <View style={styles.rowCentered}>
                <View style={[styles.iconPillSm, { backgroundColor: colors.palette.mist }]}>
                  <Ionicons name="wifi-outline" size={16} color={colors.palette.forest} />
                </View>
                <View>
                  <Text style={[styles.accordionItemTitle, { color: colors.text }]}>
                    Device & Network Information
                  </Text>
                  <Text style={[styles.accordionItemSubtitle, { color: colors.textMuted }]}>
                    Hardware ID, Wi-Fi pairing & unpair
                  </Text>
                </View>
              </View>
              <Ionicons
                name={expandedSections.deviceInfo ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.palette.sage}
              />
            </TouchableOpacity>

            {expandedSections.deviceInfo && (
              <View style={styles.accordionBody}>
                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                <View style={styles.rowBetween}>
                  <Text style={[styles.itemLabel, { color: colors.textMuted }]}>Hardware ID</Text>
                  <View
                    style={[
                      styles.monoBadge,
                      { backgroundColor: colors.palette.mist, borderRadius: radii.sm },
                    ]}
                  >
                    <Text style={[styles.monoText, { color: colors.palette.forest }]}>
                      {device.id}
                    </Text>
                  </View>
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                <View style={styles.rowBetween}>
                  <Text style={[styles.itemLabel, { color: colors.textMuted }]}>Paired Plant Name</Text>
                  <Text style={[styles.itemLabel, { color: colors.text }]}>
                    {config.plantName || 'Monstera'}
                  </Text>
                </View>

                {/* Action: Re-pair Device */}
                <TouchableOpacity
                  onPress={() => router.push('/add-device' as any)}
                  style={[
                    styles.actionBtnOutlineFull,
                    { borderColor: colors.palette.forest, borderRadius: radii.sm, marginTop: 12 },
                  ]}
                >
                  <Ionicons name="sync-outline" size={16} color={colors.palette.forest} />
                  <Text style={[styles.actionBtnText, { color: colors.palette.forest }]}>
                    Re-pair Device / Wi-Fi Setup
                  </Text>
                </TouchableOpacity>

                {/* Action: Remove / Unpair Device */}
                <TouchableOpacity
                  testID="remove-device-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Remove or unpair this plant device"
                  onPress={handleRemoveDevice}
                  disabled={isRemovingDevice}
                  style={[
                    styles.actionBtnOutlineFull,
                    {
                      borderColor: colors.palette.critical,
                      backgroundColor: 'rgba(235, 87, 87, 0.12)',
                      borderRadius: radii.sm,
                      marginTop: 10,
                      paddingVertical: 12,
                    },
                  ]}
                >
                  {isRemovingDevice ? (
                    <ActivityIndicator size="small" color={colors.palette.critical} />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={16} color={colors.palette.critical} />
                      <Text
                        style={[
                          styles.actionBtnText,
                          { color: colors.palette.critical, fontWeight: '700' },
                        ]}
                      >
                        Remove / Unpair Device
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ACCORDION 3: Firmware Details & Diagnostics */}
          <View
            style={[
              styles.accordionCard,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.card,
                borderColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => toggleSection('firmware')}
              style={styles.accordionTitleRow}
              activeOpacity={0.7}
            >
              <View style={styles.rowCentered}>
                <View style={[styles.iconPillSm, { backgroundColor: colors.palette.mist }]}>
                  <Ionicons name="code-slash-outline" size={16} color={colors.palette.forest} />
                </View>
                <View>
                  <Text style={[styles.accordionItemTitle, { color: colors.text }]}>
                    Firmware & Diagnostics
                  </Text>
                  <Text style={[styles.accordionItemSubtitle, { color: colors.textMuted }]}>
                    Microcontroller architecture & signal stats
                  </Text>
                </View>
              </View>
              <Ionicons
                name={expandedSections.firmware ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.palette.sage}
              />
            </TouchableOpacity>

            {expandedSections.firmware && (
              <View style={styles.accordionBody}>
                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                <View style={styles.rowBetween}>
                  <Text style={[styles.infoFieldLabel, { color: colors.textMuted }]}>Firmware Version</Text>
                  <Text style={[styles.infoFieldValue, { color: colors.text }]}>
                    {status.firmware || 'LeafLink Core v1.0.4 (ESP8266)'}
                  </Text>
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                <View style={styles.rowBetween}>
                  <Text style={[styles.infoFieldLabel, { color: colors.textMuted }]}>Microcontroller</Text>
                  <Text style={[styles.infoFieldValue, { color: colors.text }]}>
                    NodeMCU / ESP-12E (80 MHz)
                  </Text>
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                <View style={styles.rowBetween}>
                  <Text style={[styles.infoFieldLabel, { color: colors.textMuted }]}>Wi-Fi RSSI Signal</Text>
                  <Text style={[styles.infoFieldValue, { color: colors.text }]}>
                    {telemetry.rssi ? `${telemetry.rssi} dBm` : '-60 dBm (Good)'}
                  </Text>
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                <View style={styles.rowBetween}>
                  <Text style={[styles.infoFieldLabel, { color: colors.textMuted }]}>ADC Span (Air / Water)</Text>
                  <Text style={[styles.infoFieldValue, { color: colors.text }]}>
                    {config.calibration.soilDryRaw} - {config.calibration.soilWetRaw}
                  </Text>
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                <View style={styles.rowBetween}>
                  <Text style={[styles.infoFieldLabel, { color: colors.textMuted }]}>Telemetry Protocol</Text>
                  <Text style={[styles.infoFieldValue, { color: colors.text }]}>
                    Firebase Realtime Database (RTDB)
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* ACCORDION 4: Account Security & Session */}
          <View
            style={[
              styles.accordionCard,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.card,
                borderColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => toggleSection('security')}
              style={styles.accordionTitleRow}
              activeOpacity={0.7}
            >
              <View style={styles.rowCentered}>
                <View style={[styles.iconPillSm, { backgroundColor: colors.palette.blush }]}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.palette.forest} />
                </View>
                <View>
                  <Text style={[styles.accordionItemTitle, { color: colors.text }]}>
                    Account Security & Units
                  </Text>
                  <Text style={[styles.accordionItemSubtitle, { color: colors.textMuted }]}>
                    Password management, units & sign out
                  </Text>
                </View>
              </View>
              <Ionicons
                name={expandedSections.security ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.palette.sage}
              />
            </TouchableOpacity>

            {expandedSections.security && (
              <View style={styles.accordionBody}>
                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                {/* Temperature Unit */}
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemLabel, { color: colors.text }]}>Temperature Unit</Text>
                    <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                      Used on plant vitals & weather
                    </Text>
                  </View>
                  <View style={styles.unitToggleWrap}>
                    <TouchableOpacity
                      onPress={() => setTempUnit('C')}
                      style={[
                        styles.unitBtn,
                        {
                          backgroundColor: tempUnit === 'C' ? colors.palette.forest : colors.palette.mist,
                          borderRadius: radii.sm,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.unitBtnText,
                          { color: tempUnit === 'C' ? colors.palette.white : colors.text },
                        ]}
                      >
                        °C
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setTempUnit('F')}
                      style={[
                        styles.unitBtn,
                        {
                          backgroundColor: tempUnit === 'F' ? colors.palette.forest : colors.palette.mist,
                          borderRadius: radii.sm,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.unitBtnText,
                          { color: tempUnit === 'F' ? colors.palette.white : colors.text },
                        ]}
                      >
                        °F
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                {/* Change Password Button */}
                <TouchableOpacity
                  onPress={() => setPasswordModalOpen(true)}
                  style={[
                    styles.actionBtnOutlineFull,
                    { borderColor: colors.palette.forest, borderRadius: radii.sm, marginTop: 4 },
                  ]}
                >
                  <Ionicons name="lock-closed-outline" size={16} color={colors.palette.forest} />
                  <Text style={[styles.actionBtnText, { color: colors.palette.forest }]}>
                    Change Account Password
                  </Text>
                </TouchableOpacity>

                {/* Sign Out Action */}
                <TouchableOpacity
                  onPress={handleSignOut}
                  style={[
                    styles.signOutRow,
                    { backgroundColor: colors.palette.blush, borderRadius: radii.sm },
                  ]}
                >
                  <Ionicons name="log-out-outline" size={16} color={colors.palette.warningText} />
                  <Text style={[styles.signOutText, { color: colors.palette.warningText }]}>
                    Sign Out of Account
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── CHANGE PASSWORD MODAL ────────────────────────────────────── */}
      <Modal
        visible={passwordModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPasswordModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.passwordModalSheet,
              { backgroundColor: colors.surface, borderRadius: radii.hero },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <View style={styles.rowCentered}>
                <Ionicons name="lock-closed" size={20} color={colors.palette.forest} />
                <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>
                  Update Password
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPasswordModalOpen(false)}
                style={[styles.closeModalBtn, { backgroundColor: colors.palette.mist }]}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalHeaderSubtitle, { color: colors.textMuted }]}>
              Enter a new secure password of at least 6 characters.
            </Text>

            <View style={{ marginTop: 14 }}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>New Password</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Enter new password"
                placeholderTextColor={colors.palette.sage}
                secureTextEntry
                style={[
                  styles.modalTextInput,
                  {
                    backgroundColor: colors.palette.mist,
                    borderColor: colors.border,
                    color: colors.text,
                    borderRadius: radii.sm,
                  },
                ]}
              />

              <Text style={[styles.inputLabel, { color: colors.textMuted, marginTop: 12 }]}>
                Confirm New Password
              </Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-type new password"
                placeholderTextColor={colors.palette.sage}
                secureTextEntry
                style={[
                  styles.modalTextInput,
                  {
                    backgroundColor: colors.palette.mist,
                    borderColor: colors.border,
                    color: colors.text,
                    borderRadius: radii.sm,
                  },
                ]}
              />

              <TouchableOpacity
                onPress={handleSavePassword}
                disabled={isUpdatingPassword}
                style={[
                  styles.savePasswordBtn,
                  { backgroundColor: colors.palette.forest, borderRadius: radii.md },
                ]}
              >
                {isUpdatingPassword ? (
                  <ActivityIndicator size="small" color={colors.palette.white} />
                ) : (
                  <Text style={[styles.savePasswordBtnText, { color: colors.palette.white }]}>
                    Save New Password
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── CALIBRATION WIZARD MODAL ─────────────────────────────────── */}
      <Modal
        visible={calibrationModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCalibrationModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.calibrationModalSheet,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.hero,
              },
            ]}
          >
            <View style={styles.calModalHeader}>
              <Text style={[styles.calModalTitle, { color: colors.text }]}>
                Soil Sensor Calibration
              </Text>
              <TouchableOpacity
                onPress={() => setCalibrationModalOpen(false)}
                style={[styles.closeModalBtn, { backgroundColor: colors.palette.mist }]}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <CalibrationWizard
              initialValues={config.calibration}
              onCalibrationComplete={handleCalibrationComplete}
              onSkip={() => setCalibrationModalOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    paddingBottom: 110,
  },
  headerTitleWrap: {
    marginBottom: 14,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  screenSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  iconPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillSm: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  cardDivider: {
    height: 1,
    marginVertical: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowCentered: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  itemLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  pillSelectorRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  modePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnOutlineFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    paddingVertical: 11,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  refillRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    marginTop: 12,
  },
  refillRowText: {
    fontSize: 12,
    fontWeight: '700',
  },
  unitToggleWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  unitBtn: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    marginTop: 8,
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '700',
  },
  monoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  monoText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },

  /* ── User Profile Styles ────────────────────────────────────────── */
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  profileInfoWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  profileEmail: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  changePhotoText: {
    fontSize: 13,
    fontWeight: '700',
  },
  inputSection: {
    marginVertical: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWithActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontWeight: '600',
  },
  saveNameBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveNameBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  passwordRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 10,
  },
  passwordRowBtnText: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },

  /* ── Accordion Styles ───────────────────────────────────────────── */
  accordionGroupWrap: {
    marginTop: 6,
    marginBottom: 16,
  },
  accordionHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  accordionSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  accordionCard: {
    borderWidth: 1.5,
    marginBottom: 10,
    overflow: 'hidden',
  },
  accordionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  accordionItemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  accordionItemSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  accordionBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  infoFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoFieldValue: {
    fontSize: 13,
    fontWeight: '700',
  },

  /* ── Modal Styles ───────────────────────────────────────────────── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginLeft: 8,
  },
  modalHeaderSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  closeModalBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordModalSheet: {
    padding: 20,
    paddingBottom: 36,
  },
  modalTextInput: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 4,
  },
  savePasswordBtn: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  savePasswordBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  calibrationModalSheet: {
    margin: 16,
    padding: 20,
    maxHeight: '90%',
  },
  calModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calModalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
});
