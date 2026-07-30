import { describe, expect, it } from 'vitest';
import { PreviewFailureGate, previewFailureDiagnostic } from './previewFailureGate';

describe('PreviewFailureGate', () => {
  it('accepts only the first failure from one preview attempt', () => {
    const gate = new PreviewFailureGate();
    const attempt = gate.begin();

    expect(gate.accept(attempt)).toBe(true);
    expect(gate.accept(attempt)).toBe(false);
    expect(gate.accept(attempt)).toBe(false);
  });

  it('rejects stale callbacks and accepts a later user-started attempt', () => {
    const gate = new PreviewFailureGate();
    const staleAttempt = gate.begin();
    gate.invalidate();
    const currentAttempt = gate.begin();

    expect(gate.accept(staleAttempt)).toBe(false);
    expect(gate.accept(currentAttempt)).toBe(true);
  });

  it('maps every playback stage to an actionable diagnostic', () => {
    expect(previewFailureDiagnostic('video')).toEqual({ code: 'preview-video-failed' });
    expect(previewFailureDiagnostic('audio')).toEqual({ code: 'preview-audio-failed' });
    expect(previewFailureDiagnostic('synchronization')).toEqual({ code: 'preview-sync-failed' });
    expect(previewFailureDiagnostic('startup')).toEqual({ code: 'preview-start-failed' });
  });
});
