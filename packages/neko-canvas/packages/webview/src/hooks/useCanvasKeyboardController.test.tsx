// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import {
  useCanvasKeyboardController,
  type CanvasKeyboardState,
  type UseCanvasKeyboardControllerOptions,
} from './useCanvasKeyboardController';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useCanvasKeyboardController', () => {
  let host: HTMLDivElement;
  let root: Root;
  let options: UseCanvasKeyboardControllerOptions;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    options = createOptions();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('runs editor-level shortcuts from the focused webview root', () => {
    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      window.dispatchEvent(createKeyEvent('Delete', 'Delete'));
      window.dispatchEvent(createKeyEvent('a', 'KeyA', { ctrlKey: true }));
      window.dispatchEvent(createKeyEvent('z', 'KeyZ', { ctrlKey: true }));
      window.dispatchEvent(createKeyEvent('z', 'KeyZ', { ctrlKey: true, shiftKey: true }));
      window.dispatchEvent(createKeyEvent('g', 'KeyG', { ctrlKey: true }));
    });

    expect(options.onDeleteSelected).toHaveBeenCalledTimes(1);
    expect(options.onSelectAll).toHaveBeenCalledTimes(1);
    expect(options.onUndo).toHaveBeenCalledTimes(1);
    expect(options.onRedo).toHaveBeenCalledTimes(1);
    expect(options.onGenerateSelected).toHaveBeenCalledTimes(1);
  });

  it('does not mutate editor state while a nested input has DOM focus', () => {
    const input = document.createElement('input');
    input.type = 'text';
    setBoundary(input, 'text-input', [
      'Backspace',
      'Delete',
      'Enter',
      'Escape',
      'Space',
      'Tab',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ]);
    document.body.appendChild(input);
    input.focus();

    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      input.dispatchEvent(createKeyEvent('Delete', 'Delete'));
      input.dispatchEvent(createKeyEvent('Backspace', 'Backspace'));
      input.dispatchEvent(createKeyEvent('a', 'KeyA', { ctrlKey: true }));
      input.dispatchEvent(createKeyEvent(' ', 'Space'));
      input.dispatchEvent(createKeyEvent('Enter', 'Enter'));
      input.dispatchEvent(createKeyEvent('z', 'KeyZ', { ctrlKey: true }));
    });

    expect(options.onDeleteSelected).not.toHaveBeenCalled();
    expect(options.onSelectAll).not.toHaveBeenCalled();
    expect(options.onSpacePanStart).not.toHaveBeenCalled();
    expect(options.onUndo).not.toHaveBeenCalled();
    expect(options.onEscape).not.toHaveBeenCalled();

    input.remove();
  });

  it('restores editor shortcuts after focus leaves a nested input', () => {
    const viewport = document.createElement('div');
    viewport.tabIndex = -1;
    setBoundary(viewport, 'viewport');
    document.body.appendChild(viewport);
    const input = document.createElement('input');
    input.type = 'text';
    setBoundary(input, 'text-input', ['Backspace', 'Delete']);
    viewport.appendChild(input);

    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      input.focus();
      input.dispatchEvent(createKeyEvent('Delete', 'Delete'));
    });
    expect(options.onDeleteSelected).not.toHaveBeenCalled();

    act(() => {
      viewport.focus();
      viewport.dispatchEvent(createKeyEvent('Delete', 'Delete'));
    });

    expect(options.onDeleteSelected).toHaveBeenCalledTimes(1);
    viewport.remove();
  });

  it('does not fall through to editor shortcuts during IME composition', () => {
    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      window.dispatchEvent(createKeyEvent('Delete', 'Delete', { isComposing: true }));
      window.dispatchEvent(createKeyEvent('a', 'KeyA', { isComposing: true, ctrlKey: true }));
      window.dispatchEvent(createKeyEvent('z', 'KeyZ', { isComposing: true, ctrlKey: true }));
    });

    expect(options.onDeleteSelected).not.toHaveBeenCalled();
    expect(options.onSelectAll).not.toHaveBeenCalled();
    expect(options.onUndo).not.toHaveBeenCalled();
  });

  it('lets modal and menu boundaries own Escape and Enter', () => {
    const modalButton = document.createElement('button');
    setBoundary(modalButton, 'modal', ['Enter', 'Escape']);
    document.body.appendChild(modalButton);

    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      modalButton.dispatchEvent(createKeyEvent('Escape', 'Escape'));
      modalButton.dispatchEvent(createKeyEvent('Enter', 'Enter'));
    });

    expect(options.onEscape).not.toHaveBeenCalled();
    expect(options.onDeleteSelected).not.toHaveBeenCalled();

    modalButton.remove();
  });

  it('ignores retained webview key events when the root is not keyboard focused', () => {
    options = createOptions({
      isKeyboardFocused: false,
    });

    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      window.dispatchEvent(createKeyEvent('Delete', 'Delete'));
      window.dispatchEvent(createKeyEvent('h', 'KeyH'));
      window.dispatchEvent(createKeyEvent(' ', 'Space'));
    });

    expect(options.onDeleteSelected).not.toHaveBeenCalled();
    expect(options.onTogglePanMode).not.toHaveBeenCalled();
    expect(options.onSpacePanStart).not.toHaveBeenCalled();
  });

  it('owns viewport tool shortcuts at viewport scope', () => {
    const viewport = document.createElement('div');
    setBoundary(viewport, 'viewport');
    document.body.appendChild(viewport);

    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      viewport.dispatchEvent(createKeyEvent('h', 'KeyH'));
      viewport.dispatchEvent(createKeyEvent(' ', 'Space'));
      viewport.dispatchEvent(createKeyEvent(' ', 'Space', {}, 'keyup'));
    });

    expect(options.onTogglePanMode).toHaveBeenCalledTimes(1);
    expect(options.onSpacePanStart).toHaveBeenCalledTimes(1);
    expect(options.onSpacePanEnd).toHaveBeenCalledTimes(1);

    viewport.remove();
  });
});

function KeyboardHarness({
  options,
}: {
  readonly options: UseCanvasKeyboardControllerOptions;
}): React.ReactElement | null {
  useCanvasKeyboardController(options);
  return null;
}

function createOptions(
  stateOverrides: Partial<CanvasKeyboardState> = {},
): UseCanvasKeyboardControllerOptions {
  return {
    state: {
      canDeleteSelection: true,
      canGenerateSelection: true,
      hasNodes: true,
      isKeyboardFocused: true,
      ...stateOverrides,
    },
    onDeleteSelected: vi.fn(),
    onEscape: vi.fn(),
    onSelectAll: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onCopy: vi.fn(),
    onCut: vi.fn(),
    onPaste: vi.fn(),
    onPasteInPlace: vi.fn(),
    onDuplicate: vi.fn(),
    onGenerateSelected: vi.fn(),
    onSpacePanEnd: vi.fn(),
    onSpacePanStart: vi.fn(),
    onTogglePanMode: vi.fn(),
  };
}

function setBoundary(
  element: HTMLElement,
  scope: 'modal' | 'text-input' | 'viewport',
  ownedKeys?: Parameters<typeof getKeyboardBoundaryMetadata>[0]['ownedKeys'],
): void {
  const metadata = getKeyboardBoundaryMetadata({
    scope,
    ownerId: scope,
    ownedKeys,
  });
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      element.setAttribute(key, value);
    }
  }
}

function createKeyEvent(
  key: string,
  code: string,
  options: KeyboardEventInit = {},
  type = 'keydown',
): KeyboardEvent {
  return new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    code,
    key,
    ...options,
  });
}
