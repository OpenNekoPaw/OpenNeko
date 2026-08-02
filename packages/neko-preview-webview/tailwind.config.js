import { nekoTailwindPreset } from '@neko/ui/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nekoTailwindPreset],
  content: [
    "./video.html",
    "./audio.html",
    "./pdf.html",
    "./cbz.html",
    "./epub.html",
    "./docx.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../neko-ui/src/**/*.{tsx,ts}",
  ],
  plugins: [],
}
