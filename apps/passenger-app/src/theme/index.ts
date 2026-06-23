import { colors, font, radius, shadow } from '@higo/brand-tokens';

export const theme = {
  colors,
  font,
  radius,
  shadow,
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
};

export type Theme = typeof theme;
