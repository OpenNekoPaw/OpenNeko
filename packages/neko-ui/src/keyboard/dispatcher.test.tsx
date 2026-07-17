import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardBoundary, collectKeyboardBoundaryPath } from './boundary';
import {
  __keyboardDispatcherTestUtils,
  dispatchKeyboardShortcut,
  DuplicateShortcutBindingError,
  useKeyboardDispatcher,
  validateShortcutBindings,
} from './dispatcher';
import type { ShortcutBinding } from './types';

describe('KeyboardBoundary', () => {
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
    host.remove();
  });

  it('renders scope ownership metadata and collects the innermost boundary first', () => {
    act(() => {
      root.render(
        <KeyboardBoundary ownerId="editor" scope="editor">
          <KeyboardBoundary ownerId="node-1" priority={10} scope="node">
            <button type="button">Target</button>
          </KeyboardBoundary>
        </KeyboardBoundary>,
      );
    });

    const target = host.querySelector('button');
    const path = collectKeyboardBoundaryPath(target);

    expect(path.map((boundary) => [boundary.scope, boundary.ownerId, boundary.priority])).toEqual([
      ['node', 'node-1', 10],
      ['editor', 'editor', 0],
    ]);
  });
});

describe('keyboard dispatcher', () => {
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
    host.remove();
  });

  it('reports duplicate shortcut bindings within the same owner and scope', () => {
    const bindings: readonly ShortcutBinding[] = [
      createBinding({ id: 'delete-1', scope: 'node', ownerId: 'node-1', key: { key: 'Delete' } }),
      createBinding({ id: 'delete-2', scope: 'node', ownerId: 'node-1', key: { key: 'Delete' } }),
    ];

    expect(validateShortcutBindings(bindings)).toHaveLength(1);
  });

  it('throws duplicate shortcut diagnostics while rendering in development or test mode', () => {
    const bindings: readonly ShortcutBinding[] = [
      createBinding({ id: 'delete-1', scope: 'node', ownerId: 'node-1', key: { key: 'Delete' } }),
      createBinding({ id: 'delete-2', scope: 'node', ownerId: 'node-1', key: { key: 'Delete' } }),
    ];

    expect(validateShortcutBindings(bindings)).toHaveLength(1);
    expect(__keyboardDispatcherTestUtils.shouldThrowDuplicateShortcutDiagnostics()).toBe(true);
    expect(
      __keyboardDispatcherTestUtils.shouldThrowDuplicateShortcutDiagnostics({
        nodeEnv: 'production',
      }),
    ).toBe(false);
    expect(() => {
      throw new DuplicateShortcutBindingError(validateShortcutBindings(bindings));
    }).toThrow(DuplicateShortcutBindingError);
  });

  it('allows the same shortcut in nested scopes and resolves the innermost owner first', () => {
    document.body.innerHTML = `
      <div data-neko-keyboard-scope="editor" data-neko-keyboard-owner="editor">
        <div data-neko-keyboard-scope="node" data-neko-keyboard-owner="node-1">
          <button id="target"></button>
        </div>
      </div>
    `;
    const editorAction = vi.fn();
    const nodeAction = vi.fn();
    const event = createKeyboardEvent('Delete', document.getElementById('target'));

    const result = dispatchKeyboardShortcut(
      event,
      [
        createBinding({
          id: 'editor-delete',
          scope: 'editor',
          key: { key: 'Delete' },
          run: editorAction,
        }),
        createBinding({
          id: 'node-delete',
          scope: 'node',
          key: { key: 'Delete' },
          run: nodeAction,
        }),
      ],
      {},
    );

    expect(result.outcome).toBe('handled');
    expect(result.binding?.id).toBe('node-delete');
    expect(nodeAction).toHaveBeenCalledTimes(1);
    expect(editorAction).not.toHaveBeenCalled();
  });

  it('uses explicit priority for conflicts at the same boundary level', () => {
    document.body.innerHTML = `<button id="target"></button>`;
    const lowPriority = vi.fn();
    const highPriority = vi.fn();
    const event = createKeyboardEvent('Escape', document.getElementById('target'));

    const result = dispatchKeyboardShortcut(
      event,
      [
        createBinding({
          id: 'low',
          scope: 'editor',
          key: { key: 'Escape' },
          priority: 1,
          run: lowPriority,
        }),
        createBinding({
          id: 'high',
          scope: 'modal',
          key: { key: 'Escape' },
          priority: 100,
          run: highPriority,
        }),
      ],
      {},
    );

    expect(result.outcome).toBe('handled');
    expect(result.binding?.id).toBe('high');
    expect(highPriority).toHaveBeenCalledTimes(1);
    expect(lowPriority).not.toHaveBeenCalled();
  });

  it('keeps text input scope above modal scope when both bind the same key at one level', () => {
    document.body.innerHTML = `<button id="target"></button>`;
    const modalAction = vi.fn();
    const textInputAction = vi.fn();
    const event = createKeyboardEvent('Escape', document.getElementById('target'));

    const result = dispatchKeyboardShortcut(
      event,
      [
        createBinding({
          id: 'modal-escape',
          scope: 'modal',
          key: { key: 'Escape' },
          run: modalAction,
        }),
        createBinding({
          id: 'text-input-escape',
          scope: 'text-input',
          key: { key: 'Escape' },
          run: textInputAction,
        }),
      ],
      {},
    );

    expect(result.outcome).toBe('handled');
    expect(result.binding?.id).toBe('text-input-escape');
    expect(textInputAction).toHaveBeenCalledTimes(1);
    expect(modalAction).not.toHaveBeenCalled();
    expect(__keyboardDispatcherTestUtils.getScopePriority('property-panel')).toBe(70);
    expect(__keyboardDispatcherTestUtils.getScopePriority('popover')).toBe(90);
    expect(__keyboardDispatcherTestUtils.getScopePriority('inline-editor')).toBe(80);
    expect(__keyboardDispatcherTestUtils.getScopePriority('container')).toBe(60);
    expect(__keyboardDispatcherTestUtils.getScopePriority('canvas')).toBe(40);
  });

  it('treats inline editor as the owner between text input and node scopes', () => {
    document.body.innerHTML = `
      <div data-neko-keyboard-scope="editor">
        <div data-neko-keyboard-scope="node" data-neko-keyboard-owner="node-1">
          <div data-neko-keyboard-scope="inline-editor" data-neko-keyboard-owner="title-1">
            <button id="target"></button>
          </div>
        </div>
      </div>
    `;
    const nodeAction = vi.fn();
    const inlineEditorAction = vi.fn();
    const event = createKeyboardEvent('Enter', document.getElementById('target'));

    const result = dispatchKeyboardShortcut(
      event,
      [
        createBinding({
          id: 'node-enter',
          scope: 'node',
          key: { key: 'Enter' },
          run: nodeAction,
        }),
        createBinding({
          id: 'inline-enter',
          scope: 'inline-editor',
          key: { key: 'Enter' },
          run: inlineEditorAction,
        }),
      ],
      {},
    );

    expect(result.outcome).toBe('handled');
    expect(result.binding?.id).toBe('inline-enter');
    expect(inlineEditorAction).toHaveBeenCalledTimes(1);
    expect(nodeAction).not.toHaveBeenCalled();
  });

  it('stops dispatch on editable targets instead of falling through to outer editor shortcuts', () => {
    document.body.innerHTML = `
      <div data-neko-keyboard-scope="editor">
        <input id="target" />
      </div>
    `;
    const deleteNode = vi.fn();
    const event = createKeyboardEvent('Delete', document.getElementById('target'));

    const result = dispatchKeyboardShortcut(
      event,
      [
        createBinding({
          id: 'editor-delete',
          scope: 'editor',
          key: { key: 'Delete' },
          run: deleteNode,
        }),
      ],
      {},
    );

    expect(result.outcome).toBe('stopped-editable');
    expect(deleteNode).not.toHaveBeenCalled();
  });

  it('stops dispatch during IME composition', () => {
    const run = vi.fn();
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'Enter',
      key: 'Enter',
      isComposing: true,
    });

    const result = dispatchKeyboardShortcut(
      event,
      [createBinding({ id: 'enter', scope: 'editor', key: { key: 'Enter' }, run })],
      {},
    );

    expect(result.outcome).toBe('stopped-composing');
    expect(run).not.toHaveBeenCalled();
  });

  it('stops editor-level actions while the root dispatcher is disabled', () => {
    const run = vi.fn();
    const event = createKeyboardEvent('Delete', document.body);

    const result = dispatchKeyboardShortcut(
      event,
      [createBinding({ id: 'delete', scope: 'editor', key: { key: 'Delete' }, run })],
      {},
      { enabled: false },
    );

    expect(result.outcome).toBe('stopped-unfocused');
    expect(run).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops outer editor fallbacks when an inner boundary owns the key', () => {
    document.body.innerHTML = `
      <div data-neko-keyboard-scope="editor">
        <div data-neko-keyboard-scope="menu" data-neko-keyboard-owned-keys="Escape Enter ArrowDown">
          <button id="target"></button>
        </div>
      </div>
    `;
    const closeEditorPanel = vi.fn();
    const event = createKeyboardEvent('Escape', document.getElementById('target'));

    const result = dispatchKeyboardShortcut(
      event,
      [
        createBinding({
          id: 'editor-escape',
          scope: 'editor',
          key: { key: 'Escape' },
          run: closeEditorPanel,
        }),
      ],
      {},
    );

    expect(result.outcome).toBe('stopped-owned-boundary');
    expect(closeEditorPanel).not.toHaveBeenCalled();
  });

  it('uses one root listener while reading the latest bindings and state', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const firstRun = vi.fn();
    const secondRun = vi.fn();

    function Harness({
      label,
      run,
    }: {
      readonly label: string;
      readonly run: (label: string) => void;
    }) {
      useKeyboardDispatcher(
        [
          createBinding({
            id: 'delete',
            scope: 'editor',
            key: { key: 'Delete' },
            run: (context) => run(String(context.state['label'])),
          }),
        ],
        { label },
      );
      return null;
    }

    act(() => {
      root.render(<Harness label="first" run={firstRun} />);
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Delete' }));
    expect(firstRun).toHaveBeenCalledWith('first');

    act(() => {
      root.render(<Harness label="second" run={secondRun} />);
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Delete' }));
    expect(secondRun).toHaveBeenCalledWith('second');

    const keydownAdds = addSpy.mock.calls.filter(([eventType]) => eventType === 'keydown');
    const keydownRemoves = removeSpy.mock.calls.filter(([eventType]) => eventType === 'keydown');
    expect(keydownAdds).toHaveLength(1);
    expect(keydownRemoves).toHaveLength(0);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

function createBinding(
  binding: Partial<ShortcutBinding> & Pick<ShortcutBinding, 'id' | 'key' | 'scope'>,
): ShortcutBinding {
  return {
    run: vi.fn(),
    ...binding,
  };
}

function createKeyboardEvent(key: string, target: Element | null): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code: key,
    key,
  });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}
