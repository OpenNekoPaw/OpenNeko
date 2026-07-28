// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopShellProjection } from '../shared/shell-contract';
import { DesktopApplication } from './DesktopShell';

describe('DesktopApplication', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('owns exactly one Shell subscription while mounted under React StrictMode', async () => {
    const projection = createProjection();
    let activeSubscriptions = 0;
    const subscribe = vi.fn(() => {
      activeSubscriptions += 1;
      return () => {
        activeSubscriptions -= 1;
      };
    });
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        bootstrap: { get: vi.fn() },
        lifecycle: { subscribe: vi.fn(() => () => undefined) },
        shell: {
          getSnapshot: vi.fn(async () => projection),
          subscribe,
        },
        projects: {
          openContent: vi.fn(),
          requestProfile: vi.fn(),
        },
        tabs: {
          activateHome: vi.fn(),
          activate: vi.fn(),
          close: vi.fn(),
        },
      } satisfies typeof window.openNekoDesktop,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <DesktopApplication />
        </StrictMode>,
      );
    });

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(activeSubscriptions).toBe(1);
    expect(container.textContent).toContain('Projects');

    await act(async () => root.unmount());
    expect(activeSubscriptions).toBe(0);
    container.remove();
  });
});

function createProjection(): DesktopShellProjection {
  return {
    schemaVersion: 1,
    applicationInstanceId: 'app-1',
    endpointEpoch: 'app-1:window-1:1',
    projectionRevision: 1,
    catalog: {
      revision: 0,
      projects: [],
    },
    window: {
      windowId: 'window-1',
      revision: 0,
      activeTarget: { kind: 'home' },
      tabs: [],
    },
    attention: {
      needsInput: 0,
      needsReview: 0,
      running: 0,
    },
    domains: [],
  };
}
