/**
 * Built-in effects and transition presets (aligned with webview handlers).
 */

export const BUILT_IN_EFFECTS = {
  'gaussian-blur': {
    name: 'Gaussian Blur',
    category: 'blur',
    parameters: { radius: { type: 'number', min: 0, max: 100, default: 10 } },
  },
  'motion-blur': {
    name: 'Motion Blur',
    category: 'blur',
    parameters: {
      angle: { type: 'number', min: 0, max: 360, default: 0 },
      amount: { type: 'number', min: 0, max: 100, default: 20 },
    },
  },
  sharpen: {
    name: 'Sharpen',
    category: 'sharpen',
    parameters: { amount: { type: 'number', min: 0, max: 100, default: 50 } },
  },
  glow: {
    name: 'Glow',
    category: 'stylize',
    parameters: {
      radius: { type: 'number', min: 0, max: 50, default: 10 },
      intensity: { type: 'number', min: 0, max: 100, default: 50 },
    },
  },
  vignette: {
    name: 'Vignette',
    category: 'stylize',
    parameters: {
      amount: { type: 'number', min: 0, max: 100, default: 50 },
      softness: { type: 'number', min: 0, max: 100, default: 50 },
    },
  },
  'chroma-key': {
    name: 'Chroma Key',
    category: 'keying',
    parameters: {
      color: { type: 'color', default: '#00ff00' },
      tolerance: { type: 'number', min: 0, max: 100, default: 30 },
      softness: { type: 'number', min: 0, max: 100, default: 10 },
    },
  },
  'chromatic-aberration': {
    name: 'Chromatic Aberration',
    category: 'stylize',
    parameters: { amount: { type: 'number', min: 0, max: 50, default: 5 } },
  },
  'film-grain': {
    name: 'Film Grain',
    category: 'stylize',
    parameters: {
      amount: { type: 'number', min: 0, max: 100, default: 30 },
      size: { type: 'number', min: 1, max: 10, default: 2 },
    },
  },
} as const;

export const TRANSITION_PRESETS = {
  fade: { name: 'Fade', category: 'basic', defaultDuration: 0.5 },
  dissolve: { name: 'Dissolve', category: 'basic', defaultDuration: 0.5 },
  'slide-left': { name: 'Slide Left', category: 'slide', defaultDuration: 0.5 },
  'slide-right': { name: 'Slide Right', category: 'slide', defaultDuration: 0.5 },
  'slide-up': { name: 'Slide Up', category: 'slide', defaultDuration: 0.5 },
  'slide-down': { name: 'Slide Down', category: 'slide', defaultDuration: 0.5 },
  'zoom-in': { name: 'Zoom In', category: 'zoom', defaultDuration: 0.5 },
  'zoom-out': { name: 'Zoom Out', category: 'zoom', defaultDuration: 0.5 },
  'wipe-left': { name: 'Wipe Left', category: 'wipe', defaultDuration: 0.5 },
  'wipe-right': { name: 'Wipe Right', category: 'wipe', defaultDuration: 0.5 },
  'wipe-up': { name: 'Wipe Up', category: 'wipe', defaultDuration: 0.5 },
  'wipe-down': { name: 'Wipe Down', category: 'wipe', defaultDuration: 0.5 },
  'iris-in': { name: 'Iris In', category: 'iris', defaultDuration: 0.5 },
  'iris-out': { name: 'Iris Out', category: 'iris', defaultDuration: 0.5 },
  blur: { name: 'Blur', category: 'special', defaultDuration: 0.5 },
  pixelate: { name: 'Pixelate', category: 'special', defaultDuration: 0.5 },
  glitch: { name: 'Glitch', category: 'special', defaultDuration: 0.3 },
  'dip-to-black': { name: 'Dip to Black', category: 'dip', defaultDuration: 1.0 },
  'dip-to-white': { name: 'Dip to White', category: 'dip', defaultDuration: 1.0 },
} as const;
