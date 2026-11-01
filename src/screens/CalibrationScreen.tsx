import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SoilCalibration } from '@/components/SoilCalibration';

export default function CalibrationScreen() {
  const handleComplete = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/settings');
    }
  };

  const handleCancel = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/settings');
    }
  };

  return (
    <View style={styles.container}>
      <SoilCalibration onComplete={handleComplete} onCancel={handleCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
