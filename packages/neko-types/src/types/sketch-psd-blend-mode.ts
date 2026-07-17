import type { SketchBlendMode } from './blendMode';
import type { PsdImportIssue } from './sketch-psd-import';

export interface PsdBlendModeMapping {
  readonly blendMode: SketchBlendMode;
  readonly issue?: PsdImportIssue;
}

const PSD_TO_SKETCH_BLEND_MODE: Readonly<Record<string, SketchBlendMode>> = {
  // Raw PSD four-character keys.
  norm: 'normal',
  'mul ': 'multiply',
  scrn: 'screen',
  over: 'overlay',
  sLit: 'soft-light',
  hLit: 'hard-light',
  dark: 'darken',
  lite: 'lighten',
  diff: 'difference',
  smud: 'exclusion',
  cDdg: 'color-dodge',
  cBrn: 'color-burn',
  cbrn: 'color-burn',
  // ag-psd normalized BlendMode strings.
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  'soft light': 'soft-light',
  'hard light': 'hard-light',
  darken: 'darken',
  lighten: 'lighten',
  difference: 'difference',
  exclusion: 'exclusion',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
};

const EXPLICIT_FALLBACK_BLEND_MODES = new Set([
  // Raw PSD four-character keys.
  'diss',
  'pass',
  'lddg',
  'lbrn',
  'pLit',
  'vLit',
  'lLit',
  'pinL',
  'hMix',
  'fsub',
  'fdiv',
  'hue ',
  'sat ',
  'colr',
  'lum ',
  // ag-psd normalized BlendMode strings.
  'pass through',
  'dissolve',
  'linear burn',
  'darker color',
  'linear dodge',
  'lighter color',
  'vivid light',
  'linear light',
  'pin light',
  'hard mix',
  'subtract',
  'divide',
  'hue',
  'saturation',
  'color',
  'luminosity',
]);

const PSD_GROUP_PASS_THROUGH_BLEND_MODES = new Set(['pass', 'pass through']);

export const KNOWN_PSD_BLEND_MODES = Object.freeze([
  ...Object.keys(PSD_TO_SKETCH_BLEND_MODE),
  ...EXPLICIT_FALLBACK_BLEND_MODES,
]);

export function isPsdGroupPassThroughBlendMode(psdBlendMode: string): boolean {
  return PSD_GROUP_PASS_THROUGH_BLEND_MODES.has(psdBlendMode);
}

export function mapPsdBlendMode(
  psdBlendMode: string,
  layerPath: readonly string[],
): PsdBlendModeMapping {
  const mapped = PSD_TO_SKETCH_BLEND_MODE[psdBlendMode];
  if (mapped) {
    return { blendMode: mapped };
  }

  return {
    blendMode: 'normal',
    issue: {
      code: 'unsupported-blend-mode',
      severity: 'warning',
      message: EXPLICIT_FALLBACK_BLEND_MODES.has(psdBlendMode)
        ? `PSD blend mode "${psdBlendMode}" is not supported by neko-sketch and was mapped to normal.`
        : `Unknown PSD blend mode "${psdBlendMode}" was mapped to normal.`,
      layerPath,
    },
  };
}
