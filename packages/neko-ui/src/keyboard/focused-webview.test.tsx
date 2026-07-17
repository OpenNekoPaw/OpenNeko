// @vitest-environment jsdom

import React, { useRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useFocusedWebviewRoot,
  useReportWebviewKeyboardEditable,
  useReportWebviewKeyboardFocus,
  type WebviewKeyboardEditableReporter,
  type WebviewKeyboardFocusReporter,
} from './focused-webview';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useFocusedWebviewRoot', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeAttribute('data-neko-keyboard-focused');
    host.remove();
  });

  it('syncs keyboard focus metadata to the root and body for portal-owned affordances', () => {
    act(() => {
      root.render(<FocusedRootHarness defaultFocused={false} />);
    });

    const shell = host.querySelector<HTMLElement>('[data-testid="keyboard-root"]');
    expect(shell?.getAttribute('data-neko-keyboard-focused')).toBe('false');
    expect(document.body.getAttribute('data-neko-keyboard-focused')).toBe('false');

    act(() => {
      host.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(shell?.getAttribute('data-neko-keyboard-focused')).toBe('true');
    expect(document.body.getAttribute('data-neko-keyboard-focused')).toBe('true');
  });

  it('restores local root focus immediately when the user interacts with the webview', () => {
    act(() => {
      root.render(<FocusedRootHarness defaultFocused={true} />);
    });

    act(() => {
      host.querySelector<HTMLButtonElement>('button[data-action="blur"]')?.click();
    });
    const shell = host.querySelector<HTMLElement>('[data-testid="keyboard-root"]');
    expect(shell?.getAttribute('data-neko-keyboard-focused')).toBe('false');

    act(() => {
      shell?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });

    expect(shell?.getAttribute('data-neko-keyboard-focused')).toBe('true');
    expect(document.body.getAttribute('data-neko-keyboard-focused')).toBe('true');
  });

  it('releases an active text input when the user clicks a keyboard boundary outside it', () => {
    act(() => {
      root.render(<FocusedRootWithEditableHarness />);
    });

    const input = host.querySelector<HTMLInputElement>('input[data-testid="editable-input"]');
    const viewport = host.querySelector<HTMLElement>('[data-testid="viewport-boundary"]');

    act(() => {
      input?.focus();
    });
    expect(document.activeElement).toBe(input);

    act(() => {
      viewport?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });

    expect(document.activeElement).toBe(viewport);
  });

  it('focuses a custom keyboard boundary when the user clicks its non-focusable child', () => {
    act(() => {
      root.render(<FocusedRootWithEditableHarness />);
    });

    const input = host.querySelector<HTMLInputElement>('input[data-testid="editable-input"]');
    const container = host.querySelector<HTMLElement>('[data-testid="container-boundary"]');
    const containerTitle = host.querySelector<HTMLElement>('[data-testid="container-title"]');

    act(() => {
      input?.focus();
    });
    expect(document.activeElement).toBe(input);

    act(() => {
      containerTitle?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });

    expect(document.activeElement).toBe(container);
  });

  it('keeps focus inside the same text input when the user clicks it again', () => {
    act(() => {
      root.render(<FocusedRootWithEditableHarness />);
    });

    const input = host.querySelector<HTMLInputElement>('input[data-testid="editable-input"]');

    act(() => {
      input?.focus();
    });
    act(() => {
      input?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });

    expect(document.activeElement).toBe(input);
  });

  it('does not steal focus from another editable pointer target', () => {
    act(() => {
      root.render(<FocusedRootWithEditableHarness />);
    });

    const input = host.querySelector<HTMLInputElement>('input[data-testid="editable-input"]');
    const nextInput = host.querySelector<HTMLInputElement>('input[data-testid="next-input"]');

    act(() => {
      input?.focus();
    });
    act(() => {
      nextInput?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      nextInput?.focus();
    });

    expect(document.activeElement).toBe(nextInput);
  });

  it('lets native focus controls handle pointer focus themselves', () => {
    act(() => {
      root.render(<FocusedRootWithEditableHarness />);
    });

    const input = host.querySelector<HTMLInputElement>('input[data-testid="editable-input"]');
    const button = host.querySelector<HTMLButtonElement>('button[data-testid="native-button"]');

    act(() => {
      input?.focus();
    });
    act(() => {
      button?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      button?.focus();
    });

    expect(document.activeElement).toBe(button);
  });

  it('reports Webview-side keyboard focus ownership changes to the host', () => {
    const reporter: WebviewKeyboardFocusReporter = {
      postMessage: vi.fn(),
    };

    act(() => {
      root.render(<ReportFocusHarness reporter={reporter} />);
    });

    const shell = host.querySelector<HTMLElement>('[data-testid="report-root"]');
    act(() => {
      shell?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardFocus',
      focused: true,
    });
    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardFocus',
      focused: false,
    });
  });

  it('reports focus ownership even when the root ref is attached after the effect runs', () => {
    const reporter: WebviewKeyboardFocusReporter = {
      postMessage: vi.fn(),
    };

    act(() => {
      root.render(<DelayedReportFocusHarness reporter={reporter} />);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>('button')?.click();
    });

    const shell = host.querySelector<HTMLElement>('[data-testid="delayed-report-root"]');
    act(() => {
      shell?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });

    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardFocus',
      focused: true,
    });
  });

  it('uses the latest focus reporter without re-registering listeners', () => {
    const firstReporter: WebviewKeyboardFocusReporter = {
      postMessage: vi.fn(),
    };
    const secondReporter: WebviewKeyboardFocusReporter = {
      postMessage: vi.fn(),
    };

    act(() => {
      root.render(<ReportFocusHarness reporter={firstReporter} />);
    });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    vi.mocked(firstReporter.postMessage).mockClear();
    act(() => {
      root.render(<ReportFocusHarness reporter={secondReporter} />);
    });
    const shell = host.querySelector<HTMLElement>('[data-testid="report-root"]');
    act(() => {
      shell?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });

    expect(firstReporter.postMessage).not.toHaveBeenCalled();
    expect(secondReporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardFocus',
      focused: true,
    });
  });

  it('uses the latest editable reporter without re-registering listeners', () => {
    const firstReporter: WebviewKeyboardEditableReporter = {
      postMessage: vi.fn(),
    };
    const secondReporter: WebviewKeyboardEditableReporter = {
      postMessage: vi.fn(),
    };

    act(() => {
      root.render(<ReportEditableHarness reporter={firstReporter} />);
    });
    act(() => {
      host.querySelector<HTMLInputElement>('input')?.focus();
    });
    vi.mocked(firstReporter.postMessage).mockClear();
    act(() => {
      root.render(<ReportEditableHarness reporter={secondReporter} />);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>('button')?.focus();
    });

    expect(firstReporter.postMessage).not.toHaveBeenCalled();
    expect(secondReporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardEditable',
      editable: false,
    });
  });

  it('reports whether keyboard focus is inside an editable target', () => {
    const reporter: WebviewKeyboardEditableReporter = {
      postMessage: vi.fn(),
    };

    act(() => {
      root.render(<ReportEditableHarness reporter={reporter} />);
    });

    const input = host.querySelector<HTMLInputElement>('input');
    const button = host.querySelector<HTMLButtonElement>('button');
    act(() => {
      input?.focus();
    });
    act(() => {
      button?.focus();
    });

    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardEditable',
      editable: true,
    });
    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardEditable',
      editable: false,
    });
  });

  it('clears editable ownership when the webview window loses focus', () => {
    const reporter: WebviewKeyboardEditableReporter = {
      postMessage: vi.fn(),
    };

    act(() => {
      root.render(<ReportEditableHarness reporter={reporter} />);
    });

    act(() => {
      host.querySelector<HTMLInputElement>('input')?.focus();
    });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardEditable',
      editable: true,
    });
    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardEditable',
      editable: false,
    });
  });

  it('clears editable ownership when the webview page is hidden', () => {
    const reporter: WebviewKeyboardEditableReporter = {
      postMessage: vi.fn(),
    };

    act(() => {
      root.render(<ReportEditableHarness reporter={reporter} />);
    });

    act(() => {
      host.querySelector<HTMLInputElement>('input')?.focus();
    });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardEditable',
      editable: true,
    });
    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardEditable',
      editable: false,
    });
  });

  it('reports editable pointer state for role textbox and Neko text-input scoped targets', () => {
    const reporter: WebviewKeyboardEditableReporter = {
      postMessage: vi.fn(),
    };

    act(() => {
      root.render(<ReportEditableHarness reporter={reporter} />);
    });

    act(() => {
      host
        .querySelector<HTMLElement>('[data-testid="role-textbox"]')
        ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    act(() => {
      host
        .querySelector<HTMLElement>('[data-testid="scope-text-input"]')
        ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });

    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardEditable',
      editable: true,
    });
  });

  it('cancels deferred editable checks on unmount', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const reporter: WebviewKeyboardEditableReporter = {
      postMessage: vi.fn(),
    };

    try {
      act(() => {
        root.render(<ReportEditableHarness reporter={reporter} />);
      });

      const input = host.querySelector<HTMLInputElement>('input');
      act(() => {
        input?.focus();
      });
      act(() => {
        input?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      });
      act(() => {
        root.unmount();
      });
      act(() => {
        vi.runOnlyPendingTimers();
      });

      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      clearTimeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('releases stale editable focus after a non-focusable pointer target is clicked', () => {
    vi.useFakeTimers();
    const reporter: WebviewKeyboardEditableReporter = {
      postMessage: vi.fn(),
    };

    try {
      act(() => {
        root.render(<ReportEditableHarness reporter={reporter} />);
      });

      const input = host.querySelector<HTMLInputElement>('input');
      const surface = host.querySelector<HTMLElement>('[data-testid="non-focusable-surface"]');
      act(() => {
        input?.focus();
      });
      expect(document.activeElement).toBe(input);

      act(() => {
        surface?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      });
      expect(document.activeElement).toBe(input);

      act(() => {
        vi.runOnlyPendingTimers();
      });

      expect(document.activeElement).not.toBe(input);
      expect(reporter.postMessage).toHaveBeenCalledWith({
        type: 'webviewKeyboardEditable',
        editable: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

function FocusedRootHarness({
  defaultFocused,
}: {
  readonly defaultFocused: boolean;
}): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const { setKeyboardFocused } = useFocusedWebviewRoot(rootRef, defaultFocused);

  return (
    <div ref={rootRef} data-testid="keyboard-root">
      <button type="button" data-action="focus" onClick={() => setKeyboardFocused(true)}>
        Focus
      </button>
      <button type="button" data-action="blur" onClick={() => setKeyboardFocused(false)}>
        Blur
      </button>
    </div>
  );
}

function FocusedRootWithEditableHarness(): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusedWebviewRoot(rootRef, true);

  return (
    <div ref={rootRef} data-testid="keyboard-root" tabIndex={-1}>
      <input data-testid="editable-input" type="text" />
      <div data-testid="viewport-boundary" data-neko-keyboard-scope="viewport" tabIndex={-1}>
        Canvas surface
      </div>
      <div data-testid="container-boundary" data-neko-keyboard-scope="container" tabIndex={0}>
        <span data-testid="container-title">Container title</span>
      </div>
      <input data-testid="next-input" type="text" />
      <button data-testid="native-button" type="button">
        Button
      </button>
    </div>
  );
}

function ReportFocusHarness({
  reporter,
}: {
  readonly reporter: WebviewKeyboardFocusReporter;
}): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  useReportWebviewKeyboardFocus(rootRef, reporter);

  return (
    <div ref={rootRef} data-testid="report-root" tabIndex={-1}>
      Focus owner
    </div>
  );
}

function DelayedReportFocusHarness({
  reporter,
}: {
  readonly reporter: WebviewKeyboardFocusReporter;
}): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);
  useReportWebviewKeyboardFocus(rootRef, reporter);

  return mounted ? (
    <div ref={rootRef} data-testid="delayed-report-root">
      Focus owner
    </div>
  ) : (
    <button type="button" onClick={() => setMounted(true)}>
      Mount
    </button>
  );
}

function ReportEditableHarness({
  reporter,
}: {
  readonly reporter: WebviewKeyboardEditableReporter;
}): React.ReactElement {
  useReportWebviewKeyboardEditable(reporter);

  return (
    <div>
      <input type="text" />
      <div role="textbox" data-testid="role-textbox" tabIndex={0} />
      <div data-neko-keyboard-scope="text-input" data-testid="scope-text-input" tabIndex={0} />
      <div data-testid="non-focusable-surface">Surface</div>
      <button type="button">Button</button>
    </div>
  );
}
