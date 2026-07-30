// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInteractionRenderMode } from './useInteractionRenderMode';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useInteractionRenderMode', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('exits shell mode after the maximum shell duration', () => {
    act(() => {
      root.render(<ModeHarness requestedMode="shell" maxShellDurationMs={25} />);
    });

    expect(host.textContent).toBe('shell');

    act(() => {
      vi.advanceTimersByTime(25);
    });

    expect(host.textContent).toBe('full');
  });
});

function ModeHarness({
  requestedMode,
  maxShellDurationMs,
}: {
  requestedMode: 'full' | 'shell';
  maxShellDurationMs: number;
}) {
  const mode = useInteractionRenderMode({ requestedMode, maxShellDurationMs });
  return <div>{mode}</div>;
}
