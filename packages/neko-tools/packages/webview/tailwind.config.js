import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nekoTailwindPreset],
  content: [
    "./mediaDiff.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../../neko-ui/src/**/*.{tsx,ts}",
  ],
  plugins: [],
}
