// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CanvasStoreScopeProvider, useScopedCanvasStore } from './canvasStoreScope';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('CanvasStoreScopeProvider', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('isolates simultaneously rendered Canvas document state', () => {
    const operationPort = { postMessage: () => undefined };
    act(() => {
      root.render(
        <>
          <CanvasStoreScopeProvider operationPort={operationPort}>
            <CanvasScopeProbe id="left" />
          </CanvasStoreScopeProvider>
          <CanvasStoreScopeProvider operationPort={operationPort}>
            <CanvasScopeProbe id="right" />
          </CanvasStoreScopeProvider>
        </>,
      );
    });

    act(() => {
      host.querySelector<HTMLButtonElement>('[data-probe="left"]')?.click();
    });

    expect(host.querySelector('[data-value="left"]')?.textContent).toBe('left.nkc');
    expect(host.querySelector('[data-value="right"]')?.textContent).toBe('empty');
  });
});

function CanvasScopeProbe({ id }: { readonly id: string }) {
  const name = useScopedCanvasStore((state) => state.canvasData?.name ?? 'empty');
  const setCanvasData = useScopedCanvasStore((state) => state.setCanvasData);
  return (
    <section>
      <button
        data-probe={id}
        onClick={() =>
          setCanvasData({
            version: '1.0',
            name: `${id}.nkc`,
            nodes: [],
            connections: [],
          })
        }
      >
        set
      </button>
      <output data-value={id}>{name}</output>
    </section>
  );
}
