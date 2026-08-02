// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileDrop, type FileDropBindings, type FileDropResult } from './useFileDrop';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useFileDrop structured payload lifecycle', () => {
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

  it('prioritizes a declared structured MIME and releases drag state on drop', () => {
    const onDrop = vi.fn<(result: FileDropResult) => void>();
    let state:
      | {
          readonly isDragOver: boolean;
          readonly dropProps: FileDropBindings;
        }
      | undefined;

    act(() => {
      root.render(
        <FileDropHarness
          onDrop={onDrop}
          onReady={(value) => {
            state = value;
          }}
        />,
      );
    });

    act(() => {
      state?.dropProps.onDragEnter(
        createDragEvent({
          types: ['application/x-openneko-test+json'],
        }),
      );
    });
    expect(state?.isDragOver).toBe(true);

    act(() => {
      state?.dropProps.onDrop(
        createDragEvent({
          types: ['application/x-openneko-test+json', 'application/json'],
          data: {
            'application/x-openneko-test+json': '{"source":"custom"}',
            'application/json': '{"source":"generic"}',
          },
        }),
      );
    });

    expect(state?.isDragOver).toBe(false);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(
      { type: 'json', data: { source: 'custom' } },
      expect.anything(),
    );
  });
});

function FileDropHarness({
  onDrop,
  onReady,
}: {
  readonly onDrop: (result: FileDropResult) => void;
  readonly onReady: (value: {
    readonly isDragOver: boolean;
    readonly dropProps: FileDropBindings;
  }) => void;
}): React.ReactElement | null {
  const value = useFileDrop(onDrop, {
    structuredMimeTypes: ['application/x-openneko-test+json', 'application/json'],
  });
  onReady(value);
  return null;
}

function createDragEvent(input: {
  readonly types: string[];
  readonly data?: Readonly<Record<string, string>>;
}): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      types: input.types,
      files: [],
      dropEffect: 'none',
      getData: (type: string) => input.data?.[type] ?? '',
    },
  } as unknown as React.DragEvent;
}
