import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nekoTailwindPreset],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../../neko-types/src/components/**/*.{tsx,ts}",
    "../../../neko-ui/src/**/*.{tsx,ts}",
  ],
  plugins: [],
}
