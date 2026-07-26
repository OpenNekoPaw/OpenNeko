import { describe, expect, it, vi } from 'vitest';
import { PreviewAudioContextOwner } from './previewAudioContext';

describe('PreviewAudioContextOwner', () => {
  it('reuses one user-gesture-started context across preview generations', async () => {
    const input = { connect: vi.fn(), disconnect: vi.fn() };
    const limiter = {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const context = {
      state: 'suspended',
      destination: {},
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createGain: vi.fn(() => input),
      createDynamicsCompressor: vi.fn(() => limiter),
    } as unknown as AudioContext;
    const factory = vi.fn(() => context);
    const owner = new PreviewAudioContextOwner(factory);

    owner.activateFromUserGesture();
    expect(await owner.contextForConnection()).toBe(context);
    expect(await owner.contextForConnection()).toBe(context);
    expect(factory).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.close).not.toHaveBeenCalled();
    expect(await owner.mixDestinationForConnection()).toBe(input);
    expect(await owner.mixDestinationForConnection()).toBe(input);
    expect(context.createGain).toHaveBeenCalledOnce();
    expect(context.createDynamicsCompressor).toHaveBeenCalledOnce();
    expect(limiter.threshold.value).toBe(-1);
    expect(limiter.ratio.value).toBe(20);

    await owner.dispose();
    expect(input.disconnect).toHaveBeenCalledOnce();
    expect(limiter.disconnect).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('fails visibly when a generation connects before the playback gesture', async () => {
    const owner = new PreviewAudioContextOwner(vi.fn());

    await expect(owner.contextForConnection()).rejects.toThrow(
      'Cut preview AudioContext has not been activated by a user gesture.',
    );
  });
});
