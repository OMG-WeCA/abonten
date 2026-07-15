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
} as const;

export const lightTheme = {
  primary: '#E4002B',
  primaryHover: '#C20028',
  background: '#FFFFFF',
  surface: '#F5F5F5',
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
  primary: '#FF1B45',
  primaryHover: '#E4002B',
  background: '#0A0A0A',
  surface: '#1F1F1F',
  foreground: '#FFFFFF',
  muted: '#9CA3AF',
  secondary: '#D1D5DB',
  border: '#374151',
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#DC2626',
  info: '#2563EB',
};

export type Theme = typeof lightTheme;
export type ThemeName = 'light' | 'dark';

export function getTheme(name: ThemeName): Theme {
  return name === 'dark' ? darkTheme : lightTheme;
}
