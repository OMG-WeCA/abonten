// OMD brand color palette — shared between web (theme.css) and mobile (React Native).
// Keep these in sync with apps/web/src/styles/theme.css.
// Rule: always use semantic tokens in components, never raw hex values.

export const palette = {
  brandRed: '#E4002B',
  brandBlack: '#0A0A0A',
  brandWhite: '#FFFFFF',
  brandLightGray: '#F5F5F5',
  brandMediumGray: '#6B7280',
  brandDarkGray: '#374151',
  // Deep navy — web dark-mode background (OMD-style marketing aesthetic).
  navy: '#0A0E27',
  // Vibrant accents for visual interest (mirrors theme.css accent tokens).
  accentGold: '#FFB020',
  accentAmber: '#F59E0B',
  accentOrange: '#FB923C',
  accentBlue: '#3B82F6',
  accentSky: '#38BDF8',
  accentTeal: '#2DD4BF',
  accentEmerald: '#34D399',
  accentViolet: '#A855F7',
} as const;

export const lightTheme = {
  primary: '#E4002B',
  primaryHover: '#C20028',
  background: '#FFFFFF',
  surface: '#F5F5F5',
  surface2: '#FFFFFF',
  foreground: '#0A0A0A',
  muted: '#6B7280',
  secondary: '#374151',
  border: '#E5E7EB',
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#DC2626',
  info: '#2563EB',
};

export const darkTheme = {
  primary: '#E4002B',
  primaryHover: '#C20028',
  background: '#0A0E27',
  surface: '#131A3A',
  surface2: '#0E1530',
  foreground: '#FFFFFF',
  muted: '#9BA8C7',
  secondary: '#D1D5DB',
  border: '#243056',
  success: '#34D399',
  warning: '#FFB020',
  error: '#FF5470',
  info: '#3B82F6',
};

export type Theme = typeof lightTheme;
export type ThemeName = 'light' | 'dark';

export function getTheme(name: ThemeName): Theme {
  return name === 'dark' ? darkTheme : lightTheme;
}