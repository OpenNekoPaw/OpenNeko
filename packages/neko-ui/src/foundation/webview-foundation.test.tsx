// @vitest-environment jsdom

import { act, Component } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MissingWebviewFoundationError,
  WebviewFoundationProvider,
  createWebviewFoundation,
  useOptionalWebviewFoundation,
  useWebviewFoundation,
} from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('WebviewFoundationProvider', () => {
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

  it('provides host foundation context to package roots', () => {
    const foundation = createWebviewFoundation({
      hostKind: 'electron',
      runtimeId: 'neko.agent.webview.electron',
      locale: 'zh-cn',
      theme: { kind: 'light', tokens: { '--vscode-editor-background': '#ffffff' } },
    });

    act(() => {
      root.render(
        <WebviewFoundationProvider value={foundation}>
          <FoundationConsumer />
        </WebviewFoundationProvider>,
      );
    });

    expect(host.textContent).toBe('electron:neko.agent.webview.electron:zh-cn:light');
  });

  it('fails visibly when a strict package consumer has no host foundation', () => {
    act(() => {
      root.render(
        <CaptureFoundationError>
          <FoundationConsumer />
        </CaptureFoundationError>,
      );
    });

    expect(host.querySelector('[data-testid="foundation-error"]')?.textContent).toBe(
      'MissingWebviewFoundationError',
    );
  });

  it('lets package roots detect an existing host foundation without creating a duplicate', () => {
    const foundation = createWebviewFoundation({
      hostKind: 'vscode',
      runtimeId: 'neko.agent.webview.vscode',
      locale: 'en',
      theme: { kind: 'dark' },
    });

    act(() => {
      root.render(
        <WebviewFoundationProvider value={foundation}>
          <OptionalFoundationConsumer />
        </WebviewFoundationProvider>,
      );
    });

    expect(host.textContent).toBe('neko.agent.webview.vscode');
  });
});

function FoundationConsumer(): ReactElement {
  const foundation = useWebviewFoundation();
  return (
    <span>
      {foundation.hostKind}:{foundation.runtimeId}:{foundation.locale}:{foundation.theme.kind}
    </span>
  );
}

function OptionalFoundationConsumer(): ReactElement {
  const foundation = useOptionalWebviewFoundation();
  return <span>{foundation?.runtimeId ?? 'missing'}</span>;
}

class CaptureFoundationError extends Component<
  { readonly children: ReactNode },
  { readonly errorName?: string }
> {
  override readonly state: { readonly errorName?: string } = {};

  static getDerivedStateFromError(error: unknown): { readonly errorName: string } {
    return {
      errorName:
        error instanceof MissingWebviewFoundationError
          ? 'MissingWebviewFoundationError'
          : 'UnknownError',
    };
  }

  override render(): ReactNode {
    if (this.state.errorName) {
      return <span data-testid="foundation-error">{this.state.errorName}</span>;
    }
    return this.props.children;
  }
}
