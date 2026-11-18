import { PasswordInput } from '@/components/PasswordInput';
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useForm, Controller, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '@/store/useSession';
import { useAppTheme } from '@/theme';
import { LegalPoliciesModal, LegalPolicyType } from '@/components';
import { registerSchema, RegisterFormData, mapAuthError } from '@/utils/authValidation';

export default function RegisterScreen() {
  const { colors, radii } = useAppTheme();
  const [authError, setAuthError] = useState<string | null>(null);
  const submitting = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [policyModal, setPolicyModal] = useState<{ visible: boolean; type: LegalPolicyType }>({
    visible: false,
    type: 'terms',
  });

  const nameInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    if (submitting.current) return;
    submitting.current = true;
    setAuthError(null);
    setIsSubmitting(true);
    try {
      await useSession.getState().registerUser(data);
    } catch (err: unknown) {
      const errorMsg = mapAuthError(err, 'Registration failed. Please try again.');
      setAuthError(errorMsg);
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const handlePressSubmit = () => {
    handleSubmit(
      onSubmit,
      (formErrors: FieldErrors<RegisterFormData>) => {
        if (formErrors.name) {
          nameInputRef.current?.focus();
        } else if (formErrors.email) {
          emailInputRef.current?.focus();
        } else if (formErrors.password) {
          passwordInputRef.current?.focus();
        } else if (formErrors.confirmPassword) {
          confirmPasswordInputRef.current?.focus();
        }
      }
    )();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.brandHeader}>
          <View
            style={[
              styles.logoWrap,
              { backgroundColor: '#16221A', borderRadius: 18 },
            ]}
          >
            <Image
              source={require('@/assets/images/leaflink-mark.png')}
              style={{ width: 40, height: 40 }}
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            Create LeafLink Account
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Start caring for your plants smarter
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
          <Text style={[styles.cardTitle, { color: colors.text }]}>Register</Text>

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

          {/* Name Field */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
              Full Name
            </Text>
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <View
                  style={[
                    styles.inputContainer,
                    {
                      backgroundColor: colors.palette.mist,
                      borderColor: errors.name
                        ? colors.palette.warningBorder
                        : colors.border,
                      borderRadius: radii.md,
                    },
                  ]}
                >
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={colors.textMuted}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    ref={nameInputRef}
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Jane Doe"
                    placeholderTextColor={colors.palette.sage}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoComplete="name"
                    textContentType="name"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                </View>
              )}
            />
            {errors.name && (
              <Text style={[styles.fieldError, { color: colors.palette.warningText }]}>
                {errors.name.message}
              </Text>
            )}
          </View>

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
                  <PasswordInput
                    ref={passwordInputRef}
                    accessibilityLabel="Password"
                    style={[styles.input, { color: colors.text }]}
                    placeholder="••••••••"
                    placeholderTextColor={colors.palette.sage}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
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

          {/* Confirm Password Field */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
              Confirm Password
            </Text>
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <View
                  style={[
                    styles.inputContainer,
                    {
                      backgroundColor: colors.palette.mist,
                      borderColor: errors.confirmPassword
                        ? colors.palette.warningBorder
                        : colors.border,
                      borderRadius: radii.md,
                    },
                  ]}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={20}
                    color={colors.textMuted}
                    style={styles.inputIcon}
                  />
                  <PasswordInput
                    ref={confirmPasswordInputRef}
                    accessibilityLabel="Confirm password"
                    style={[styles.input, { color: colors.text }]}
                    placeholder="••••••••"
                    placeholderTextColor={colors.palette.sage}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                </View>
              )}
            />
            {errors.confirmPassword && (
              <Text style={[styles.fieldError, { color: colors.palette.warningText }]}>
                {errors.confirmPassword.message}
              </Text>
            )}
          </View>

          {/* Submit Button */}
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
                  Create Account
                </Text>
                <Ionicons name="arrow-forward" size={18} color={colors.palette.white} />
              </>
            )}
          </TouchableOpacity>

          {/* Terms and Privacy policy disclaimer */}
          <View style={styles.policyRow}>
            <Text style={[styles.policyText, { color: colors.textMuted }]}>
              By signing up, you agree to our{' '}
            </Text>
            <TouchableOpacity onPress={() => setPolicyModal({ visible: true, type: 'terms' })}>
              <Text style={[styles.policyLink, { color: colors.palette.forest }]}>
                Terms & Conditions
              </Text>
            </TouchableOpacity>
            <Text style={[styles.policyText, { color: colors.textMuted }]}> and </Text>
            <TouchableOpacity onPress={() => setPolicyModal({ visible: true, type: 'privacy' })}>
              <Text style={[styles.policyLink, { color: colors.palette.forest }]}>
                Privacy Policy
              </Text>
            </TouchableOpacity>
            <Text style={[styles.policyText, { color: colors.textMuted }]}>.</Text>
          </View>

          {/* Switch to Login */}
          <View style={styles.switchAuthRow}>
            <Text style={[styles.switchAuthText, { color: colors.textMuted }]}>
              Already registered?{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text
                style={[
                  styles.switchAuthLink,
                  { color: colors.palette.forest, fontWeight: '700' },
                ]}
              >
                Sign In
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <LegalPoliciesModal
        visible={policyModal.visible}
        type={policyModal.type}
        onClose={() => setPolicyModal((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  brandHeader: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  logoWrap: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 26,
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
    marginBottom: 14,
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
    marginTop: 12,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  policyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  policyText: {
    fontSize: 12,
  },
  policyLink: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
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
});
