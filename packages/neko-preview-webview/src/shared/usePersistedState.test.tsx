// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface HarnessProps {
  onValue(value: number): void;
  nextValue?: number;
}

describe('usePersistedState', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    host?.remove();
    host = null;
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function loadHarness() {
    vi.resetModules();
    const { installMockWebviewWindow } = await import('@neko/shared/vscode/test-utils');
    const mockWindow = installMockWebviewWindow();
    const persisted = await import('./usePersistedState');

    function Harness({ onValue, nextValue }: HarnessProps) {
      const [page, setPage] = persisted.usePersistedState('currentPage', 1);

      useEffect(() => {
        onValue(page);
      }, [onValue, page]);

      useEffect(() => {
        if (nextValue !== undefined) {
          setPage(nextValue);
        }
      }, [nextValue, setPage]);

      return <div data-page={page} />;
    }

    return { ...persisted, Harness, mockWindow };
  }

  function mount(element: React.ReactElement): void {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(element);
    });
  }

  it('restores document state before mount and saves updates through the existing message contract', async () => {
    vi.useFakeTimers();
    const values: number[] = [];
    const { Harness, initPersistedStore, mockWindow } = await loadHarness();

    initPersistedStore({ currentPage: 3 });
    mount(<Harness nextValue={4} onValue={(value) => values.push(value)} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(values).toEqual([3, 4]);
    expect(mockWindow.api.postedMessages).toEqual([
      {
        type: 'document:saveState',
        payload: { currentPage: 4 },
      },
    ]);

    mockWindow.dispose();
  });
});
