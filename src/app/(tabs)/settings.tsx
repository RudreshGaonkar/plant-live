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
import {
  ref,
  set,
  update,
  get as fbGet,
  remove,
  onValue,
} from 'firebase/database';
import { deleteUser } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '@/services/firebase';
import { useAppTheme } from '@/theme';
import { useLiveDevice } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import { updateDeviceConfigInRTDB, removeDeviceWithAudit } from '@/services/devices';
import {
  PlantPassportHeader,
  SliderControl,
  CalibrationWizard,
  CalibrationValues,
  LegalPoliciesModal,
  LegalPolicyType,
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
  const updateConfig = useLiveDevice((s) => s.updateConfig);
  const updateCalibration = useLiveDevice((s) => s.updateCalibration);
  const refillBottle = useLiveDevice((s) => s.refillBottle);

  // Calibration Wizard modal state
  const [calibrationModalOpen, setCalibrationModalOpen] = useState<boolean>(false);
  const [isRefilling, setIsRefilling] = useState<boolean>(false);
  const [isRemovingDevice, setIsRemovingDevice] = useState<boolean>(false);

  // Draft values for Bottle Size and Pump Speed (commit on sliding complete)
  const [bottleCapacityDraft, setBottleCapacityDraft] = useState<number | null>(null);
  const [pumpFlowDraft, setPumpFlowDraft] = useState<number | null>(null);

  const activeBottleCapacity = bottleCapacityDraft ?? device?.config?.bottle?.capacityMl ?? 1000;
  const activePumpFlow = pumpFlowDraft ?? device?.config?.bottle?.flowMlPerSec ?? 15;

  const LOCATION_PRESETS = {
    indoor: { moistureMin: 35, moistureMax: 65, tempMax: 35, humidityMax: 80, pumpDurationSec: 5 },
    balcony: { moistureMin: 30, moistureMax: 60, tempMax: 35, humidityMax: 80, pumpDurationSec: 5 },
    terrace: { moistureMin: 25, moistureMax: 55, tempMax: 32, humidityMax: 80, pumpDurationSec: 5 },
  };

  const handleSelectLocation = async (loc: 'indoor' | 'balcony' | 'terrace') => {
    if (!device?.id) return;
    const defaults = LOCATION_PRESETS[loc];
    try {
      await updateDeviceConfigInRTDB(device.id, {
        location: loc,
        thresholds: {
          ...device.config?.thresholds,
          ...defaults,
        },
      });
      updateConfig({ location: loc }, device.id);
      updateThresholds(defaults);
      Alert.alert('Saved', `Location set to ${loc.charAt(0).toUpperCase() + loc.slice(1)} and watering limits updated successfully.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update location and watering limits.');
    }
  };

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

  // Legal Policies Modal State
  const [policyModal, setPolicyModal] = useState<{ visible: boolean; type: LegalPolicyType }>({
    visible: false,
    type: 'terms',
  });
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);

  // Synchronize initial preferences from RTDB
  React.useEffect(() => {
    if (!user?.uid) return;
    const prefsRef = ref(db, `users/${user.uid}/prefs`);
    const unsubscribe = onValue(prefsRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        if (val.units === 'C' || val.units === 'F') {
          setTempUnit(val.units);
        }
        if (val.quietHours && typeof val.quietHours.enabled === 'boolean') {
          setQuietHoursEnabled(val.quietHours.enabled);
        }
        if (val.alerts && typeof val.alerts === 'object') {
          setAlerts((prev) => ({
            ...prev,
            ...val.alerts,
          }));
        }
      }
    });
    return () => unsubscribe();
  }, [user?.uid]);

  const handleSetTempUnit = (unit: 'C' | 'F') => {
    setTempUnit(unit);
    if (user?.uid) {
      update(ref(db, `users/${user.uid}/prefs`), { units: unit }).catch((err) =>
        console.warn('[settings] Failed to persist units:', err)
      );
    }
  };

  const handleToggleQuietHours = (val: boolean) => {
    setQuietHoursEnabled(val);
    if (user?.uid) {
      update(ref(db, `users/${user.uid}/prefs/quietHours`), {
        enabled: val,
        start: '22:00',
        end: '07:00',
      }).catch((err) => console.warn('[settings] Failed to persist quietHours:', err));
    }
  };

  const handleToggleAlert = (key: keyof typeof alerts, val: boolean) => {
    setAlerts((prev) => {
      const next = { ...prev, [key]: val };
      if (user?.uid) {
        update(ref(db, `users/${user.uid}/prefs/alerts`), { [key]: val }).catch((err) =>
          console.warn('[settings] Failed to persist alert toggle:', err)
        );
      }
      return next;
    });
  };

  // Collapsible Accordion Sections State (Secondary Options)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    alerts: false,
    deviceInfo: false,
    firmware: false,
    security: false,
    legal: false,
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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account and all associated data? All paired devices will be unlinked, and your telemetry, alert history, and push tokens will be erased. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            if (!user?.uid) return;
            setIsDeletingAccount(true);
            try {
              const uid = user.uid;

              // 1. Disarm paired controllers FIRST while user is still owner
              try {
                const userDevsSnap = await fbGet(ref(db, `users/${uid}/devices`));
                if (userDevsSnap.exists()) {
                  const devMap = userDevsSnap.val() || {};
                  for (const devId of Object.keys(devMap)) {
                    try {
                      await update(ref(db, `devices/${devId}/config`), { mode: 'manual' });
                    } catch {}
                    try {
                      await set(ref(db, `devices/${devId}/command`), {
                        id: `cmd-disarm-${Date.now()}`,
                        type: 'disarm',
                        requestedAt: Date.now(),
                      });
                    } catch {}
                    try {
                      const metaSnap = await fbGet(ref(db, `devices/${devId}/meta/ownerUid`));
                      if (metaSnap.exists() && metaSnap.val() === uid) {
                        await remove(ref(db, `devices/${devId}/meta/ownerUid`));
                      }
                    } catch {}
                    try {
                      const ownerSnap = await fbGet(ref(db, `owners/${devId}`));
                      if (ownerSnap.exists() && ownerSnap.val() === uid) {
                        await remove(ref(db, `owners/${devId}`));
                      }
                    } catch {}
                  }
                }
              } catch (err) {
                console.warn('[handleDeleteAccount] Failed unlinking controllers:', err);
              }

              // 2. Clear user data from RTDB
              try {
                await remove(ref(db, `users/${uid}`));
              } catch {}
              try {
                await remove(ref(db, `alerts/${uid}`));
              } catch {}
              try {
                await remove(ref(db, `userAuditLogs/${uid}`));
              } catch {}

              // 3. Clear AsyncStorage
              await AsyncStorage.removeItem(`@plant_live_active_device_${uid}`).catch(() => {});

              // 4. Delete Firebase Auth User
              if (auth.currentUser) {
                await deleteUser(auth.currentUser);
              }

              // 5. Sign out & route to login
              await signOut();
              router.replace('/(auth)/login');
            } catch (err: any) {
              console.warn('[handleDeleteAccount] Error deleting account:', err);
              if (err?.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Re-authentication Required',
                  'For security reasons, please sign out and sign back in before deleting your account.'
                );
              } else {
                Alert.alert('Account Deletion Failed', err?.message || 'Could not delete account.');
              }
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ]
    );
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

  const handleCalibrationComplete = async (values: CalibrationValues) => {
    if (!device) return;
    try {
      await updateDeviceConfigInRTDB(device.id, { calibration: values });
    } catch (error) {
      Alert.alert('Calibration could not be saved', error instanceof Error ? error.message : 'Try again.');
      return;
    }
    updateCalibration(values, device.id);
    setCalibrationModalOpen(false);
    Alert.alert(
      'Calibration Saved',
      `Soil sensor calibrated!\nDry Air Raw: ${values.soilDryRaw}\nWet Water Raw: ${values.soilWetRaw}`
    );
  };

  const config = device?.config;
  const status = device?.status;
  const telemetry = device?.telemetry;
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
            {device
              ? `Profile, plant passport & hardware preferences · ID: ${device.id}`
              : 'Profile, account & application preferences'}
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

        {/* ── CONDITIONAL HARDWARE PASSPORT OR EMPTY PROMPT ─────────── */}
        {!device ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.card,
                borderColor: colors.border,
                alignItems: 'center',
                paddingVertical: 32,
                paddingHorizontal: 20,
              },
            ]}
          >
            <Ionicons name="leaf-outline" size={48} color={colors.palette.sage} />
            <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 12, marginBottom: 6 }]}>
              No Active Plant Device
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.textMuted, textAlign: 'center', marginBottom: 18 }]}>
              Pair your LeafLink controller to manage automated watering, soil moisture bounds, and sensor calibration.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/add-device' as any)}
              style={[styles.primaryBtn, { backgroundColor: colors.palette.forest, borderRadius: radii.md }]}
            >
              <Ionicons name="add" size={18} color={colors.palette.white} />
              <Text style={[styles.primaryBtnText, { color: colors.palette.white }]}>Add Device</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── 2. PLANT PASSPORT HEADER CARD ──────────────────────────── */}
            <PlantPassportHeader
              deviceId={device.id}
              config={config!}
              status={status!}
              telemetry={telemetry!}
            />

            {/* ── 3. CORE WATERING LIMITS CARD ───────────────────────── */}
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
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Watering Limits</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                    Automated watering bounds & timing
                  </Text>
                </View>
              </View>

              {/* Location Picker */}
              <View style={styles.locationSection}>
                <Text style={[styles.itemLabel, { color: colors.text, marginBottom: 4 }]}>Plant Location</Text>
                <Text style={[styles.itemDesc, { color: colors.textMuted, marginBottom: 10 }]}>
                  Select location to apply recommended watering bounds
                </Text>
                <View style={styles.locationPickerRow}>
                  {(['indoor', 'balcony', 'terrace'] as const).map((loc) => {
                    const isSelected = (config?.location || 'indoor') === loc;
                    const meta = {
                      indoor: { label: 'Indoor', icon: 'home-outline' as const },
                      balcony: { label: 'Balcony', icon: 'leaf-outline' as const },
                      terrace: { label: 'Terrace', icon: 'sunny-outline' as const },
                    }[loc];
                    return (
                      <TouchableOpacity
                        key={loc}
                        activeOpacity={0.8}
                        onPress={() => handleSelectLocation(loc)}
                        style={[
                          styles.locationBtn,
                          {
                            backgroundColor: isSelected ? colors.palette.forest : colors.palette.mist,
                            borderColor: isSelected ? colors.palette.forest : colors.border,
                            borderRadius: radii.md,
                          },
                        ]}
                      >
                        <Ionicons
                          name={meta.icon}
                          size={16}
                          color={isSelected ? colors.palette.white : colors.palette.forest}
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={[
                            styles.locationBtnText,
                            { color: isSelected ? colors.palette.white : colors.palette.ink },
                          ]}
                        >
                          {meta.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

              {/* Start Watering Below Slider */}
              <SliderControl
                label="Start Watering Below"
                description="Triggers auto-watering when soil drops below this %"
                value={config!.thresholds.moistureMin}
                min={10}
                max={50}
                step={5}
                unit="%"
                accentColor={colors.palette.warningBorder}
                onChange={(val) => updateThresholds({ moistureMin: val })}
                onSlidingComplete={(val) => {
                  if (device?.id) {
                    updateDeviceConfigInRTDB(device.id, {
                      'thresholds/moistureMin': val,
                    } as any).catch((err) => console.warn('[settings] Failed to persist moistureMin to RTDB:', err));
                  }
                }}
              />

              <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

              {/* Stop Watering At Slider */}
              <SliderControl
                label="Stop Watering At"
                description="Target soil saturation limit for irrigation shut-off"
                value={config!.thresholds.moistureMax}
                min={50}
                max={90}
                step={5}
                unit="%"
                accentColor={colors.palette.forest}
                onChange={(val) => updateThresholds({ moistureMax: val })}
                onSlidingComplete={(val) => {
                  if (device?.id) {
                    updateDeviceConfigInRTDB(device.id, {
                      'thresholds/moistureMax': val,
                    } as any).catch((err) => console.warn('[settings] Failed to persist moistureMax to RTDB:', err));
                  }
                }}
              />

              <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

              {/* Max Temperature Limit Slider */}
              <SliderControl
                label="Max Temperature Limit"
                description="Pauses auto-watering during peak heat to protect roots"
                value={config!.thresholds.tempMax}
                min={20}
                max={50}
                step={1}
                unit="°C"
                accentColor={colors.palette.warningBorder}
                onChange={(val) => updateThresholds({ tempMax: val })}
                onSlidingComplete={(val) => {
                  if (device?.id) {
                    updateDeviceConfigInRTDB(device.id, {
                      'thresholds/tempMax': val,
                    } as any).catch((err) => console.warn('[settings] Failed to persist tempMax to RTDB:', err));
                  }
                }}
              />

              <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

              {/* Max Humidity Limit Slider */}
              <SliderControl
                label="Max Humidity Limit"
                description="Coastal guard delays watering when ambient air humidity is high"
                value={config!.thresholds.humidityMax}
                min={40}
                max={95}
                step={5}
                unit="%"
                accentColor={colors.palette.forest}
                onChange={(val) => updateThresholds({ humidityMax: val })}
                onSlidingComplete={(val) => {
                  if (device?.id) {
                    updateDeviceConfigInRTDB(device.id, {
                      'thresholds/humidityMax': val,
                    } as any).catch((err) => console.warn('[settings] Failed to persist humidityMax to RTDB:', err));
                  }
                }}
              />

              <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

              {/* Watering Duration Slider */}
              <SliderControl
                label="Watering Duration"
                description="Run-time per automatic irrigation cycle (max 15s)"
                value={config!.thresholds.pumpDurationSec}
                min={1}
                max={15}
                step={1}
                unit="s"
                accentColor={colors.palette.sage}
                onChange={(val) => updateThresholds({ pumpDurationSec: val })}
                onSlidingComplete={(val) => {
                  if (device?.id) {
                    updateDeviceConfigInRTDB(device.id, {
                      'thresholds/pumpDurationSec': val,
                      'thresholds/waterDurationSec': val,
                    } as any).catch((err) => console.warn('[settings] Failed to persist pumpDurationSec to RTDB:', err));
                  }
                }}
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

          {/* Soil Calibration Wizard Trigger */}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>Soil Sensor Calibration (Dry & Wet)</Text>
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

          {/* Bottle Size */}
          <SliderControl
            label="Bottle Size"
            description="Volume of water bottle attached to the plant node"
            value={activeBottleCapacity}
            min={250}
            max={2000}
            step={50}
            unit=" ml"
            accentColor={colors.palette.forest}
            onChange={(val) => setBottleCapacityDraft(val)}
            onSlidingComplete={(val) => {
              setBottleCapacityDraft(null);
              const currentRemaining = config!.bottle.remainingMl;
              const newRemaining = Math.min(currentRemaining, val);
              updateConfig({
                bottleCapacityMl: val,
                remainingMl: newRemaining,
                bottle: {
                  ...config!.bottle,
                  capacityMl: val,
                  remainingMl: newRemaining,
                },
              }, device?.id);
              if (device?.id) {
                updateDeviceConfigInRTDB(device.id, {
                  bottleCapacityMl: val,
                  remainingMl: newRemaining,
                  'bottle/capacityMl': val,
                  'bottle/remainingMl': newRemaining,
                } as any).catch((err) => console.warn('[settings] Failed to persist bottle size to RTDB:', err));
              }
            }}
          />

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Pump Speed */}
          <SliderControl
            label="Pump Speed"
            description="Adjusts the water-use estimate while the relay switches the pump on and off"
            value={activePumpFlow}
            min={5}
            max={30}
            step={1}
            unit=" ml/s"
            accentColor={colors.palette.sage}
            onChange={(val) => setPumpFlowDraft(val)}
            onSlidingComplete={(val) => {
              setPumpFlowDraft(null);
              updateConfig({
                bottle: {
                  ...config!.bottle,
                  flowMlPerSec: val,
                },
              }, device?.id);
              if (device?.id) {
                updateDeviceConfigInRTDB(device.id, {
                  'bottle/flowMlPerSec': val,
                } as any).catch((err) => console.warn('[settings] Failed to persist pump speed to RTDB:', err));
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
                    'Waiting for controller acknowledgement. Please check hardware connection.'
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
                ? 'Confirming Refill with Controller...'
                : `Mark Bottle as Refilled (${config.bottle.remainingMl} / ${config.bottle.capacityMl} ml)`}
            </Text>
          </TouchableOpacity>
        </View>
          </>
        )}

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
                        onValueChange={(val) => handleToggleAlert('bottle', val)}
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
                        onValueChange={(val) => handleToggleAlert('dry', val)}
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
                        onValueChange={(val) => handleToggleAlert('wet', val)}
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
                          Alert if temperature exceeds {config?.thresholds.tempMax ?? 35}°C
                        </Text>
                      </View>
                      <Switch
                        value={alerts.heat}
                        onValueChange={(val) => handleToggleAlert('heat', val)}
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
                        onValueChange={(val) => handleToggleAlert('offline', val)}
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
                        onValueChange={handleToggleQuietHours}
                        trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
                        thumbColor={colors.palette.white}
                      />
                    </View>
                  </View>
                )}
              </View>

          {device && (
            <>
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
                    Controller & Network
                  </Text>
                  <Text style={[styles.accordionItemSubtitle, { color: colors.textMuted }]}>
                    Controller ID, connection & unpair
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
                  <Text style={[styles.itemLabel, { color: colors.textMuted }]}>Controller ID</Text>
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
                    Reconnect Controller / Wi-Fi Setup
                  </Text>
                </TouchableOpacity>

                {/* Action: Remove / Unpair Controller */}
                <TouchableOpacity
                  testID="remove-device-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Remove or unpair this plant controller"
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
                        Remove Controller
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ACCORDION 3: Controller Details */}
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
                  <Ionicons name="hardware-chip-outline" size={16} color={colors.palette.forest} />
                </View>
                <View>
                  <Text style={[styles.accordionItemTitle, { color: colors.text }]}>
                    Controller Details
                  </Text>
                  <Text style={[styles.accordionItemSubtitle, { color: colors.textMuted }]}>
                    Controller status & live sensor information
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
                  <Text style={[styles.infoFieldLabel, { color: colors.textMuted }]}>Controller Hardware</Text>
                  <Text style={[styles.infoFieldValue, { color: colors.text }]}>
                    NodeMCU / ESP-12E (80 MHz)
                  </Text>
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                <View style={styles.rowBetween}>
                  <Text style={[styles.infoFieldLabel, { color: colors.textMuted }]}>Wi-Fi Signal</Text>
                  <Text style={[styles.infoFieldValue, { color: colors.text }]}>
                    {telemetry.rssi ? `${telemetry.rssi} dBm` : '-60 dBm (Good)'}
                  </Text>
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                <View style={styles.rowBetween}>
                  <Text style={[styles.infoFieldLabel, { color: colors.textMuted }]}>Soil Sensor Calibration (Dry & Wet)</Text>
                  <Text style={[styles.infoFieldValue, { color: colors.text }]}>
                    {config.calibration.soilDryRaw} - {config.calibration.soilWetRaw}
                  </Text>
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                <View style={styles.rowBetween}>
                  <Text style={[styles.infoFieldLabel, { color: colors.textMuted }]}>Live Sensor Updates</Text>
                  <Text style={[styles.infoFieldValue, { color: colors.text }]}>
                    {status.online ? 'Connected' : 'Offline'}
                  </Text>
                </View>
              </View>
            )}
          </View>
            </>
          )}

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
                      onPress={() => handleSetTempUnit('C')}
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
                      onPress={() => handleSetTempUnit('F')}
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

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                {/* Delete Account Action */}
                <TouchableOpacity
                  testID="delete-account-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Permanently delete account"
                  onPress={handleDeleteAccount}
                  disabled={isDeletingAccount}
                  style={[
                    styles.deleteAccountRow,
                    { backgroundColor: 'rgba(235, 87, 87, 0.08)', borderRadius: radii.sm },
                  ]}
                >
                  {isDeletingAccount ? (
                    <ActivityIndicator size="small" color={colors.palette.critical} />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={16} color={colors.palette.critical} />
                      <Text style={[styles.deleteAccountText, { color: colors.palette.critical }]}>
                        Delete Account & Data
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ACCORDION 5: Legal & Privacy Compliance */}
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
              onPress={() => toggleSection('legal')}
              style={styles.accordionTitleRow}
              activeOpacity={0.7}
            >
              <View style={styles.rowCentered}>
                <View style={[styles.iconPillSm, { backgroundColor: colors.palette.mist }]}>
                  <Ionicons name="document-text-outline" size={16} color={colors.palette.forest} />
                </View>
                <View>
                  <Text style={[styles.accordionItemTitle, { color: colors.text }]}>
                    Legal & Privacy Compliance
                  </Text>
                  <Text style={[styles.accordionItemSubtitle, { color: colors.textMuted }]}>
                    Terms, sensor telemetry & privacy policies
                  </Text>
                </View>
              </View>
              <Ionicons
                name={expandedSections.legal ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.palette.sage}
              />
            </TouchableOpacity>

            {expandedSections.legal && (
              <View style={styles.accordionBody}>
                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                <TouchableOpacity
                  onPress={() => setPolicyModal({ visible: true, type: 'terms' })}
                  style={styles.legalRowItem}
                >
                  <View style={styles.rowCentered}>
                    <Ionicons name="shield-outline" size={18} color={colors.palette.forest} />
                    <Text style={[styles.legalItemText, { color: colors.text }]}>
                      Terms & Conditions
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.palette.sage} />
                </TouchableOpacity>

                <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

                <TouchableOpacity
                  onPress={() => setPolicyModal({ visible: true, type: 'privacy' })}
                  style={styles.legalRowItem}
                >
                  <View style={styles.rowCentered}>
                    <Ionicons name="lock-closed-outline" size={18} color={colors.palette.forest} />
                    <Text style={[styles.legalItemText, { color: colors.text }]}>
                      Privacy Policy & Telemetry Notice
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.palette.sage} />
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

            {device && config && (
              <CalibrationWizard
                deviceId={device.id}
                initialValues={config.calibration}
                onCalibrationComplete={handleCalibrationComplete}
                onSkip={() => setCalibrationModalOpen(false)}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── LEGAL & PRIVACY POLICIES MODAL ───────────────────────────── */}
      <LegalPoliciesModal
        visible={policyModal.visible}
        type={policyModal.type}
        onClose={() => setPolicyModal((prev) => ({ ...prev, visible: false }))}
      />
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
  locationSection: {
    marginBottom: 4,
  },
  locationPickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  locationBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1.5,
  },
  locationBtnText: {
    fontSize: 13,
    fontWeight: '700',
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
  emptyDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  deleteAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 10,
  },
  deleteAccountText: {
    fontSize: 13,
    fontWeight: '700',
  },
  legalRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  legalItemText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
  },
});
