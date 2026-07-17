import { describe, expect, it } from 'vitest';
import { readNarrativePreviewFeatureToggles } from './narrativePreviewFeatureGate';

describe('readNarrativePreviewFeatureToggles', () => {
  it('normalizes all Canvas Narrative Preview settings with shared defaults', () => {
    const settings = new Map<string, boolean>([
      ['preview', false],
      ['typewriterEffect', false],
      ['previewAutoSync', false],
      ['live2dPerformance', true],
    ]);

    const toggles = readNarrativePreviewFeatureToggles({
      get: (section, defaultValue) => settings.get(section) ?? defaultValue,
    });

    expect(toggles).toEqual({
      preview: false,
      typewriterEffect: false,
      autoExpressionMatch: true,
      showLockedChoices: true,
      previewAutoSync: false,
      live2dPerformance: true,
    });
  });
});
