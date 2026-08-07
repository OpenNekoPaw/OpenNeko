// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import { createDesktopI18n } from './i18n';
import {
  DesktopRootErrorBoundary,
  DesktopSurfaceErrorBoundary,
} from './DesktopSurfaceErrorBoundary';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('Desktop render error containment', () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    consoleError.mockRestore();
    container.remove();
  });

  it('keeps sibling Desktop surfaces mounted when one surface throws', () => {
    const i18n = createDesktopI18n('en');
    act(() => {
      root.render(
        <I18nProvider service={i18n.i18nService}>
          <div data-testid="primary-sidebar">Sidebar</div>
          <div data-testid="sibling-surface">Sibling</div>
          <DesktopSurfaceErrorBoundary surfaceIdentity="workspace-1:main">
            <ThrowingSurface />
          </DesktopSurfaceErrorBoundary>
        </I18nProvider>,
      );
    });

    expect(container.querySelector('[data-testid="primary-sidebar"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sibling-surface"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'This panel could not be displayed',
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('surface failed');
  });

  it('shows a visible root diagnostic when the application tree throws', () => {
    act(() => {
      root.render(
        <DesktopRootErrorBoundary
          title="Desktop failed"
          description="Unexpected render failure."
          retryLabel="Retry"
        >
          <ThrowingSurface />
        </DesktopRootErrorBoundary>,
      );
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Desktop failed');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('surface failed');
    expect(container.querySelector('button')?.textContent).toBe('Retry');
  });
});

function ThrowingSurface(): JSX.Element {
  throw new Error('surface failed');
}
