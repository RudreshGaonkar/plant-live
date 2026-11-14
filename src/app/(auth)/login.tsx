import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useForm, Controller, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/services/firebase';
import { useAppTheme } from '@/theme';
import {
  loginSchema,
  LoginFormData,
  mapAuthError,
  validateEmail,
  mapPasswordResetError,
  PASSWORD_RESET_CONFIRMATION_MESSAGE,
} from '@/utils/authValidation';

export default function LoginScreen() {
  const { colors, radii } = useAppTheme();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forgot Password Modal States
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const handleOpenForgotPassword = () => {
    const currentEmail = getValues('email') || '';
    setResetEmail(currentEmail.trim());
    setResetError(null);
    setResetSuccess(null);
    setForgotModalOpen(true);
  };

  const handleCloseForgotPassword = () => {
    if (isSendingReset) return;
    setForgotModalOpen(false);
    setResetError(null);
    setResetSuccess(null);
  };

  const handleSendPasswordReset = async () => {
    if (isSendingReset) return;
    setResetError(null);
    setResetSuccess(null);

    const trimmedEmail = resetEmail.trim();
    const validation = validateEmail(trimmedEmail, false);
    if (!validation.valid) {
      setResetError(validation.error || 'Please enter a valid email address.');
      return;
    }

    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setResetSuccess(PASSWORD_RESET_CONFIRMATION_MESSAGE);
    } catch (err: unknown) {
      const msg = mapPasswordResetError(err);
      if (msg === PASSWORD_RESET_CONFIRMATION_MESSAGE) {
        setResetSuccess(msg);
      } else {
        setResetError(msg);
      }
    } finally {
      setIsSendingReset(false);
    }
  };

  const onSubmit = async (data: LoginFormData) => {
    setAuthError(null);
    setIsSubmitting(true);
    try {
      const trimmedEmail = data.email.trim();
      await signInWithEmailAndPassword(auth, trimmedEmail, data.password);
      router.replace('/(tabs)/home');
    } catch (err: unknown) {
      const errorMsg = mapAuthError(err, 'Failed to sign in. Please check your credentials.');
      setAuthError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePressSubmit = () => {
    handleSubmit(
      onSubmit,
      (formErrors: FieldErrors<LoginFormData>) => {
        if (formErrors.email) {
          emailInputRef.current?.focus();
        } else if (formErrors.password) {
          passwordInputRef.current?.focus();
        }
      }
    )();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Brand */}
          <View style={styles.brandHeader}>
            <View
              style={[
                styles.logoWrap,
                { backgroundColor: '#16221A', borderRadius: 20 },
              ]}
            >
              <Image
                source={require('@/assets/images/leaflink-mark.png')}
                style={{ width: 44, height: 44 }}
                resizeMode="contain"
              />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>LeafLink</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Smart Plant-Watering Companion
            </Text>
          </View>

          {/* Form Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.hero,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.text }]}>Sign In</Text>

            {authError && (
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
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color={colors.palette.warningText}
                />
                <Text
                  style={[styles.errorBannerText, { color: colors.palette.warningText }]}
                >
                  {authError}
                </Text>
              </View>
            )}

            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                Email Address
              </Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <View
                    style={[
                      styles.inputContainer,
                      {
                        backgroundColor: colors.palette.mist,
                        borderColor: errors.email
                          ? colors.palette.warningBorder
                          : colors.border,
                        borderRadius: radii.md,
                      },
                    ]}
                  >
                    <Ionicons
                      name="mail-outline"
                      size={20}
                      color={colors.textMuted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      ref={emailInputRef}
                      style={[styles.input, { color: colors.text }]}
                      placeholder="gardener@example.com"
                      placeholderTextColor={colors.palette.sage}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      keyboardType="email-address"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  </View>
                )}
              />
              {errors.email && (
                <Text style={[styles.fieldError, { color: colors.palette.warningText }]}>
                  {errors.email.message}
                </Text>
              )}
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                Password
              </Text>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <View
                    style={[
                      styles.inputContainer,
                      {
                        backgroundColor: colors.palette.mist,
                        borderColor: errors.password
                          ? colors.palette.warningBorder
                          : colors.border,
                        borderRadius: radii.md,
                      },
                    ]}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={20}
                      color={colors.textMuted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      ref={passwordInputRef}
                      style={[styles.input, { color: colors.text }]}
                      placeholder="••••••••"
                      placeholderTextColor={colors.palette.sage}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      textContentType="password"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  </View>
                )}
              />
              {errors.password && (
                <Text style={[styles.fieldError, { color: colors.palette.warningText }]}>
                  {errors.password.message}
                </Text>
              )}
            </View>

            {/* Forgot Password Link */}
            <View style={styles.forgotPasswordRow}>
              <TouchableOpacity
                onPress={handleOpenForgotPassword}
                accessibilityRole="button"
                accessibilityLabel="Forgot password?"
              >
                <Text
                  style={[
                    styles.forgotPasswordLink,
                    { color: colors.palette.forest },
                  ]}
                >
                  Forgot password?
                </Text>
              </TouchableOpacity>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                {
                  backgroundColor: colors.palette.forest,
                  borderRadius: radii.full,
                  opacity: isSubmitting ? 0.7 : 1,
                },
              ]}
              onPress={handlePressSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.palette.white} />
              ) : (
                <>
                  <Text style={[styles.primaryButtonText, { color: colors.palette.white }]}>
                    Sign In
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.palette.white} />
                </>
              )}
            </TouchableOpacity>

            {/* Sign Up Navigation */}
            <View style={styles.switchAuthRow}>
              <Text style={[styles.switchAuthText, { color: colors.textMuted }]}>
                Don&apos;t have an account?{' '}
              </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text
                  style={[
                    styles.switchAuthLink,
                    { color: colors.palette.forest, fontWeight: '700' },
                  ]}
                >
                  Create one
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── FORGOT PASSWORD MODAL ────────────────────────────────────── */}
      <Modal
        visible={forgotModalOpen}
        animationType="fade"
        transparent
        onRequestClose={handleCloseForgotPassword}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.resetModalSheet,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.hero,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <View style={styles.rowCentered}>
                <Ionicons name="key-outline" size={20} color={colors.palette.forest} />
                <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>
                  Reset Password
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCloseForgotPassword}
                disabled={isSendingReset}
                style={[styles.closeModalBtn, { backgroundColor: colors.palette.mist }]}
                accessibilityLabel="Close reset password dialog"
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalHeaderSubtitle, { color: colors.textMuted }]}>
              Enter your email address to receive a password reset link.
            </Text>

            {resetError ? (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: colors.palette.blush,
                    borderRadius: radii.sm,
                    borderColor: colors.palette.warningBorder,
                    marginTop: 12,
                    marginBottom: 4,
                  },
                ]}
              >
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color={colors.palette.warningText}
                />
                <Text
                  style={[styles.errorBannerText, { color: colors.palette.warningText }]}
                >
                  {resetError}
                </Text>
              </View>
            ) : null}

            {resetSuccess ? (
              <View
                style={[
                  styles.successBanner,
                  {
                    backgroundColor: '#E8F5E9',
                    borderRadius: radii.sm,
                    borderColor: '#81C784',
                    marginTop: 12,
                    marginBottom: 4,
                  },
                ]}
              >
                <Ionicons name="checkmark-circle" size={18} color="#2E7D32" />
                <Text style={styles.successBannerText}>
                  {resetSuccess}
                </Text>
              </View>
            ) : null}

            <View style={{ marginTop: 14 }}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                Email Address
              </Text>
              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.palette.mist,
                    borderColor: colors.border,
                    borderRadius: radii.md,
                  },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={colors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="gardener@example.com"
                  placeholderTextColor={colors.palette.sage}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  value={resetEmail}
                  onChangeText={(text) => {
                    setResetEmail(text);
                    if (resetError) setResetError(null);
                  }}
                  editable={!isSendingReset}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                {
                  backgroundColor: colors.palette.forest,
                  borderRadius: radii.full,
                  marginTop: 16,
                  opacity: isSendingReset ? 0.7 : 1,
                },
              ]}
              onPress={handleSendPasswordReset}
              disabled={isSendingReset}
            >
              {isSendingReset ? (
                <ActivityIndicator color={colors.palette.white} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: colors.palette.white }]}>
                  Send Reset Link
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  brandHeader: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 28,
  },
  logoWrap: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    padding: 24,
    borderWidth: 1.5,
    elevation: 3,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  errorBannerText: {
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  fieldError: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    marginTop: 10,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  switchAuthRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  switchAuthText: {
    fontSize: 14,
  },
  switchAuthLink: {
    fontSize: 14,
  },
  forgotPasswordRow: {
    alignItems: 'flex-end',
    marginTop: -4,
    marginBottom: 16,
  },
  forgotPasswordLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  resetModalSheet: {
    padding: 22,
    borderWidth: 1.5,
    elevation: 4,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  rowCentered: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalHeaderSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  closeModalBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    gap: 8,
  },
  successBannerText: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '500',
    flex: 1,
  },
});
