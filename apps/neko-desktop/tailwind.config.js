import { nekoTailwindPreset } from '@neko/ui/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nekoTailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/agent/webview/src/**/*.{ts,tsx}',
    '../../packages/assets/domain/src/resource-browser/**/*.{ts,tsx}',
    '../../packages/canvas/webview/src/**/*.{ts,tsx}',
    '../../packages/cut/webview/src/**/*.{ts,tsx}',
    '../../packages/preview/webview/src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/shared/src/icons/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
