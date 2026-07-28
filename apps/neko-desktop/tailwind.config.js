import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nekoTailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/neko-ui/src/**/*.{ts,tsx}',
    '../../packages/neko-types/src/icons/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
