import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VrmAvatarSurface, type VrmAvatarRuntime } from './vrm-avatar-surface';

const descriptor = {
  avatarResourceLeaseId: 'avatar-lease-a',
  characterRunId: 'character-run-a',
  representationId: 'avatar-a',
  kind: 'vrm' as const,
  url: 'openneko://resource/avatar-a',
  displayName: 'avatar.vrm',
  mediaType: 'model/gltf-binary' as const,
  byteLength: 128,
  sourceFingerprint: '1:128',
};

describe('VrmAvatarSurface', () => {
  it('consumes exact Voice timing and disposes one runtime on unmount', async () => {
    const runtime: VrmAvatarRuntime = {
      setVoiceTiming: vi.fn(),
      dispose: vi.fn(),
    };
    const createRuntime = vi.fn(async () => runtime);
    const timing = {
      turnId: 'turn-a',
      audioRef: 'asset:audio-a',
      visemes: [{ offsetMs: 0, durationMs: 80, value: 'A' }],
    };
    const view = render(
      <VrmAvatarSurface
        createRuntime={createRuntime}
        descriptor={descriptor}
        voiceTiming={timing}
      />,
    );
    await act(async () => Promise.resolve());

    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(runtime.setVoiceTiming).toHaveBeenCalledWith(timing);
    expect(view.container.querySelectorAll('[data-character-vrm-runtime="true"]')).toHaveLength(1);
    view.unmount();
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
  });
});
