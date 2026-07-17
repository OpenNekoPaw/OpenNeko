// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VSCodeAPI } from '../vscode/types';
import {
  normalizeResizeState,
  readPersistedResizeState,
  usePersistedResize,
  type PersistedResizeReturn,
  writePersistedResizeState,
} from './useResizable';

describe('persisted resize state helpers', () => {
  it('restores a persisted panel size', () => {
    const state = {
      'neko.resizeState': {
        'model.rightDock': { size: 320, collapsed: false },
      },
    };

    expect(
      readPersistedResizeState(state, 'model.rightDock', 280, {
        minSize: 200,
        maxSize: 400,
      }),
    ).toEqual({
      size: 320,
      collapsed: false,
    });
  });

  it('clamps invalid persisted sizes to configured bounds', () => {
    expect(
      normalizeResizeState({ size: 120, collapsed: false }, 280, {
        minSize: 200,
        maxSize: 400,
      }),
    ).toEqual({
      size: 200,
      collapsed: false,
    });

    expect(
      normalizeResizeState({ size: 480, collapsed: false }, 280, {
        minSize: 200,
        maxSize: 400,
      }),
    ).toEqual({
      size: 400,
      collapsed: false,
    });
  });

  it('persists collapsed state', () => {
    expect(
      normalizeResizeState({ size: 260, collapsed: true }, 280, {
        minSize: 200,
        maxSize: 400,
      }),
    ).toEqual({
      size: 260,
      collapsed: true,
    });
  });

  it('keeps multiple panel ids independent in one Webview state object', () => {
    const first = writePersistedResizeState(undefined, 'model.rightDock', {
      size: 320,
      collapsed: false,
    });
    const second = writePersistedResizeState(first, 'model.timeline', {
      size: 180,
      collapsed: true,
    });

    expect(readPersistedResizeState(second, 'model.rightDock', 280)).toEqual({
      size: 320,
      collapsed: false,
    });
    expect(readPersistedResizeState(second, 'model.timeline', 140)).toEqual({
      size: 180,
      collapsed: true,
    });
  });
});

describe('usePersistedResize hook persistence', () => {
  let host: HTMLDivElement;
  let root: Root;
  let latest: PersistedResizeReturn | null;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    latest = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.useRealTimers();
    host.remove();
  });

  it('debounces persisted size writes and keeps the latest size', () => {
    const api = createStateApi();

    renderHarness(api, { persistDebounceMs: 50 });

    act(() => {
      latest?.setSize(310);
      latest?.setSize(320);
      latest?.setSize(330);
    });

    expect(api.setState).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(49);
    });
    expect(api.setState).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(api.setState).toHaveBeenCalledTimes(1);
    expect(readPersistedResizeState(api.getState(), 'model.rightDock', 280)).toEqual({
      size: 330,
      collapsed: false,
    });
  });

  it('persists collapsed changes immediately', () => {
    const api = createStateApi();

    renderHarness(api, { persistDebounceMs: 50 });

    act(() => {
      latest?.setSize(320);
      latest?.setCollapsed(true);
    });

    expect(api.setState).toHaveBeenCalledTimes(1);
    expect(readPersistedResizeState(api.getState(), 'model.rightDock', 280)).toEqual({
      size: 320,
      collapsed: true,
    });
  });

  function renderHarness(
    api: Pick<VSCodeAPI, 'getState' | 'setState'>,
    options: { persistDebounceMs: number },
  ): void {
    function Harness() {
      latest = usePersistedResize(
        'model.rightDock',
        280,
        { minSize: 200, maxSize: 400 },
        { api, persistDebounceMs: options.persistDebounceMs },
      );

      useEffect(() => {
        return () => {
          latest = null;
        };
      }, []);

      return null;
    }

    act(() => {
      root.render(React.createElement(Harness));
    });
  }
});

function createStateApi(): Pick<VSCodeAPI, 'getState' | 'setState'> & {
  setState: ReturnType<typeof vi.fn<[unknown], void>>;
} {
  let state: unknown;
  return {
    getState: () => state,
    setState: vi.fn((nextState: unknown) => {
      state = nextState;
    }),
  };
}
