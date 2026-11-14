/**
 * DeviceQRScanner
 * Clean QR code scanner using `expo-camera` for pairing ESP8266 devices.
 * Supports torch toggle, camera permission requests, and animated scanning reticle.
 */
import React, { useState, useEffect, useRef } from 'react';
import { AppState, Linking, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme } from '@/theme';

export interface DeviceQRScannerProps {
  onScan: (deviceId: string) => void;
  onManualInputPress?: () => void;
  scanDisabled?: boolean;
}

export function DeviceQRScanner({
  onScan,
  onManualInputPress,
  scanDisabled = false,
}: DeviceQRScannerProps) {
  const { colors, radii } = useAppTheme();
  const [permission, requestPermission, getPermission] = useCameraPermissions({ get: false });
  const [permissionError, setPermissionError] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const scanLocked = useRef(false);

  useEffect(() => {
    const refreshPermission = () => {
      void getPermission()
        .then(({ granted }) => {
          setPermissionError(false);
          if (!granted) {
            setCameraReady(false);
            setCameraFailed(false);
          }
        })
        .catch(() => setPermissionError(true));
    };
    refreshPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermission();
    });
    return () => subscription.remove();
  }, [getPermission]);

  const handlePermissionPress = async () => {
    setPermissionError(false);
    try {
      if (!permission) {
        await getPermission();
      } else if (permission.canAskAgain) {
        await requestPermission();
      } else {
        await Linking.openSettings();
      }
    } catch {
      setPermissionError(true);
    }
  };

  // Animated laser scanline
  const scanLineY = useSharedValue(0);

  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(200, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [scanLineY]);

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLineY.value }],
  }));

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scanDisabled || scanLocked.current) return;
    scanLocked.current = true;
    setScanned(true);

    let deviceId = result.data.trim();
    try {
      // Check if QR data is JSON: {"deviceId": "esp8266-xxxx", ...}
      const parsed = JSON.parse(result.data);
      if (typeof parsed?.deviceId === 'string') {
        deviceId = parsed.deviceId.trim();
      }
    } catch {
      // Fallback: raw text ID
    }

    onScan(deviceId);
  };

  if (!permission && !permissionError) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.surface, borderRadius: radii.card }]}>
        <Ionicons name="camera-outline" size={36} color={colors.palette.forest} />
        <Text style={[styles.permissionText, { color: colors.text }]}>
          Loading camera permissions...
        </Text>
      </View>
    );
  }

  if (!permission?.granted || cameraFailed) {
    const actionLabel = cameraFailed
      ? 'Retry camera'
      : !permission
        ? 'Retry permission check'
        : permission.canAskAgain
          ? 'Grant Camera Permission'
          : 'Open Settings';

    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.surface, borderRadius: radii.card, borderColor: colors.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.palette.lime }]}>
          <Ionicons name="camera" size={32} color={colors.palette.forest} />
        </View>
        <Text style={[styles.permissionTitle, { color: colors.text }]}>
          {cameraFailed ? 'Camera could not start' : 'Camera Access Required'}
        </Text>
        <Text style={[styles.permissionSubtitle, { color: colors.textMuted }]}>
          {cameraFailed
            ? 'Retry on a physical device or enter the controller ID manually.'
            : permissionError
              ? 'Camera access could not be checked or changed. Try again or enter the controller ID manually.'
              : 'Scan the QR code on your ESP8266 plant companion to pair it instantly.'}
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, borderRadius: radii.xl }]}
          onPress={cameraFailed ? () => setCameraFailed(false) : handlePermissionPress}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.palette.white} style={{ marginRight: 6 }} />
          <Text style={styles.primaryBtnText}>{actionLabel}</Text>
        </TouchableOpacity>

        {onManualInputPress && (
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border, borderRadius: radii.xl }]}
            onPress={onManualInputPress}
          >
            <Ionicons name="keypad-outline" size={16} color={colors.palette.forest} style={{ marginRight: 6 }} />
            <Text style={[styles.secondaryBtnText, { color: colors.palette.forest }]}>
              Enter Device ID Manually
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.cameraWrapper, { borderRadius: radii.card }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onCameraReady={() => setCameraReady(true)}
        onMountError={() => {
          setCameraReady(false);
          setCameraFailed(true);
        }}
        onBarcodeScanned={scanned || scanDisabled ? undefined : handleBarcodeScanned}
      />

      {/* Semi-transparent dark overlay with center cutout */}
      <View style={styles.reticleOverlay}>
        {/* Top Controls */}
        <View style={styles.topControls}>
          <TouchableOpacity
            style={[styles.controlPill, { borderRadius: radii.full }]}
            onPress={() => setTorch(!torch)}
          >
            <Ionicons
              name={torch ? 'flash' : 'flash-outline'}
              size={18}
              color={torch ? '#FFD54F' : '#FFFFFF'}
            />
            <Text style={styles.controlPillText}>{torch ? 'Flash On' : 'Flash Off'}</Text>
          </TouchableOpacity>
        </View>

        {/* Viewfinder Target Box */}
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.cornerTL, { borderColor: colors.palette.mint }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: colors.palette.mint }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: colors.palette.mint }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: colors.palette.mint }]} />

          {/* Animated Scan Line */}
          <Animated.View
            style={[
              styles.scanLine,
              { backgroundColor: colors.palette.mint },
              scanLineStyle,
            ]}
          />
        </View>

        <Text style={styles.instructionText}>
          {cameraReady ? 'Align device QR code within frame' : 'Starting camera…'}
        </Text>

        {/* Quick Fallback Actions */}
        <View style={styles.actionRow}>
          {onManualInputPress && (
            <TouchableOpacity
              style={[styles.actionBtn, { borderRadius: radii.full }]}
              onPress={onManualInputPress}
            >
              <Ionicons name="create-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.actionBtnText}>Enter Manually</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraWrapper: {
    height: 380,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000000',
  },
  reticleOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    paddingHorizontal: 20,
  },
  controlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  controlPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  viewfinder: {
    width: 220,
    height: 220,
    position: 'relative',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2.5,
    borderRadius: 2,
    opacity: 0.85,
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  // Permission Card
  permissionContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginVertical: 10,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  permissionSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  permissionText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 12,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
