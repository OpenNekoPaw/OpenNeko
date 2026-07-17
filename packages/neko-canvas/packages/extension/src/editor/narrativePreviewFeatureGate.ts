import type { WorkspaceConfiguration } from 'vscode';
import {
  DEFAULT_NARRATIVE_PREVIEW_FEATURE_TOGGLES,
  normalizeNarrativePreviewFeatureToggles,
  type NarrativePreviewFeatureToggles,
} from '@neko/shared';

export const NARRATIVE_PREVIEW_CONFIG_SECTION = 'neko.canvas.narrative';

const NARRATIVE_PREVIEW_SETTING_KEYS = [
  'preview',
  'typewriterEffect',
  'autoExpressionMatch',
  'showLockedChoices',
  'previewAutoSync',
  'live2dPerformance',
] as const satisfies readonly (keyof NarrativePreviewFeatureToggles)[];

export interface NarrativePreviewConfigurationReader {
  get<T>(section: string, defaultValue: T): T;
}

export function readNarrativePreviewFeatureToggles(
  config: NarrativePreviewConfigurationReader | WorkspaceConfiguration,
): NarrativePreviewFeatureToggles {
  const overrides: Partial<NarrativePreviewFeatureToggles> = {};
  for (const key of NARRATIVE_PREVIEW_SETTING_KEYS) {
    overrides[key] = config.get(key, DEFAULT_NARRATIVE_PREVIEW_FEATURE_TOGGLES[key]);
  }
  return normalizeNarrativePreviewFeatureToggles(overrides);
}
