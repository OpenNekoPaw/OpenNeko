import { describe, expect, it, vi } from 'vitest';
import { PreviewRuntime } from './previewRuntime';

describe('PreviewRuntime', () => {
  it('cleans up stale variants when a source changes', () => {
    const runtime = new PreviewRuntime();
    const cleanup = vi.fn();

    runtime.setVariant('preview-1', { id: 'v1', role: 'image', runtimeUrl: 'blob:old' }, cleanup);
    runtime.setVariant('preview-1', { id: 'v2', role: 'image', runtimeUrl: 'blob:new' });

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(runtime.getVariant('preview-1')?.runtimeUrl).toBe('blob:new');
  });

  it('keeps playback single-active by stopping the previous item', () => {
    const runtime = new PreviewRuntime();
    const stopFirst = vi.fn();
    const stopSecond = vi.fn();

    runtime.startPlayback({ id: 'audio-1', kind: 'audio', stop: stopFirst });
    runtime.startPlayback({ id: 'video-1', kind: 'video', stop: stopSecond });

    expect(stopFirst).toHaveBeenCalledTimes(1);
    expect(stopSecond).not.toHaveBeenCalled();

    runtime.dispose();
    expect(stopSecond).toHaveBeenCalledTimes(1);
  });
});
