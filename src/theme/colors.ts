/**
 * Exact palette tokens from spec.md Section 5.1
 */
export const Palette = {
  // Primary Spec Tokens
  blush: '#F8D7DA', // Soft backgrounds, warning surfaces (thirsty), card tints
  forest: '#5A8A5C', // Primary brand color, app bar, primary buttons, active tab
  sage: '#80B07F', // Secondary buttons, icons, moisture chart line
  mint: '#AEE09A', // Success/healthy states, progress fills, highlights
  lime: '#CEEA9F', // Light surfaces, chips, gradient end
  
  // Supporting Neutrals from Spec 5.1
  ink: '#1F2A21', // Primary text
  mist: '#F6FAF2', // App background
  white: '#FFFFFF', // Cards / surfaces
  
  // Status Colors strictly from Spec 5.1
  // Healthy = mint; Needs attention = blush with darker text/border #C0505E; Critical = #C0505E
  warningText: '#C0505E',
  warningBorder: '#C0505E',
  critical: '#C0505E',

  // Dark Theme Base (spec 5.1: "deep green #16221A base, same accents")
  darkBg: '#16221A',
  darkSurface: '#1F2A21',
} as const;

export type ColorToken = keyof typeof Palette;
