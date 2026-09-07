// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { I18nProvider } from '@neko/ui/i18n/react';
import { createDesktopI18n } from './i18n';
import { WorkspaceQuickCreateControl } from './WorkspaceQuickCreateControl';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.assign(globalThis, { ResizeObserver: TestResizeObserver });

describe('WorkspaceQuickCreateControl', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it.each(['tab', 'empty'] as const)(
    'opens the same creation catalog from the %s trigger',
    async (variant) => {
      await renderControl(
        variant,
        vi.fn(async () => undefined),
      );
      click(document.querySelector(`[data-workspace-quick-create-trigger="${variant}"]`));
      expect(document.querySelector('[data-workspace-quick-create-kind="canvas"]')).not.toBeNull();
      expect(document.querySelector('[data-workspace-quick-create-kind="cut"]')).not.toBeNull();
      expect(document.querySelector('[data-workspace-quick-create-kind="file"]')).not.toBeNull();
      expect(
        document.querySelector('[data-workspace-quick-create-kind="directory"]'),
      ).not.toBeNull();
      expect(document.body.textContent).toContain('Workspace root');
    },
  );

  it('submits a trimmed Canvas stem through the shared callback', async () => {
    const onCreate = vi.fn(async () => undefined);
    await renderControl('tab', onCreate);
    click(document.querySelector('[data-workspace-quick-create-trigger="tab"]'));
    click(document.querySelector('[data-workspace-quick-create-kind="canvas"]'));
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Name"]');
    expect(input).not.toBeNull();
    await act(async () => {
      if (!input) return;
      fireEvent.change(input, { target: { value: '  Story Board  ' } });
    });
    expect(document.body.textContent).toContain('.nkc');
    expect(input?.getAttribute('aria-describedby')).toBe(
      document.querySelector('.workspace-quick-create-popover__name-field > span')?.id,
    );
    click(document.querySelector<HTMLButtonElement>('button[type="submit"]'));
    await act(async () => Promise.resolve());
    expect(onCreate).toHaveBeenCalledWith({ kind: 'canvas', name: 'Story Board' });
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('keeps a rejected request visible for correction', async () => {
    const onCreate = vi.fn(async () => {
      throw new Error('The requested entry already exists.');
    });
    await renderControl('empty', onCreate);
    click(document.querySelector('[data-workspace-quick-create-trigger="empty"]'));
    click(document.querySelector('[data-workspace-quick-create-kind="file"]'));
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Name"]');
    await act(async () => {
      if (!input) return;
      fireEvent.change(input, { target: { value: 'notes.md' } });
    });
    click(document.querySelector<HTMLButtonElement>('button[type="submit"]'));
    await act(async () => Promise.resolve());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('already exists');
    expect(document.querySelector('input[aria-label="Name"]')).not.toBeNull();
  });

  it('rejects an empty name locally without invoking creation', async () => {
    const onCreate = vi.fn(async () => undefined);
    await renderControl('tab', onCreate);
    click(document.querySelector('[data-workspace-quick-create-trigger="tab"]'));
    click(document.querySelector('[data-workspace-quick-create-kind="directory"]'));
    click(document.querySelector<HTMLButtonElement>('button[type="submit"]'));
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Enter a name.');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('locks the form while the canonical creation request is pending', async () => {
    let finishCreation: (() => void) | undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCreation = resolve;
        }),
    );
    await renderControl('empty', onCreate);
    click(document.querySelector('[data-workspace-quick-create-trigger="empty"]'));
    click(document.querySelector('[data-workspace-quick-create-kind="file"]'));
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Name"]');
    if (!input) throw new Error('Expected the quick-create name field.');
    fireEvent.change(input, { target: { value: 'notes.md' } });
    click(document.querySelector<HTMLButtonElement>('button[type="submit"]'));
    expect(document.body.textContent).toContain('Creating…');
    expect(input.disabled).toBe(true);
    await act(async () => finishCreation?.());
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('closes and resets the invocation with Escape', async () => {
    await renderControl(
      'tab',
      vi.fn(async () => undefined),
    );
    click(document.querySelector('[data-workspace-quick-create-trigger="tab"]'));
    click(document.querySelector('[data-workspace-quick-create-kind="cut"]'));
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Name"]');
    if (!input) throw new Error('Expected the quick-create name field.');
    fireEvent.change(input, { target: { value: 'Discard me' } });
    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));
    expect(document.querySelector('input[aria-label="Name"]')).toBeNull();
    click(document.querySelector('[data-workspace-quick-create-trigger="tab"]'));
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Discard me');
  });

  it('opens the index Canvas name field directly and cancels back to the rail', async () => {
    const onCreate = vi.fn(async () => undefined);
    await renderControl('canvas-index', onCreate);
    click(document.querySelector('[data-workspace-quick-create-trigger="canvas-index"]'));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Name"]');
    expect(document.activeElement).toBe(input);
    expect(document.body.textContent).toContain('.nkc');
    click(document.querySelector('.workspace-quick-create-popover__form button[type="button"]'));
    expect(document.querySelector('input[aria-label="Name"]')).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
    click(document.querySelector('[data-workspace-quick-create-trigger="canvas-index"]'));
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Name"]')?.value).toBe('');
  });

  async function renderControl(
    variant: 'tab' | 'empty' | 'canvas-index',
    onCreate: (submission: {
      kind: 'file' | 'directory' | 'canvas' | 'cut';
      name: string;
    }) => Promise<void>,
  ): Promise<void> {
    const i18n = createDesktopI18n('en');
    await act(async () => {
      root.render(
        <I18nProvider service={i18n.i18nService}>
          <WorkspaceQuickCreateControl onCreate={onCreate} variant={variant} />
        </I18nProvider>,
      );
    });
  }
});

function click(target: Element | null): void {
  if (!(target instanceof HTMLElement)) throw new Error('Expected an interactive target.');
  act(() => target.click());
}
