import { describe, expect, it, vi } from 'vitest';
import { PreviewAudioContextOwner, previewAudioStartTime } from './previewAudioContext';

describe('PreviewAudioContextOwner', () => {
  it('reuses one user-gesture-started context across preview previewRequestIds', async () => {
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

  it('fails visibly when a previewRequestId connects before the playback gesture', async () => {
    const owner = new PreviewAudioContextOwner(vi.fn());

    await expect(owner.contextForConnection()).rejects.toThrow(
      'Cut preview AudioContext has not been activated by a user gesture.',
    );
  });
});

describe('previewAudioStartTime', () => {
  it('keeps a cold Web Audio start at least 50 ms ahead', () => {
    expect(
      previewAudioStartTime({
        currentTime: 2,
        baseLatency: 0.005,
        outputLatency: 0.005,
      } as AudioContext),
    ).toBeCloseTo(2.05);
  });

  it('includes reported device latency plus a scheduling margin', () => {
    expect(
      previewAudioStartTime({
        currentTime: 2,
        baseLatency: 0.04,
        outputLatency: 0.03,
      } as AudioContext),
    ).toBeCloseTo(2.09);
  });
});
