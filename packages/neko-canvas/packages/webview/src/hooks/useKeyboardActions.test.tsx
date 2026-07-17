// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardActions, type UseKeyboardActionsOptions } from './useKeyboardActions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useKeyboardActions explicit action mapping', () => {
  let host: HTMLDivElement;
  let root: Root;
  let options: UseKeyboardActionsOptions;

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

  it('dispatches explicit editor actions when Canvas owns keyboard focus', () => {
    let handleKeyboardAction: ((action: string) => void) | undefined;
    act(() => {
      root.render(
        <KeyboardHarness
          options={options}
          onReady={(handler) => {
            handleKeyboardAction = handler;
          }}
        />,
      );
    });

    act(() => {
      handleKeyboardAction?.('deleteSelected');
    });

    expect(options.deleteSelected).toHaveBeenCalledTimes(1);
    expect(options.reportAction).toHaveBeenCalledWith('deleteNode', 'Deleted 1 node(s)');
  });

  it('guards VSCode keyboard actions while text editing but still allows targeted outline actions', () => {
    const isComposingRef = { current: false };
    options = {
      ...options,
      vscode: createVSCodeApi(),
      isComposingRef,
    };

    let handleKeyboardAction: ((action: string) => void) | undefined;
    act(() => {
      root.render(
        <KeyboardHarness
          options={options}
          onReady={(handler) => {
            handleKeyboardAction = handler;
          }}
        />,
      );
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      handleKeyboardAction?.('deleteSelected');
      handleKeyboardAction?.('selectNode:node-2');
    });

    expect(options.deleteSelected).not.toHaveBeenCalled();
    expect(options.selectNode).toHaveBeenCalledWith('node-2');

    input.remove();
  });

  it('guards VSCode keyboard actions while IME composition is active', () => {
    const isComposingRef = { current: true };
    options = {
      ...options,
      vscode: createVSCodeApi(),
      isComposingRef,
    };

    let handleKeyboardAction: ((action: string) => void) | undefined;
    act(() => {
      root.render(
        <KeyboardHarness
          options={options}
          onReady={(handler) => {
            handleKeyboardAction = handler;
          }}
        />,
      );
    });

    act(() => {
      handleKeyboardAction?.('deleteSelected');
      handleKeyboardAction?.('selectNode:node-2');
    });

    expect(options.deleteSelected).not.toHaveBeenCalled();
    expect(options.selectNode).toHaveBeenCalledWith('node-2');
  });
});

function KeyboardHarness({
  onReady,
  options,
}: {
  readonly onReady?: (handleKeyboardAction: (action: string) => void) => void;
  readonly options: UseKeyboardActionsOptions;
}): React.ReactElement | null {
  const { handleKeyboardAction } = useKeyboardActions(options);
  onReady?.(handleKeyboardAction);
  return null;
}

function createOptions(): UseKeyboardActionsOptions {
  return {
    vscode: null,
    selectedNodeIds: ['node-1'],
    selectedConnectionIds: [],
    nodes: [{ id: 'node-1' }, { id: 'node-2' }] as UseKeyboardActionsOptions['nodes'],
    isConnecting: false,
    contextMenu: null,
    setContextMenu: vi.fn(),
    selectNode: vi.fn(),
    selectConnection: vi.fn(),
    deleteSelected: vi.fn(),
    cancelConnection: vi.fn(),
    clearSelection: vi.fn(),
    resetViewport: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    handleCopy: vi.fn(),
    handleCut: vi.fn(),
    handlePaste: vi.fn(),
    handlePasteInPlace: vi.fn(),
    handleDuplicate: vi.fn(),
    reportAction: vi.fn(),
  };
}

function createVSCodeApi(): NonNullable<UseKeyboardActionsOptions['vscode']> {
  return {
    postMessage: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  };
}
