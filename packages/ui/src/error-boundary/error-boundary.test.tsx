// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapturedLogTransport, ConsoleLogger, LogLevel } from '@neko/shared';
import { WebviewErrorBoundary, createWebviewErrorBoundary } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('WebviewErrorBoundary', () => {
  let host: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let windowErrorHandler: (event: ErrorEvent) => void;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    windowErrorHandler = (event: ErrorEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('error', windowErrorHandler);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    window.removeEventListener('error', windowErrorHandler);
    consoleErrorSpy.mockRestore();
    host.remove();
  });

  it('logs render errors and shows an accessible default fallback', () => {
    const transport = new CapturedLogTransport();
    const logger = new ConsoleLogger('BoundaryTest', LogLevel.Debug, [transport]);

    act(() => {
      root.render(
        <WebviewErrorBoundary logger={logger}>
          <ThrowingComponent message="boom" />
        </WebviewErrorBoundary>,
      );
    });

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('boom');
    expect(transport.findByMessage('React render error captured by ErrorBoundary')).toMatchObject({
      source: 'BoundaryTest',
      level: LogLevel.Error,
    });
  });

  it('resets and renders children again when retry is clicked', () => {
    let shouldThrow = true;

    act(() => {
      root.render(
        <WebviewErrorBoundary>
          <MaybeThrowingComponent getShouldThrow={() => shouldThrow} />
        </WebviewErrorBoundary>,
      );
    });

    expect(host.textContent).toContain('Something went wrong');
    shouldThrow = false;
    act(() => {
      host.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(host.textContent).toContain('Recovered');
  });

  it('supports custom fallback render props and onError callbacks', () => {
    const onError = vi.fn();

    act(() => {
      root.render(
        <WebviewErrorBoundary
          onError={onError}
          fallback={({ error, reset }) => (
            <button type="button" onClick={reset}>
              Custom: {error.message}
            </button>
          )}
        >
          <ThrowingComponent message="custom boom" />
        </WebviewErrorBoundary>,
      );
    });

    expect(host.textContent).toBe('Custom: custom boom');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('creates package-bound wrappers with default props', () => {
    const PackageBoundary = createWebviewErrorBoundary({
      title: 'Preview failed',
      retryLabel: 'Reload preview',
    });

    act(() => {
      root.render(
        <PackageBoundary>
          <ThrowingComponent message="missing media" />
        </PackageBoundary>,
      );
    });

    expect(host.textContent).toContain('Preview failed');
    expect(host.textContent).toContain('Reload preview');
  });
});

function ThrowingComponent({ message }: { readonly message: string }): React.ReactElement {
  throw new Error(message);
}

function MaybeThrowingComponent({
  getShouldThrow,
}: {
  readonly getShouldThrow: () => boolean;
}): React.ReactElement {
  if (getShouldThrow()) {
    throw new Error('before recovery');
  }
  return <div>Recovered</div>;
}
