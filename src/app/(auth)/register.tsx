import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, set, serverTimestamp } from 'firebase/database';
import { auth, db } from '@/services/firebase';
import { useSession } from '@/store/useSession';
import { useAppTheme } from '@/theme';

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const { colors, radii } = useAppTheme();
  const { enterDemoMode } = useSession();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setAuthError(null);
    setIsSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        data.email.trim(),
        data.password
      );

      await updateProfile(userCredential.user, {
        displayName: data.name.trim(),
      });

      const userRef = ref(db, `users/${userCredential.user.uid}`);
      await set(userRef, {
        profile: {
          name: data.name.trim(),
          email: data.email.trim(),
          createdAt: serverTimestamp(),
        },
        prefs: {
          units: 'C',
          quietHours: { start: 22, end: 7 },
          alerts: {
            bottle: true,
            dry: true,
            wet: true,
            heat: true,
            offline: true,
            watered: true,
          },
        },
      });

      router.replace('/(tabs)/home');
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setAuthError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoMode = () => {
    enterDemoMode();
    router.replace('/(tabs)/home');
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
          {/* Header */}
          <View style={styles.brandHeader}>
            <View
              style={[
                styles.logoWrap,
                { backgroundColor: colors.palette.lime, borderRadius: radii.full },
              ]}
            >
              <Ionicons name="leaf" size={32} color={colors.palette.forest} />
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
                      style={[styles.input, { color: colors.text }]}
                      placeholder="Jane Doe"
                      placeholderTextColor={colors.palette.sage}
                      autoCapitalize="words"
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
                      style={[styles.input, { color: colors.text }]}
                      placeholder="gardener@example.com"
                      placeholderTextColor={colors.palette.sage}
                      autoCapitalize="none"
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
                      style={[styles.input, { color: colors.text }]}
                      placeholder="••••••••"
                      placeholderTextColor={colors.palette.sage}
                      secureTextEntry
                      autoCapitalize="none"
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
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="••••••••"
                      placeholderTextColor={colors.palette.sage}
                      secureTextEntry
                      autoCapitalize="none"
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
              onPress={handleSubmit(onSubmit)}
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

          {/* Demo Button */}
          <TouchableOpacity
            style={[
              styles.demoButton,
              {
                backgroundColor: colors.palette.lime,
                borderColor: colors.palette.forest,
                borderRadius: radii.full,
              },
            ]}
            onPress={handleDemoMode}
          >
            <Ionicons name="play" size={16} color={colors.palette.forest} />
            <Text
              style={[
                styles.demoButtonText,
                { color: colors.palette.forest, fontWeight: '700' },
              ]}
            >
              Or Try Demo Mode without an Account
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
    fontSize: 24,
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
    marginTop: 16,
  },
  switchAuthText: {
    fontSize: 14,
  },
  switchAuthLink: {
    fontSize: 14,
  },
  demoButton: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderWidth: 1,
    gap: 6,
  },
  demoButtonText: {
    fontSize: 14,
  },
});
