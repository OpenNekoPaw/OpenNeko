// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PersistedStateProvider, usePersistedState } from './usePersistedState';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('instance-owned persisted document state', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('isolates sibling Preview instances and preserves the surviving instance', () => {
    const firstChanged = vi.fn();
    const secondChanged = vi.fn();
    renderDocuments(true, firstChanged, secondChanged);

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-document="first"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-page="first"]')?.textContent).toBe('4');
    expect(container.querySelector('[data-page="second"]')?.textContent).toBe('8');
    expect(firstChanged).toHaveBeenLastCalledWith({ currentPage: 4 });
    expect(secondChanged).not.toHaveBeenCalled();

    renderDocuments(false, firstChanged, secondChanged);

    expect(container.querySelector('[data-page="first"]')).toBeNull();
    expect(container.querySelector('[data-page="second"]')?.textContent).toBe('8');
  });

  it('restores an explicitly suspended document from its owner snapshot', () => {
    let snapshot: Readonly<Record<string, unknown>> | undefined;
    act(() => {
      root.render(
        <PersistedStateProvider
          key="active-document"
          initialState={{ currentPage: 11 }}
          onStateChange={(next) => {
            snapshot = next;
          }}
        >
          <DocumentFixture id="document" />
        </PersistedStateProvider>,
      );
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-document="document"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(snapshot).toEqual({ currentPage: 12 });
    if (!snapshot) throw new Error('Suspended document snapshot is required.');

    act(() => root.render(<div data-suspended="true" />));
    act(() => {
      root.render(
        <PersistedStateProvider key="resumed-document" initialState={snapshot}>
          <DocumentFixture id="document" />
        </PersistedStateProvider>,
      );
    });

    expect(container.querySelector('[data-page="document"]')?.textContent).toBe('12');
  });

  function renderDocuments(
    includeFirst: boolean,
    firstChanged: (snapshot: Readonly<Record<string, unknown>>) => void,
    secondChanged: (snapshot: Readonly<Record<string, unknown>>) => void,
  ): void {
    act(() => {
      root.render(
        <>
          {includeFirst ? (
            <PersistedStateProvider
              key="first"
              initialState={{ currentPage: 3 }}
              onStateChange={firstChanged}
            >
              <DocumentFixture id="first" />
            </PersistedStateProvider>
          ) : null}
          <PersistedStateProvider
            key="second"
            initialState={{ currentPage: 8 }}
            onStateChange={secondChanged}
          >
            <DocumentFixture id="second" />
          </PersistedStateProvider>
        </>,
      );
    });
  }
});

function DocumentFixture({ id }: { readonly id: string }): React.ReactElement {
  const [page, setPage] = usePersistedState('currentPage', 1);
  return (
    <button type="button" data-document={id} onClick={() => setPage((value) => value + 1)}>
      <span data-page={id}>{page}</span>
    </button>
  );
}
