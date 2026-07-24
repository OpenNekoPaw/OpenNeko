import { describe, expect, it, vi } from 'vitest';
import { PreviewAudioContextOwner } from './previewAudioContext';

describe('PreviewAudioContextOwner', () => {
  it('reuses one user-gesture-started context across preview generations', async () => {
    const context = {
      state: 'suspended',
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    } as unknown as AudioContext;
    const factory = vi.fn(() => context);
    const owner = new PreviewAudioContextOwner(factory);

    owner.activateFromUserGesture();
    expect(await owner.contextForConnection()).toBe(context);
    expect(await owner.contextForConnection()).toBe(context);
    expect(factory).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.close).not.toHaveBeenCalled();

    await owner.dispose();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('fails visibly when a generation connects before the playback gesture', async () => {
    const owner = new PreviewAudioContextOwner(vi.fn());

    await expect(owner.contextForConnection()).rejects.toThrow(
      'Cut preview AudioContext has not been activated by a user gesture.',
    );
  });
});
