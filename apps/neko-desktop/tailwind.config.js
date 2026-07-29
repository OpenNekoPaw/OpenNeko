import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nekoTailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/neko-agent/packages/webview/src/**/*.{ts,tsx}',
    '../../packages/neko-assets/src/resource-browser/**/*.{ts,tsx}',
    '../../packages/neko-canvas/packages/webview/src/**/*.{ts,tsx}',
    '../../packages/neko-cut/packages/webview/src/**/*.{ts,tsx}',
    '../../packages/neko-preview/packages/webview/src/**/*.{ts,tsx}',
    '../../packages/neko-ui/src/**/*.{ts,tsx}',
    '../../packages/neko-types/src/components/**/*.{ts,tsx}',
    '../../packages/neko-types/src/icons/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
