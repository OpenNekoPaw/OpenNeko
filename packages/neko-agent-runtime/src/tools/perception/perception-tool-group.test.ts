import { describe, expect, it } from 'vitest';
import { TOOL_NAMES_PERCEPTION } from '@neko/shared';
import { perceptionToolGroup } from './perception-tool-group';

describe('perceptionToolGroup', () => {
  it('declares perception tools as lazy optional evidence providers', () => {
    expect(perceptionToolGroup).toEqual(
      expect.objectContaining({
        name: 'perception-evidence',
        tools: [
          TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT,
          TOOL_NAMES_PERCEPTION.PERCEIVE,
          TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE,
          TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY,
          TOOL_NAMES_PERCEPTION.IMAGE_CLASSIFY,
          TOOL_NAMES_PERCEPTION.VIDEO_DETECT_SHOTS,
        ],
        alwaysActive: false,
        loadingTier: 'lazy',
        enabled: true,
      }),
    );
  });
});
