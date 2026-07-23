import { describe, expect, it, vi } from 'vitest';
import { dispatchKeyboardShortcut } from '@neko/ui/keyboard';
import {
  createCutShortcutBindings,
  type CutKeyboardShortcutActions,
  type CutKeyboardShortcutState,
} from './useKeyboardShortcuts';

const activeState: CutKeyboardShortcutState = {
  hasView: true,
  hasSelection: true,
  hasClipboard: true,
  canSplit: true,
};

describe('Cut keyboard shortcuts', () => {
  it('routes basic editing keys through the same actions as visible controls', () => {
    const actions = createActions();
    const bindings = createCutShortcutBindings(actions);

    expect(dispatch(bindings, keyboard('Space'))).toBe('handled');
    expect(dispatch(bindings, keyboard('KeyS'))).toBe('handled');
    expect(dispatch(bindings, keyboard('Delete'))).toBe('handled');
    expect(dispatch(bindings, keyboard('KeyZ', { metaKey: true }))).toBe('handled');
    expect(dispatch(bindings, keyboard('KeyD', { metaKey: true }))).toBe('handled');
    expect(dispatch(bindings, keyboard('KeyX', { metaKey: true }))).toBe('handled');
    expect(dispatch(bindings, keyboard('KeyC', { metaKey: true }))).toBe('handled');
    expect(dispatch(bindings, keyboard('KeyV', { metaKey: true }))).toBe('handled');
    expect(dispatch(bindings, keyboard('KeyA', { metaKey: true }))).toBe('handled');

    expect(actions.togglePlayback).toHaveBeenCalledOnce();
    expect(actions.split).toHaveBeenCalledOnce();
    expect(actions.deleteSelection).toHaveBeenCalledOnce();
    expect(actions.undo).toHaveBeenCalledOnce();
    expect(actions.duplicateSelection).toHaveBeenCalledOnce();
    expect(actions.cutSelection).toHaveBeenCalledOnce();
    expect(actions.copySelection).toHaveBeenCalledOnce();
    expect(actions.paste).toHaveBeenCalledOnce();
    expect(actions.selectAll).toHaveBeenCalledOnce();
  });

  it('leaves primary+S to VS Code and ignores editing shortcuts in inputs', () => {
    const actions = createActions();
    const bindings = createCutShortcutBindings(actions);
    const input = document.createElement('input');

    expect(dispatch(bindings, keyboard('KeyS', { metaKey: true }))).toBe('ignored');
    expect(dispatch(bindings, keyboard('Delete', { target: input }))).toBe('stopped-editable');
    expect(actions.split).not.toHaveBeenCalled();
    expect(actions.deleteSelection).not.toHaveBeenCalled();
  });
});

function createActions(): CutKeyboardShortcutActions {
  return {
    togglePlayback: vi.fn(),
    seekByFrames: vi.fn(),
    seekStart: vi.fn(),
    seekEnd: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
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

function dispatch(bindings: ReturnType<typeof createCutShortcutBindings>, event: KeyboardEvent) {
  return dispatchKeyboardShortcut(event, bindings, activeState, { isMac: true }).outcome;
}

function keyboard(
  code: string,
  options: KeyboardEventInit & { readonly target?: EventTarget } = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, ...options });
  if (options.target) Object.defineProperty(event, 'target', { value: options.target });
  return event;
}
