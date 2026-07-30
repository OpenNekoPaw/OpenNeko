import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nekoTailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/neko-agent-webview/src/**/*.{ts,tsx}',
    '../../packages/neko-assets/src/resource-browser/**/*.{ts,tsx}',
    '../../packages/neko-canvas-webview/src/**/*.{ts,tsx}',
    '../../packages/neko-cut-webview/src/**/*.{ts,tsx}',
    '../../packages/neko-preview-webview/src/**/*.{ts,tsx}',
    '../../packages/neko-ui/src/**/*.{ts,tsx}',
    '../../packages/neko-types/src/components/**/*.{ts,tsx}',
    '../../packages/neko-types/src/icons/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
