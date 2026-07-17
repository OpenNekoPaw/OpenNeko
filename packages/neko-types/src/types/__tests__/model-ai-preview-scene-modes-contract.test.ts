import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/model-ai-preview-scene-modes-v1.json';
import {
  DEFAULT_CHARACTER_PREVIEW_MODE_DESCRIPTORS,
  isCharacterPreviewCameraResetPayload,
  isCharacterPreviewModeId,
  isCharacterPreviewModeRequestPayload,
  isCharacterPreviewModeStatePayload,
  isCharacterPreviewPlaybackCommandPayload,
  readCharacterPreviewFrameAlignment,
} from '../model-ai-preview-scene-modes';

describe('model AI preview scene mode contracts', () => {
  it('defines the four initial semantic preview modes', () => {
    expect(DEFAULT_CHARACTER_PREVIEW_MODE_DESCRIPTORS.map((mode) => mode.id)).toEqual([
      'face',
      'full-body',
      'motion',
      'voice-pack',
    ]);
    expect(
      DEFAULT_CHARACTER_PREVIEW_MODE_DESCRIPTORS.every((mode) => isCharacterPreviewModeId(mode.id)),
    ).toBe(true);
  });

  it('validates request, camera reset, playback command, and state payloads', () => {
    expect(isCharacterPreviewModeRequestPayload(fixture.request)).toBe(true);
    expect(isCharacterPreviewCameraResetPayload(fixture.cameraReset)).toBe(true);
    expect(isCharacterPreviewPlaybackCommandPayload(fixture.playbackCommand)).toBe(true);
    expect(isCharacterPreviewModeStatePayload(fixture.state)).toBe(true);
    expect(fixture.states.map((state) => state.modeId)).toEqual([
      'face',
      'full-body',
      'motion',
      'voice-pack',
    ]);
    expect(fixture.states.every(isCharacterPreviewModeStatePayload)).toBe(true);
    expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
  });

  it('rejects unknown preview modes and malformed diagnostics', () => {
    expect(
      isCharacterPreviewModeRequestPayload({
        ...fixture.request,
        modeId: 'profile',
      }),
    ).toBe(false);
    expect(
      isCharacterPreviewModeStatePayload({
        ...fixture.state,
        diagnostics: [{ code: 'surprise', severity: 'warning' }],
      }),
    ).toBe(false);
  });

  it('reads preview frame alignment from render metadata', () => {
    expect(readCharacterPreviewFrameAlignment(fixture.frameMeta)).toEqual({
      activePreviewMode: 'voice-pack',
      previewPlaybackClockMs: 120,
    });
    expect(readCharacterPreviewFrameAlignment({ activePreviewMode: 'profile' })).toEqual({
      activePreviewMode: undefined,
      previewPlaybackClockMs: undefined,
    });
  });
});
