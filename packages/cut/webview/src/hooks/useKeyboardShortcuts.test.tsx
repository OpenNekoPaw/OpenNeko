// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useKeyboardShortcuts,
  type CutKeyboardShortcutActions,
  type CutKeyboardShortcutState,
} from './useKeyboardShortcuts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const state: CutKeyboardShortcutState = {
  hasView: true,
  hasSelection: true,
  hasClipboard: true,
  canSplit: true,
};

describe('useKeyboardShortcuts', () => {
  let host: HTMLDivElement;
  let root: Root;
  let actions: CutKeyboardShortcutActions;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    actions = createActions();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('keeps editor shortcuts inside text inputs', () => {
    act(() => root.render(<KeyboardHarness actions={actions} />));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(createKeyEvent('Delete', 'Delete'));
      input.dispatchEvent(createKeyEvent(' ', 'Space'));
    });

    expect(actions.deleteSelection).not.toHaveBeenCalled();
    expect(actions.togglePlayback).not.toHaveBeenCalled();
    input.remove();
  });

  it('ignores editor shortcuts during IME composition', () => {
    act(() => root.render(<KeyboardHarness actions={actions} />));
    act(() => window.dispatchEvent(createKeyEvent(' ', 'Space', { isComposing: true })));
    expect(actions.togglePlayback).not.toHaveBeenCalled();
  });

  it('dispatches editor shortcuts when the editor owns the key event', () => {
    act(() => root.render(<KeyboardHarness actions={actions} />));
    act(() => {
      window.dispatchEvent(createKeyEvent('Delete', 'Delete'));
      window.dispatchEvent(createKeyEvent(' ', 'Space'));
      window.dispatchEvent(createKeyEvent('d', 'KeyD', { ctrlKey: true }));
    });
    expect(actions.deleteSelection).toHaveBeenCalledOnce();
    expect(actions.togglePlayback).toHaveBeenCalledOnce();
    expect(actions.duplicateSelection).toHaveBeenCalledOnce();
  });

  it('handles primary+S through the active Cut save command', () => {
    act(() => root.render(<KeyboardHarness actions={actions} />));
    const event = createKeyEvent('s', 'KeyS', { ctrlKey: true });
    act(() => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(actions.save).toHaveBeenCalledOnce();
    expect(actions.split).not.toHaveBeenCalled();
  });

  it('keeps primary+S available while a text input owns focus', () => {
    act(() => root.render(<KeyboardHarness actions={actions} />));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = createKeyEvent('s', 'KeyS', { ctrlKey: true });
    act(() => input.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(actions.save).toHaveBeenCalledOnce();
    input.remove();
  });
});

function KeyboardHarness({
  actions,
}: {
  readonly actions: CutKeyboardShortcutActions;
}): React.ReactElement | null {
  useKeyboardShortcuts({ enabled: true, state, actions });
  return null;
}

function createActions(): CutKeyboardShortcutActions {
  return {
    togglePlayback: vi.fn(),
    seekByFrames: vi.fn(),
    seekStart: vi.fn(),
    seekEnd: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    save: vi.fn(),
    split: vi.fn(),
    duplicateSelection: vi.fn(),
    cutSelection: vi.fn(),
    copySelection: vi.fn(),
    paste: vi.fn(),
    selectAll: vi.fn(),
    deleteSelection: vi.fn(),
    clearSelection: vi.fn(),
  };
}

function createKeyEvent(key: string, code: string, options: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code,
    key,
    ...options,
  });
}
