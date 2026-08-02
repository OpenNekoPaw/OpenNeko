import { nekoTailwindPreset } from '@neko/ui/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nekoTailwindPreset],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '../../ui/src/**/*.{tsx,ts}'],
  plugins: [],
};
