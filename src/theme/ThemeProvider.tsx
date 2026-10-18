import React, { createContext, useContext } from 'react';
import { Palette } from './colors';

export interface ThemeRadii {
  sm: number;
  md: number;
  lg: number;
  xl: number; // 20px
  card: number; // 24px - organic spec requirement
  hero: number; // 28px
  island: number; // 32px floating island navbar
  full: number;
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export interface AppTheme {
  isDark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceElevated: string;
    text: string;
    textMuted: string;
    primary: string;
    primaryText: string;
    secondary: string;
    accent: string;
    border: string;
    statusHealthy: string;
    statusThirsty: string;
    statusOverwatered: string;
    statusOffline: string;
    chipBg: string;
    palette: typeof Palette;
  };
  radii: ThemeRadii;
  spacing: ThemeSpacing;
}

const radii: ThemeRadii = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 20,
  card: 24,
  hero: 28,
  island: 32,
  full: 9999,
};

const spacing: ThemeSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};

export const lightTheme: AppTheme = {
  isDark: false,
  colors: {
    background: Palette.mist,
    surface: Palette.white,
    surfaceElevated: Palette.white,
    text: Palette.ink,
    textMuted: Palette.sage,
    primary: Palette.forest,
    primaryText: Palette.white,
    secondary: Palette.sage,
    accent: Palette.lime,
    border: Palette.lime,
    statusHealthy: Palette.mint,
    statusThirsty: Palette.blush,
    statusOverwatered: Palette.blush,
    statusOffline: Palette.sage,
    chipBg: Palette.lime,
    palette: Palette,
  },
  radii,
  spacing,
};

export const darkTheme: AppTheme = {
  isDark: true,
  colors: {
    background: Palette.darkBg,
    surface: Palette.darkSurface,
    surfaceElevated: Palette.darkSurface,
    text: Palette.mist,
    textMuted: Palette.sage,
    primary: Palette.mint,
    primaryText: Palette.ink,
    secondary: Palette.sage,
    accent: Palette.lime,
    border: Palette.forest,
    statusHealthy: Palette.mint,
    statusThirsty: Palette.blush,
    statusOverwatered: Palette.blush,
    statusOffline: Palette.sage,
    chipBg: Palette.lime,
    palette: Palette,
  },
  radii,
  spacing,
};

const ThemeContext = createContext<AppTheme>(lightTheme);

export const LeafThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Spec Section 5.1: Light theme is the required base theme (mist #F6FAF2 background, white #FFFFFF cards, ink #1F2A21 text)
  const theme = lightTheme;

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = () => useContext(ThemeContext);
