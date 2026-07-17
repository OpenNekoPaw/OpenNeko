// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMenuSection, PositionedContextMenu } from './index';

describe('@neko/ui positioned context menu', () => {
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
    document.body.replaceChildren();
  });

  it('renders manual-position menu items, separators, and action callbacks', () => {
    const onClose = vi.fn();
    const onRename = vi.fn();

    act(() => {
      root.render(
        <PositionedContextMenu
          x={12}
          y={24}
          items={[
            { label: 'Rename', shortcut: 'Enter', onClick: onRename },
            { separator: true },
            { label: 'Delete', danger: true, onClick: vi.fn() },
          ]}
          onClose={onClose}
        />,
      );
    });

    const menu = document.body.querySelector<HTMLElement>('.neko-menu');
    expect(menu?.getAttribute('role')).toBe('menu');
    expect(menu?.style.left).toBe('12px');
    expect(menu?.style.top).toBe('24px');
    expect(document.body.querySelectorAll('.neko-menu-sep')).toHaveLength(1);
    expect(document.body.textContent).toContain('Enter');

    act(() => {
      document.body.querySelector<HTMLButtonElement>('.neko-menu-item')?.click();
    });

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows caller menu tokens before VS Code, glass, and toolbar tokens', () => {
    act(() => {
      root.render(
        <PositionedContextMenu
          x={12}
          y={24}
          items={[{ label: 'Rename', shortcut: 'Enter', onClick: vi.fn() }, { separator: true }]}
          onClose={vi.fn()}
        />,
      );
    });

    const menu = document.body.querySelector<HTMLElement>('.neko-menu');
    const item = document.body.querySelector<HTMLButtonElement>('.neko-menu-item');
    const shortcut = document.body.querySelector<HTMLElement>('.neko-menu-item-shortcut');
    const separator = document.body.querySelector<HTMLElement>('.neko-menu-sep');

    expect(menu?.style.background).toBe(
      'var(--neko-menu-background, var(--vscode-menu-background, var(--vscode-editorWidget-background, var(--glass-bg, var(--neko-glass-bg, rgba(32, 32, 36, 0.88))))))',
    );
    expect(menu?.style.color).toBe(
      'var(--neko-menu-foreground, var(--vscode-menu-foreground, var(--vscode-foreground, var(--toolbar-fg, var(--neko-fg, inherit)))))',
    );

    act(() => {
      item?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    expect(item?.style.background).toBe(
      'var(--neko-menu-selectionBackground, var(--vscode-menu-selectionBackground, var(--button-bg, var(--neko-accent, #0a84ff))))',
    );
    expect(item?.style.color).toBe(
      'var(--neko-menu-selectionForeground, var(--vscode-menu-selectionForeground, var(--button-fg, #ffffff)))',
    );
    expect(shortcut?.style.color).toBe('currentcolor');
    expect(separator?.style.background).toBe(
      'var(--neko-menu-separatorBackground, var(--vscode-menu-separatorBackground, var(--panel-divider, var(--neko-divider, var(--neko-border, rgba(255, 255, 255, 0.12))))))',
    );
  });

  it('closes on outside pointer down and Escape', () => {
    const onClose = vi.fn();

    act(() => {
      root.render(
        <PositionedContextMenu
          x={0}
          y={0}
          items={[{ label: 'Rename', onClick: vi.fn() }]}
          onClose={onClose}
        />,
      );
    });

    act(() => {
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('builds neutral menu sections with actions and caller-owned groups', () => {
    const quick = vi.fn();
    const nested = vi.fn();
    const trailing = vi.fn();

    const items = buildMenuSection({
      actions: [{ id: 'generate', label: 'Generate', icon: 'AI', onClick: quick }],
      groups: [
        {
          id: 'target',
          label: 'Target',
          icon: 'T',
          actions: [{ id: 'understand', label: 'Understand', onClick: nested }],
        },
      ],
      trailingActions: [{ id: 'send', label: 'Send', icon: 'S', onClick: trailing }],
    });

    expect(items).toHaveLength(6);
    expect(items[0]).toEqual({ separator: true });
    expect(items[1]).toMatchObject({ label: 'Generate', icon: 'AI' });
    expect(items[2]).toEqual({ separator: true });
    expect(items[3]).toMatchObject({ label: 'Target', icon: 'T' });
    expect(items[4]).toEqual({ separator: true });
    expect(items[5]).toMatchObject({ label: 'Send', icon: 'S' });
  });
});
