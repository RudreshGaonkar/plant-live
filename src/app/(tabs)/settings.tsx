/**
 * Settings Screen – "Plant Passport & Account Settings"
 * Production-ready UI with local avatar picker, inline user info editing,
 * plant passport thresholds, and clean collapsible accordion secondary options.
 */
import React, { useRef, useState } from 'react';
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
  Platform,
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
} from 'firebase/database';
import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '@/services/firebase';
import {
  isOtpWorkerConfigured,
  sendEmailOtp,
  verifyEmailOtp,
} from '@/services/emailOtp';
import { useAppTheme } from '@/theme';
import { useLiveDevice } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import { useDeviceSettingsEdits } from '@/hooks/useDeviceSettingsEdits';
import { PasswordInput } from '@/components/PasswordInput';
import { RefillConfirmationModal } from '@/components/RefillConfirmation';
import {
  updateDeviceConfigInRTDB,
  removeDeviceWithAudit,
  updateDeviceLocationAndPreset,
  updateDevicePumpDuration,
  updateDeviceThreshold,
  updateDeviceFlowRate,
  updateBottleCapacityWithTransaction,
  updateDeviceLightMode,
} from '@/services/devices';
import { formatTemperature } from '@/utils/temperature';
import {
  changePasswordWithCurrentSchema,
  isValidOtp,
  validateDisplayName,
  mapChangePasswordError,
} from '@/utils/authValidation';
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
    isEmailVerified,
    resendVerificationEmail,
    refreshEmailVerification,
    prefs,
    signOut,
    setAvatarUri,
    updateUserDisplayName,
    retrySyncProfileToRTDB,
    updateTempUnit,
    toggleQuietHours,
    updateAlertPref,
  } = useSession();

  // Store bindings
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);

  // Calibration Wizard modal state
  const [calibrationScope, setCalibrationScope] = useState<string | null>(null);
  const [showRefillModal, setShowRefillModal] = useState<boolean>(false);
  const [isRemovingDevice, setIsRemovingDevice] = useState<boolean>(false);

  const currentUid = user?.uid || '';
  const activeDevId = device?.id || '';
  const edits = useDeviceSettingsEdits(currentUid, activeDevId);
  const [displayNameDraft, setDisplayNameDraft] = useState<string | null>(null);

  const prevUidRef = useRef(currentUid);
  React.useEffect(() => {
    if (prevUidRef.current !== currentUid) {
      prevUidRef.current = currentUid;
      setDisplayNameDraft(null);
    }
  }, [currentUid]);

  const renderSyncBadge = (fieldKey: string) => {
    const status = edits.status(fieldKey);
    if (!status) return null;

    if (status.state === 'pending') {
      return (
        <View style={styles.syncBadgePending}>
          <ActivityIndicator size="small" color={colors.palette.forest} />
          <Text style={[styles.syncTextPending, { color: colors.palette.forest }]}>Pending...</Text>
        </View>
      );
    }
    if (status.state === 'saved') {
      return (
        <View style={styles.syncBadgeSaved}>
          <Ionicons name="checkmark-circle" size={13} color="#2E7D32" />
          <Text style={styles.syncTextSaved}>Saved</Text>
        </View>
      );
    }
    if (status.state === 'error') {
      return (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Retry save. ${status.error}`}
          onPress={status.retry}
          style={styles.syncBadgeError}
        >
          <Ionicons name="alert-circle" size={13} color={colors.palette.critical} />
          <Text style={[styles.syncTextError, { color: colors.palette.critical }]}>Retry · {status.error}</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  const LOCATION_PRESETS = {
    indoor: { moistureMin: 35, moistureMax: 65, tempMax: 35, humidityMax: 80, pumpDurationSec: 5 },
    balcony: { moistureMin: 30, moistureMax: 60, tempMax: 35, humidityMax: 80, pumpDurationSec: 5 },
    terrace: { moistureMin: 25, moistureMax: 55, tempMax: 32, humidityMax: 80, pumpDurationSec: 5 },
  };

  const handleSelectLocation = (loc: 'indoor' | 'balcony' | 'terrace') =>
    edits.save('location', (id) => updateDeviceLocationAndPreset(id, loc, LOCATION_PRESETS[loc]));

  // User Profile Form States
  const displayNameInput = displayNameDraft ?? (user?.displayName || '');
  const savingName = useRef(false);
  const displayNameField = useRef<TextInput>(null);
  const [isUpdatingName, setIsUpdatingName] = useState<boolean>(false);
  const [isPickingAvatar, setIsPickingAvatar] = useState<boolean>(false);

  // Change Password Modal States
  const passwordBusy = useRef(false);
  const currentPasswordField = useRef<TextInput>(null);
  const newPasswordField = useRef<TextInput>(null);
  const confirmPasswordField = useRef<TextInput>(null);
  const otpField = useRef<TextInput>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState<boolean>(false);
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState<boolean>(false);
  const [otpStep, setOtpStep] = useState<'passwords' | 'otp'>('passwords');
  const [otpCode, setOtpCode] = useState<string>('');
  const [otpCooldown, setOtpCooldown] = useState<number>(0);
  const [isSendingOtp, setIsSendingOtp] = useState<boolean>(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState<boolean>(false);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (otpCooldown > 0) {
      timer = setTimeout(() => {
        setOtpCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [otpCooldown]);

  // Temperature unit preference bound to UID-scoped session store
  const tempUnit = prefs.units;

  // Alert Category Toggles
  const alerts = prefs.alerts;
  const quietHoursEnabled = prefs.quietHours.enabled;
  const quietHoursRange = `${prefs.quietHours.start} - ${prefs.quietHours.end}`;

  // Legal Policies Modal State
  const [policyModal, setPolicyModal] = useState<{ visible: boolean; type: LegalPolicyType }>({
    visible: false,
    type: 'terms',
  });
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);

  const handleSetTempUnit = async (unit: 'C' | 'F') => {
    try {
      await updateTempUnit(unit);
    } catch (err) {
      Alert.alert('Temperature Units Could Not Be Saved', err instanceof Error ? err.message : 'Try again.');
    }
  };

  const handleToggleQuietHours = async (val: boolean) => {
    try {
      await toggleQuietHours(val);
    } catch (err) {
      Alert.alert('Quiet Hours Could Not Be Saved', err instanceof Error ? err.message : 'Try again.');
    }
  };

  const handleToggleAlert = async (key: keyof typeof alerts, val: boolean) => {
    try {
      await updateAlertPref(key, val);
    } catch (err) {
      Alert.alert('Alert Preference Could Not Be Saved', err instanceof Error ? err.message : 'Try again.');
    }
  };

  // Email verification state
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [isResendingEmail, setIsResendingEmail] = useState<boolean>(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState<boolean>(false);
  const [verificationFeedback, setVerificationFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (resendCooldown > 0) {
      timer = setTimeout(() => {
        setResendCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [resendCooldown]);

  const handleResendVerification = async () => {
    if (isResendingEmail || resendCooldown > 0) return;
    setIsResendingEmail(true);
    setVerificationFeedback(null);
    try {
      await resendVerificationEmail();
      setResendCooldown(60);
      setVerificationFeedback({
        type: 'success',
        message: 'Verification email sent. Please check your inbox and spam folders.',
      });
      Alert.alert(
        'Verification Email Sent',
        'We sent a new verification link to your email address. Please click the link to verify your account.'
      );
    } catch (err: any) {
      console.warn('[Settings] Failed to resend verification email:', err);
      if (err?.code === 'auth/too-many-requests') {
        setResendCooldown(60);
        setVerificationFeedback({
          type: 'error',
          message: 'Too many requests. Please wait a moment before trying again.',
        });
        Alert.alert(
          'Rate Limited',
          'Too many verification emails have been requested. Please wait before requesting another.'
        );
      } else {
        const errorMsg = err?.message || 'Failed to send verification email. Please try again later.';
        setVerificationFeedback({
          type: 'error',
          message: errorMsg,
        });
        Alert.alert('Unable to Send', errorMsg);
      }
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleCheckVerification = async () => {
    if (isCheckingVerification) return;
    setIsCheckingVerification(true);
    setVerificationFeedback(null);
    try {
      const verified = await refreshEmailVerification();
      if (verified) {
        setVerificationFeedback({
          type: 'success',
          message: 'Your email address is verified!',
        });
        Alert.alert('Email Verified', 'Your email address has been successfully verified.');
      } else {
        setVerificationFeedback({
          type: 'info',
          message: 'Email not verified yet. Please check your inbox and click the verification link.',
        });
        Alert.alert(
          'Not Verified Yet',
          'We have not detected your verification yet. If you just clicked the link, please wait a few seconds and try again.'
        );
      }
    } catch (err: any) {
      console.warn('[Settings] Failed to refresh verification status:', err);
      const errorMsg = 'Failed to check verification status. Please check your connection and try again.';
      setVerificationFeedback({
        type: 'error',
        message: errorMsg,
      });
      Alert.alert('Check Failed', errorMsg);
    } finally {
      setIsCheckingVerification(false);
    }
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
    if (savingName.current) return;
    const validation = validateDisplayName(displayNameInput);
    if (!validation.valid || validation.value === undefined) {
      Alert.alert('Invalid Name', validation.error ?? 'Please enter a valid name.', [
        { text: 'OK', onPress: () => displayNameField.current?.focus() },
      ]);
      return;
    }
    if (validation.value === user?.displayName) return;

    savingName.current = true;
    try {
      setIsUpdatingName(true);
      await updateUserDisplayName(validation.value);
      setDisplayNameDraft(null);
      Alert.alert('Profile Saved', 'Your display name has been updated successfully.');
    } catch (err: any) {
      console.warn('[Settings] Display name update error:', err);
      if (err?.message === 'AUTH_DISPLAY_NAME_UPDATED_RTDB_FAILED') {
        Alert.alert(
          'Partially Saved',
          'Your display name was updated in your session, but the database mirror failed.',
          [
            { text: 'Retry Mirror', onPress: () => retrySyncProfileToRTDB().catch(() => {}) },
            { text: 'OK' },
          ]
        );
      } else {
        Alert.alert('Update Failed', err?.message || 'Failed to update display name.');
      }
    } finally {
      savingName.current = false;
      setIsUpdatingName(false);
    }
  };

  const handleOpenPasswordModal = () => {
    const isOtpActive = isOtpWorkerConfigured();
    if (isOtpActive && !isEmailVerified) {
      Alert.alert(
        'Email Verification Required',
        'Your email address must be verified before changing your password with two-factor email verification. Please verify your email first.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Verify Email',
            onPress: () => {
              handleCheckVerification();
            },
          },
        ]
      );
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setOtpCode('');
    setOtpStep('passwords');
    setPasswordError(null);
    setPasswordSuccess(null);
    setPasswordModalOpen(true);
  };

  const handleClosePasswordModal = () => {
    if (passwordBusy.current) return;
    setPasswordModalOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setOtpStep('passwords');
    setOtpCode('');
    setPasswordError(null);
    setPasswordSuccess(null);
  };

  // Password Update Handler
  const handleSavePassword = async () => {
    if (passwordBusy.current) return;
    setPasswordError(null);
    setPasswordSuccess(null);

    const isOtpActive = isOtpWorkerConfigured();
    if (isOtpActive && !isEmailVerified) {
      setPasswordError('Please verify your email address before changing your password.');
      return;
    }

    const parseResult = changePasswordWithCurrentSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      const fields = {
        currentPassword: currentPasswordField,
        newPassword: newPasswordField,
        confirmPassword: confirmPasswordField,
      };
      fields[issue?.path[0] as keyof typeof fields]?.current?.focus();
      setPasswordError(issue?.message || 'Please check your passwords.');
      return;
    }

    passwordBusy.current = true;
    try {
      setIsUpdatingPassword(true);
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error('No authenticated user session found');
      }

      // 1. Re-authenticate with current password
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // 2. If OTP worker is configured, request OTP and transition modal to OTP input
      if (isOtpActive) {
        setIsSendingOtp(true);
        try {
          await sendEmailOtp();
          setCurrentPassword('');
          setConfirmPassword('');
          setOtpStep('otp');
          setOtpCooldown(60);
          setPasswordSuccess('A 6-digit verification code has been sent to your email.');
        } catch (otpErr: any) {
          const msg = mapChangePasswordError(otpErr, 'Failed to send verification code. Please try again.');
          setPasswordError(msg);
          if (otpErr?.retryAfter) {
            setOtpCooldown(otpErr.retryAfter);
          }
        } finally {
          setIsSendingOtp(false);
        }
        return;
      }

      // If EXPO_PUBLIC_OTP_WORKER_URL is unset, gracefully complete updatePassword directly
      await updatePassword(currentUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Your account password has been updated securely.');
      Alert.alert('Password Changed', 'Your account password has been updated securely.');
    } catch (err: any) {
      console.warn('[Settings] Password update error:', err);
      const friendlyMessage = mapChangePasswordError(err, 'Failed to change password.');
      setPasswordError(friendlyMessage);
    } finally {
      passwordBusy.current = false;
      setIsUpdatingPassword(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0 || passwordBusy.current) return;
    passwordBusy.current = true;
    setPasswordError(null);
    setPasswordSuccess(null);
    try {
      setIsSendingOtp(true);
      await sendEmailOtp();
      setOtpCooldown(60);
      setPasswordSuccess('A new verification code has been sent to your email.');
    } catch (err: any) {
      const msg = mapChangePasswordError(err, 'Failed to resend code.');
      setPasswordError(msg);
      if (err?.retryAfter) {
        setOtpCooldown(err.retryAfter);
      }
    } finally {
      passwordBusy.current = false;
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtpAndChangePassword = async () => {
    if (passwordBusy.current) return;
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!isValidOtp(otpCode)) {
      otpField.current?.focus();
      setPasswordError('Please enter a valid 6-digit verification code.');
      return;
    }

    passwordBusy.current = true;
    try {
      setIsVerifyingOtp(true);
      await verifyEmailOtp(otpCode);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('No authenticated user session found');
      }
      await updatePassword(currentUser, newPassword);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setOtpCode('');
      setOtpStep('passwords');
      setPasswordSuccess('Your account password has been updated securely.');
      Alert.alert('Password Changed', 'Your account password has been updated securely.');
    } catch (err: any) {
      console.warn('[Settings] OTP verification error:', err);
      const msg = mapChangePasswordError(err, 'Verification failed. Please try again.');
      setPasswordError(msg);
    } finally {
      passwordBusy.current = false;
      setIsVerifyingOtp(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch {
            Alert.alert('Sign Out Failed', 'Please try again.');
          }
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
    const plantName = device.config?.plantName || device.config?.name || 'Plant';
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
    if (useSession.getState().user?.uid !== currentUid ||
        useLiveDevice.getState().activeDeviceId !== device.id) return;
    setCalibrationScope(null);
    Alert.alert(
      'Calibration Saved',
      `Soil sensor calibrated!\nDry Air Raw: ${values.soilDryRaw}\nWet Water Raw: ${values.soilWetRaw}`
    );
  };

  const config = device?.config;
  const status = device?.status;
  const telemetry = device?.telemetry;
  const missingConfig = !!device && (!config || device.isConfigHydrated === false);
  const isNameChanged = displayNameInput.trim() !== (user?.displayName || '');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        keyboardShouldPersistTaps="handled"
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

        {device?.id && (
          <View
            testID="controller-management"
            style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.card, borderColor: colors.border }]}
          >
            <Text style={[styles.itemLabel, { color: colors.text, fontWeight: '700' }]}>Controller Management</Text>
            <Text style={[styles.itemLabel, { color: colors.textMuted }]}>Controller ID {device.id}</Text>
            <Text style={[styles.itemLabel, { color: colors.text, marginTop: 12 }]}>Reconfigure Controller Wi-Fi</Text>
            <Text style={[styles.itemLabel, { color: colors.textMuted, marginTop: 8 }]}>
              {'1. Turn on a 2.4 GHz WPA2 mobile hotspot with internet access. Keep it running on a separate phone.\n\n'
                + '2. Power on the controller out of range of the old Wi-Fi. Wait about 15 seconds for its setup hotspot.\n\n'
                + '3. On your demo phone, join LeafLink-<chipId> with password leafsetup. Stay connected even if it says no internet.\n\n'
                + '4. Open http://192.168.4.1 in your browser. Select Configure WiFi, choose the 2.4 GHz WPA2 hotspot, enter its password, and save.\n\n'
                + '5. Reconnect your demo phone to the internet and return here. Keep this controller paired and wait for fresh telemetry. If the setup portal expires after five minutes, power-cycle the controller to try again.'}
            </Text>
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

            {/* Email, Verification Badge, and Quick Avatar Prompt */}
            <View style={styles.profileInfoWrap}>
              <View style={styles.profileEmailRow}>
                <Text style={[styles.profileEmail, { color: colors.text }]} numberOfLines={1}>
                  {user?.email || 'Plant Parent'}
                </Text>
                <View
                  testID="email-verification-badge"
                  style={[
                    styles.verificationBadge,
                    {
                      backgroundColor: isEmailVerified
                        ? `${colors.palette.forest}15`
                        : `${colors.palette.warningText}15`,
                      borderColor: isEmailVerified
                        ? `${colors.palette.forest}40`
                        : `${colors.palette.warningBorder}40`,
                    },
                  ]}
                  accessibilityRole="text"
                  accessibilityLabel={`Email status: ${isEmailVerified ? 'Verified' : 'Unverified'}`}
                >
                  <Ionicons
                    name={isEmailVerified ? 'checkmark-circle' : 'alert-circle-outline'}
                    size={11}
                    color={isEmailVerified ? colors.palette.forest : colors.palette.warningText}
                  />
                  <Text
                    style={[
                      styles.verificationBadgeText,
                      {
                        color: isEmailVerified
                          ? colors.palette.forest
                          : colors.palette.warningText,
                      },
                    ]}
                  >
                    {isEmailVerified ? 'Verified' : 'Unverified'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={handlePickAvatar} style={styles.changePhotoBtn}>
                <Ionicons name="image-outline" size={14} color={colors.palette.forest} />
                <Text style={[styles.changePhotoText, { color: colors.palette.forest }]}>
                  {user?.avatarUri ? 'Change Avatar' : 'Set Profile Avatar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Email Verification Action Callout (shown when unverified) */}
          {!isEmailVerified && (
            <View
              testID="email-verification-callout"
              style={[
                styles.unverifiedBanner,
                {
                  backgroundColor: colors.palette.blush,
                  borderColor: colors.palette.warningBorder,
                  borderRadius: radii.sm,
                },
              ]}
            >
              <View style={styles.unverifiedBannerHeader}>
                <Ionicons
                  name="shield-outline"
                  size={15}
                  color={colors.palette.warningText}
                />
                <Text style={[styles.unverifiedBannerTitle, { color: colors.palette.warningText }]}>
                  Email not verified
                </Text>
              </View>
              <Text style={[styles.unverifiedBannerText, { color: colors.palette.warningText }]}>
                Verify your email to secure your account and recover device settings if needed.
              </Text>

              {verificationFeedback && (
                <View style={styles.verificationFeedbackRow}>
                  <Ionicons
                    name={
                      verificationFeedback.type === 'success'
                        ? 'checkmark-circle-outline'
                        : verificationFeedback.type === 'error'
                        ? 'alert-circle-outline'
                        : 'information-circle-outline'
                    }
                    size={13}
                    color={
                      verificationFeedback.type === 'success'
                        ? colors.palette.forest
                        : colors.palette.warningText
                    }
                  />
                  <Text
                    style={[
                      styles.verificationFeedbackText,
                      {
                        color:
                          verificationFeedback.type === 'success'
                            ? colors.palette.forest
                            : colors.palette.warningText,
                      },
                    ]}
                  >
                    {verificationFeedback.message}
                  </Text>
                </View>
              )}

              <View style={styles.verificationButtonsRow}>
                <TouchableOpacity
                  testID="resend-verification-email-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Resend verification email"
                  onPress={handleResendVerification}
                  disabled={isResendingEmail || resendCooldown > 0}
                  style={[
                    styles.resendBtn,
                    {
                      backgroundColor: colors.palette.forest,
                      borderRadius: radii.sm,
                      opacity: isResendingEmail || resendCooldown > 0 ? 0.6 : 1,
                    },
                  ]}
                >
                  {isResendingEmail ? (
                    <ActivityIndicator size="small" color={colors.palette.white} />
                  ) : (
                    <>
                      <Ionicons name="mail-outline" size={13} color={colors.palette.white} />
                      <Text style={[styles.resendBtnText, { color: colors.palette.white }]}>
                        {resendCooldown > 0
                          ? `Resend in ${resendCooldown}s`
                          : 'Resend verification email'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  testID="check-verification-status-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Check verification status"
                  onPress={handleCheckVerification}
                  disabled={isCheckingVerification}
                  style={[
                    styles.checkStatusBtn,
                    {
                      borderColor: colors.palette.forest,
                      backgroundColor: colors.surface,
                      borderRadius: radii.sm,
                      opacity: isCheckingVerification ? 0.6 : 1,
                    },
                  ]}
                >
                  {isCheckingVerification ? (
                    <ActivityIndicator size="small" color={colors.palette.forest} />
                  ) : (
                    <>
                      <Ionicons name="refresh-outline" size={13} color={colors.palette.forest} />
                      <Text style={[styles.checkStatusBtnText, { color: colors.palette.forest }]}>
                        Check verification status
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Inline Display Name Editor */}
          <View style={styles.inputSection}>
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Display Name</Text>
            <View style={styles.inputWithActionRow}>
              <TextInput
                ref={displayNameField}
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
            onPress={handleOpenPasswordModal}
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
        {!device || missingConfig ? (
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
              {missingConfig ? 'Controller Settings Unavailable' : 'No Active Plant Device'}
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.textMuted, textAlign: 'center', marginBottom: 18 }]}>
              {missingConfig
                ? 'Check your connection and retry to load watering and sensor settings.'
                : 'Pair your LeafLink controller to manage automated watering, soil moisture bounds, and sensor calibration.'}
            </Text>
            <TouchableOpacity
              onPress={() => missingConfig ? void useSession.getState().retryBoot() : router.push('/add-device')}
              style={[styles.primaryBtn, { backgroundColor: colors.palette.forest, borderRadius: radii.md }]}
            >
              <Ionicons name="add" size={18} color={colors.palette.white} />
              <Text style={[styles.primaryBtnText, { color: colors.palette.white }]}>{missingConfig ? 'Retry Connection' : 'Add Device'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── 2. PLANT PASSPORT HEADER CARD ──────────────────────────── */}
            <PlantPassportHeader
              deviceId={device.id}
              config={config!}
              status={status!}
              telemetry={telemetry}
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
                        disabled={edits.status('location')?.state === 'pending'}
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
                {renderSyncBadge('location')}
              </View>

              <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

              {/* Start Watering Below Slider */}
              <SliderControl
                label="Start Watering Below"
                description="Triggers auto-watering when soil drops below this %"
                value={edits.draft('moistureMin') ?? config!.thresholds.moistureMin}
                min={10}
                max={50}
                step={5}
                unit="%"
                accentColor={colors.palette.warningBorder}
                key={`${edits.scope}:moistureMin`}
                disabled={edits.status('moistureMin')?.state === 'pending'}
                feedback={renderSyncBadge('moistureMin')}
                onChange={(val) => edits.setDraft('moistureMin', val)}
                onSlidingCancel={() => edits.setDraft('moistureMin')}
                onSlidingComplete={(val) => void edits.save('moistureMin', (id) => updateDeviceThreshold(id, 'moistureMin', val))}
              />

              <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

              <SliderControl
                label="Upper Moisture Threshold"
                description="Upper end of the target soil moisture range"
                value={edits.draft('moistureMax') ?? config!.thresholds.moistureMax}
                min={50}
                max={90}
                step={5}
                unit="%"
                accentColor={colors.palette.forest}
                key={`${edits.scope}:moistureMax`}
                disabled={edits.status('moistureMax')?.state === 'pending'}
                feedback={renderSyncBadge('moistureMax')}
                onChange={(val) => edits.setDraft('moistureMax', val)}
                onSlidingCancel={() => edits.setDraft('moistureMax')}
                onSlidingComplete={(val) => void edits.save('moistureMax', (id) => updateDeviceThreshold(id, 'moistureMax', val))}
              />

              <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

              {/* Max Temperature Limit Slider - Keeps position and step in Celsius */}
              {(() => {
                const currentTempC = edits.draft('tempMax') ?? config!.thresholds.tempMax;
                const tempBadgeUnit = tempUnit === 'F' ? `°C (${formatTemperature(currentTempC, 'F')})` : '°C';
                return (
                  <SliderControl
                    label="Max Temperature Limit"
                    description={
                      tempUnit === 'F'
                        ? `Pauses auto-watering during peak heat (${formatTemperature(currentTempC, 'F')})`
                        : 'Pauses auto-watering during peak heat to protect roots'
                    }
                    value={currentTempC}
                    min={20}
                    max={50}
                    step={1}
                    unit={tempBadgeUnit}
                    accentColor={colors.palette.warningBorder}
                    key={`${edits.scope}:tempMax`}
                    disabled={edits.status('tempMax')?.state === 'pending'}
                    feedback={renderSyncBadge('tempMax')}
                    onChange={(val) => edits.setDraft('tempMax', val)}
                    onSlidingCancel={() => edits.setDraft('tempMax')}
                    onSlidingComplete={(val) => void edits.save('tempMax', (id) => updateDeviceThreshold(id, 'tempMax', val))}
                  />
                );
              })()}

              <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

              {/* Max Humidity Limit Slider */}
              <SliderControl
                label="Max Humidity Limit"
                description="Coastal guard delays watering when ambient air humidity is high"
                value={edits.draft('humidityMax') ?? config!.thresholds.humidityMax}
                min={40}
                max={95}
                step={5}
                unit="%"
                accentColor={colors.palette.forest}
                key={`${edits.scope}:humidityMax`}
                disabled={edits.status('humidityMax')?.state === 'pending'}
                feedback={renderSyncBadge('humidityMax')}
                onChange={(val) => edits.setDraft('humidityMax', val)}
                onSlidingCancel={() => edits.setDraft('humidityMax')}
                onSlidingComplete={(val) => void edits.save('humidityMax', (id) => updateDeviceThreshold(id, 'humidityMax', val))}
              />

              <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

              {/* Watering Duration Slider - Preserves both pumpDurationSec and waterDurationSec */}
              <SliderControl
                label="Watering Duration"
                description="Run-time per automatic irrigation cycle (max 15s)"
                value={edits.draft('pumpDurationSec') ?? config!.thresholds.pumpDurationSec}
                min={1}
                max={15}
                step={1}
                unit="s"
                accentColor={colors.palette.sage}
                key={`${edits.scope}:pumpDurationSec`}
                disabled={edits.status('pumpDurationSec')?.state === 'pending'}
                feedback={renderSyncBadge('pumpDurationSec')}
                onChange={(val) => edits.setDraft('pumpDurationSec', val)}
                onSlidingCancel={() => edits.setDraft('pumpDurationSec')}
                onSlidingComplete={(val) => void edits.save('pumpDurationSec', (id) => updateDevicePumpDuration(id, val))}
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
              onPress={() => setCalibrationScope(edits.scope)}
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

          {/* Light Sensor (LDR) Toggle */}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.itemLabel, { color: colors.text }]}>Light Sensor (LDR)</Text>
                {renderSyncBadge('lightMode')}
              </View>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Detects direct sunlight to pause watering during peak midday heat
                {config.sensors?.lightMode === 'analog' ? ' (Legacy analog calibrated)' : ''}
              </Text>
            </View>
            <Switch
              value={config.sensors?.lightMode === 'digital' || config.sensors?.lightMode === 'analog'}
              disabled={edits.status('lightMode')?.state === 'pending'}
              onValueChange={(val) => void edits.save(
                'lightMode', (id) => updateDeviceLightMode(id, val ? 'digital' : 'none')
              )}
              trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
              thumbColor={colors.palette.white}
            />
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Bottle Size - Atomic Transaction on Config Node */}
          <SliderControl
            label="Bottle Size"
            description="Volume of water bottle attached to the plant node"
            value={edits.draft('bottleCapacity') ?? config.bottle.capacityMl}
            min={250}
            max={2000}
            step={50}
            unit=" ml"
            accentColor={colors.palette.forest}
            key={`${edits.scope}:bottleCapacity`}
            disabled={edits.status('bottleCapacity')?.state === 'pending'}
            feedback={renderSyncBadge('bottleCapacity')}
            onChange={(val) => edits.setDraft('bottleCapacity', val)}
            onSlidingCancel={() => edits.setDraft('bottleCapacity')}
            onSlidingComplete={(val) => void edits.save('bottleCapacity', (id) => updateBottleCapacityWithTransaction(id, val))}
          />

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Pump Speed - Writes bottle/flowMlPerSec independently */}
          <SliderControl
            label="Pump Speed"
            description="Adjusts the water-use estimate while the relay switches the pump on and off"
            value={edits.draft('flowMlPerSec') ?? config.bottle.flowMlPerSec}
            min={5}
            max={30}
            step={1}
            unit=" ml/s"
            accentColor={colors.palette.sage}
            key={`${edits.scope}:flowMlPerSec`}
            disabled={edits.status('flowMlPerSec')?.state === 'pending'}
            feedback={renderSyncBadge('flowMlPerSec')}
            onChange={(val) => edits.setDraft('flowMlPerSec', val)}
            onSlidingCancel={() => edits.setDraft('flowMlPerSec')}
            onSlidingComplete={(val) => void edits.save('flowMlPerSec', (id) => updateDeviceFlowRate(id, val))}
          />

          {/* Shortcut refill button */}
          <TouchableOpacity
            onPress={() => setShowRefillModal(true)}
            style={[
              styles.refillRowBtn,
              { backgroundColor: colors.palette.lime, borderRadius: radii.sm },
            ]}
          >
            <Ionicons name="refresh" size={15} color={colors.palette.forest} />
            <Text style={[styles.refillRowText, { color: colors.palette.forest }]}>
              {`Mark Bottle as Refilled (${config.bottle.remainingMl} / ${config.bottle.capacityMl} ml)`}
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
                          Alert if temperature exceeds {formatTemperature(config?.thresholds.tempMax ?? 35, tempUnit)}
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

          {device && !missingConfig && (
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
                    Controller identity & plant name
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
                    {telemetry?.rssi ? `${telemetry.rssi} dBm` : '--'}
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
                  onPress={handleOpenPasswordModal}
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
      {passwordModalOpen && <Modal
        visible
        animationType="slide"
        transparent
        onRequestClose={handleClosePasswordModal}
      >
        <ScrollView
          style={styles.passwordModalScroll}
          contentContainerStyle={styles.passwordModalContent}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.passwordModalSheet,
              { backgroundColor: colors.surface, borderRadius: radii.hero },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <View style={styles.rowCentered}>
                <Ionicons
                  name={otpStep === 'otp' ? 'shield-checkmark' : 'lock-closed'}
                  size={20}
                  color={colors.palette.forest}
                />
                <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>
                  {otpStep === 'otp' ? 'Verify Security Code' : 'Update Password'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleClosePasswordModal}
                disabled={isUpdatingPassword || isSendingOtp || isVerifyingOtp}
                style={[styles.closeModalBtn, { backgroundColor: colors.palette.mist }]}
                accessibilityLabel="Close update password modal"
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalHeaderSubtitle, { color: colors.textMuted }]}>
              {otpStep === 'otp'
                ? 'Enter the 6-digit verification code sent to your registered email address to finalize your password update.'
                : 'Enter your current password and a new secure password of at least 6 characters.'}
            </Text>

            {isOtpWorkerConfigured() && !isEmailVerified ? (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: colors.palette.blush,
                    borderRadius: radii.sm,
                    borderColor: colors.palette.warningBorder,
                  },
                ]}
              >
                <Ionicons name="alert-circle" size={18} color={colors.palette.warningText} />
                <Text style={[styles.errorBannerText, { color: colors.palette.warningText }]}>
                  Email verification is required before changing password.
                </Text>
              </View>
            ) : null}

            {passwordError ? (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: colors.palette.blush,
                    borderRadius: radii.sm,
                    borderColor: colors.palette.warningBorder,
                  },
                ]}
              >
                <Ionicons name="alert-circle" size={18} color={colors.palette.warningText} />
                <Text style={[styles.errorBannerText, { color: colors.palette.warningText }]}>
                  {passwordError}
                </Text>
              </View>
            ) : null}

            {passwordSuccess ? (
              <View
                style={[
                  styles.successBanner,
                  {
                    backgroundColor: '#E8F5E9',
                    borderRadius: radii.sm,
                    borderColor: '#81C784',
                  },
                ]}
              >
                <Ionicons name="checkmark-circle" size={18} color="#2E7D32" />
                <Text style={[styles.successBannerText, { color: '#2E7D32' }]}>
                  {passwordSuccess}
                </Text>
              </View>
            ) : null}

            {otpStep === 'passwords' ? (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  Current Password
                </Text>
                <PasswordInput
                  ref={currentPasswordField}
                  accessibilityLabel="Current password"
                  value={currentPassword}
                  onChangeText={(val) => {
                    setCurrentPassword(val);
                    if (passwordError) setPasswordError(null);
                    if (passwordSuccess) setPasswordSuccess(null);
                  }}
                  placeholder="Enter current password"
                  placeholderTextColor={colors.palette.sage}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  textContentType="password"
                  editable={!isUpdatingPassword && !isSendingOtp}
                  style={{ color: colors.text, paddingHorizontal: 12 }}
                  containerStyle={[
                    styles.modalTextInput,
                    {
                      backgroundColor: colors.palette.mist,
                      borderColor: colors.border,
                      borderRadius: radii.sm,
                    },
                  ]}
                />

                <Text style={[styles.inputLabel, { color: colors.textMuted, marginTop: 12 }]}>
                  New Password
                </Text>
                <PasswordInput
                  ref={newPasswordField}
                  accessibilityLabel="New password"
                  value={newPassword}
                  onChangeText={(val) => {
                    setNewPassword(val);
                    if (passwordError) setPasswordError(null);
                    if (passwordSuccess) setPasswordSuccess(null);
                  }}
                  placeholder="Enter new password (min. 6 characters)"
                  placeholderTextColor={colors.palette.sage}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!isUpdatingPassword && !isSendingOtp}
                  style={{ color: colors.text, paddingHorizontal: 12 }}
                  containerStyle={[
                    styles.modalTextInput,
                    {
                      backgroundColor: colors.palette.mist,
                      borderColor: colors.border,
                      borderRadius: radii.sm,
                    },
                  ]}
                />

                <Text style={[styles.inputLabel, { color: colors.textMuted, marginTop: 12 }]}>
                  Confirm New Password
                </Text>
                <PasswordInput
                  ref={confirmPasswordField}
                  accessibilityLabel="Confirm new password"
                  value={confirmPassword}
                  onChangeText={(val) => {
                    setConfirmPassword(val);
                    if (passwordError) setPasswordError(null);
                    if (passwordSuccess) setPasswordSuccess(null);
                  }}
                  placeholder="Re-type new password"
                  placeholderTextColor={colors.palette.sage}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!isUpdatingPassword && !isSendingOtp}
                  style={{ color: colors.text, paddingHorizontal: 12 }}
                  containerStyle={[
                    styles.modalTextInput,
                    {
                      backgroundColor: colors.palette.mist,
                      borderColor: colors.border,
                      borderRadius: radii.sm,
                    },
                  ]}
                />

                <TouchableOpacity
                  onPress={handleSavePassword}
                  disabled={isUpdatingPassword || isSendingOtp}
                  style={[
                    styles.savePasswordBtn,
                    { backgroundColor: colors.palette.forest, borderRadius: radii.md },
                  ]}
                >
                  {isUpdatingPassword || isSendingOtp ? (
                    <ActivityIndicator size="small" color={colors.palette.white} />
                  ) : (
                    <Text style={[styles.savePasswordBtnText, { color: colors.palette.white }]}>
                      {isOtpWorkerConfigured() ? 'Verify & Continue' : 'Save New Password'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  6-Digit Verification Code
                </Text>
                <TextInput
                  ref={otpField}
                  value={otpCode}
                  onChangeText={(val) => {
                    setOtpCode(val);
                    if (passwordError) setPasswordError(null);
                    if (passwordSuccess) setPasswordSuccess(null);
                  }}
                  placeholder="000000"
                  placeholderTextColor={colors.palette.sage}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoFocus
                  editable={!isVerifyingOtp}
                  style={[
                    styles.modalTextInput,
                    styles.otpInput,
                    {
                      backgroundColor: colors.palette.mist,
                      borderColor: colors.border,
                      color: colors.text,
                      borderRadius: radii.sm,
                    },
                  ]}
                />

                <View style={styles.otpResendRow}>
                  <TouchableOpacity
                    onPress={() => {
                      setOtpStep('passwords');
                      setPasswordError(null);
                      setPasswordSuccess(null);
                    }}
                    disabled={isVerifyingOtp || isSendingOtp}
                    style={styles.otpBackBtn}
                  >
                    <Ionicons name="arrow-back" size={16} color={colors.palette.forest} />
                    <Text style={[styles.otpBackText, { color: colors.palette.forest }]}>
                      Edit Passwords
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleResendOtp}
                    disabled={otpCooldown > 0 || isSendingOtp || isVerifyingOtp}
                    style={styles.otpResendBtn}
                  >
                    {isSendingOtp ? (
                      <ActivityIndicator size="small" color={colors.palette.forest} />
                    ) : (
                      <Text
                        style={[
                          styles.otpResendText,
                          {
                            color:
                              otpCooldown > 0
                                ? colors.textMuted
                                : colors.palette.forest,
                          },
                        ]}
                      >
                        {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend Code'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={handleVerifyOtpAndChangePassword}
                  disabled={isVerifyingOtp || isSendingOtp}
                  style={[
                    styles.savePasswordBtn,
                    {
                      backgroundColor:
                        !isVerifyingOtp && !isSendingOtp
                          ? colors.palette.forest
                          : colors.palette.sage,
                      borderRadius: radii.md,
                    },
                  ]}
                >
                  {isVerifyingOtp ? (
                    <ActivityIndicator size="small" color={colors.palette.white} />
                  ) : (
                    <Text style={[styles.savePasswordBtnText, { color: colors.palette.white }]}>
                      Verify & Update Password
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </Modal>}

      {/* ── CALIBRATION WIZARD MODAL ─────────────────────────────────── */}
      <Modal
        visible={calibrationScope === edits.scope}
        animationType="slide"
        transparent
        onRequestClose={() => setCalibrationScope(null)}
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
                onPress={() => setCalibrationScope(null)}
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
                onSkip={() => setCalibrationScope(null)}
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

      <RefillConfirmationModal
        visible={showRefillModal}
        deviceId={device?.id || ''}
        controllerName={config?.name || config?.plantName}
        targetCapacity={config?.bottle?.capacityMl}
        onClose={() => setShowRefillModal(false)}
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
  profileEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  verificationBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  unverifiedBanner: {
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
  },
  unverifiedBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  unverifiedBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  unverifiedBannerText: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  verificationFeedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  verificationFeedbackText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  verificationButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  resendBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  checkStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  checkStatusBtnText: {
    fontSize: 12,
    fontWeight: '700',
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
  passwordModalScroll: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  passwordModalContent: { flexGrow: 1, justifyContent: 'flex-end' },
  passwordModalSheet: {
    padding: 20,
    paddingBottom: 36,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 8,
    gap: 8,
  },
  errorBannerText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 8,
    gap: 8,
  },
  successBannerText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
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
  otpInput: {
    letterSpacing: 8,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
  },
  otpResendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  otpBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  otpBackText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  otpResendBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  otpResendText: {
    fontSize: 13,
    fontWeight: '600',
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
  syncBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(90, 138, 92, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  syncTextPending: {
    fontSize: 10,
    fontWeight: '700',
  },
  syncBadgeSaved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  syncTextSaved: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2E7D32',
  },
  syncBadgeError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  syncTextError: {
    fontSize: 10,
    fontWeight: '700',
  },
});
