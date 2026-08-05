// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RetainedSurfaceDeck } from './retained-surface-deck';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('RetainedSurfaceDeck', () => {
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

  it('switches visibility without remounting or losing browser UI state', () => {
    const mounted = vi.fn();
    const disposed = vi.fn();
    renderDeck(['surface:a', 'surface:b'], 'surface:a', mounted, disposed);

    const input = host.querySelector<HTMLInputElement>('[data-surface-input="surface:a"]');
    if (!input) throw new Error('Surface A input is required.');
    act(() => {
      input.value = 'unfinished draft';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    renderDeck(['surface:a', 'surface:b'], 'surface:b', mounted, disposed);

    expect(mounted).toHaveBeenCalledTimes(2);
    expect(disposed).not.toHaveBeenCalled();
    expect(
      host.querySelector('[data-neko-retained-surface="surface:a"]')?.hasAttribute('hidden'),
    ).toBe(true);
    expect(host.querySelector<HTMLInputElement>('[data-surface-input="surface:a"]')?.value).toBe(
      'unfinished draft',
    );
  });

  it('unmounts only the explicitly removed Surface', () => {
    const mounted = vi.fn();
    const disposed = vi.fn();
    renderDeck(['surface:a', 'surface:b'], 'surface:a', mounted, disposed);

    renderDeck(['surface:b'], 'surface:b', mounted, disposed);

    expect(disposed).toHaveBeenCalledTimes(1);
    expect(disposed).toHaveBeenCalledWith('surface:a');
    expect(host.querySelector('[data-neko-retained-surface="surface:b"]')).not.toBeNull();
  });

  it('hides every descendant when its parent is inactive without unmounting them', () => {
    const mounted = vi.fn();
    const disposed = vi.fn();
    renderDeck(['surface:a', 'surface:b'], 'surface:a', mounted, disposed, false);

    expect(host.querySelectorAll('[data-neko-retained-surface]')).toHaveLength(2);
    expect(host.querySelectorAll('[data-neko-retained-surface][hidden]')).toHaveLength(2);
    expect(disposed).not.toHaveBeenCalled();
  });

  function renderDeck(
    items: readonly string[],
    activeId: string,
    mounted: (id: string) => void,
    disposed: (id: string) => void,
    visible = true,
  ): void {
    act(() => {
      root.render(
        <RetainedSurfaceDeck
          items={items}
          activeId={activeId}
          visible={visible}
          getId={(id) => id}
          getLifecycle={(id) => (id === 'surface:b' ? 'suspendable' : 'hot-retained')}
          renderItem={(id) => <StatefulSurface id={id} mounted={mounted} disposed={disposed} />}
        />,
      );
    });
  }

  it('projects owner-declared lifecycle and active state without remounting', () => {
    const presentations: string[] = [];
    act(() => {
      root.render(
        <RetainedSurfaceDeck
          items={['surface:a', 'surface:b']}
          activeId="surface:a"
          getId={(id) => id}
          getLifecycle={(id) => (id === 'surface:b' ? 'suspendable' : 'hot-retained')}
          renderItem={(id, presentation) => {
            presentations.push(
              `${id}:${presentation.lifecycle}:${String(presentation.active)}:${String(presentation.suspended)}`,
            );
            return <span>{id}</span>;
          }}
        />,
      );
    });

    expect(presentations).toEqual([
      'surface:a:hot-retained:true:false',
      'surface:b:suspendable:false:true',
    ]);
    expect(
      host
        .querySelector('[data-neko-retained-surface="surface:b"]')
        ?.getAttribute('data-lifecycle'),
    ).toBe('suspendable');
  });

  it('resets an ephemeral invocation when it closes', () => {
    const disposed = vi.fn();
    act(() => {
      root.render(
        <RetainedSurfaceDeck
          items={['dialog:create']}
          activeId="dialog:create"
          getId={(id) => id}
          getLifecycle={() => 'ephemeral'}
          renderItem={(id) => <StatefulSurface id={id} mounted={vi.fn()} disposed={disposed} />}
        />,
      );
    });
    const input = host.querySelector<HTMLInputElement>('[data-surface-input="dialog:create"]');
    if (!input) throw new Error('Ephemeral input is required.');
    input.value = 'must reset';

    act(() => {
      root.render(
        <RetainedSurfaceDeck
          items={['dialog:create']}
          activeId={undefined}
          getId={(id) => id}
          getLifecycle={() => 'ephemeral'}
          renderItem={(id) => <StatefulSurface id={id} mounted={vi.fn()} disposed={disposed} />}
        />,
      );
    });

    expect(disposed).toHaveBeenCalledWith('dialog:create');
    expect(host.querySelector('[data-surface-input="dialog:create"]')).toBeNull();
  });

  it('preserves a complete descendant tree while hidden and recursively disposes only its parent', () => {
    const disposed = vi.fn();
    const mounted = vi.fn();
    const renderParents = (
      parentIds: readonly string[],
      activeId: string,
      visible = true,
    ): void => {
      act(() => {
        root.render(
          <RetainedSurfaceDeck
            items={parentIds}
            activeId={activeId}
            visible={visible}
            getId={(id) => id}
            getLifecycle={() => 'hot-retained'}
            renderItem={(parentId, parentPresentation) => (
              <RetainedSurfaceDeck
                items={[`${parentId}:page`, `${parentId}:preview`]}
                activeId={`${parentId}:page`}
                visible={parentPresentation.active}
                getId={(id) => id}
                getLifecycle={(id) => (id.endsWith(':preview') ? 'suspendable' : 'hot-retained')}
                renderItem={(id) => (
                  <StatefulSurface id={id} mounted={mounted} disposed={disposed} />
                )}
              />
            )}
          />,
        );
      });
    };

    renderParents(['workbench:a', 'workbench:b'], 'workbench:a');
    renderParents(['workbench:a', 'workbench:b'], 'workbench:a', false);

    expect(host.querySelectorAll('[data-surface-input]')).toHaveLength(4);
    expect(disposed).not.toHaveBeenCalled();

    renderParents(['workbench:b'], 'workbench:b');

    expect(disposed).toHaveBeenCalledTimes(2);
    expect(disposed).toHaveBeenCalledWith('workbench:a:page');
    expect(disposed).toHaveBeenCalledWith('workbench:a:preview');
    expect(host.querySelector('[data-surface-input="workbench:b:page"]')).not.toBeNull();
    expect(host.querySelector('[data-surface-input="workbench:b:preview"]')).not.toBeNull();
  });
});

function StatefulSurface({
  disposed,
  id,
  mounted,
}: {
  readonly id: string;
  readonly mounted: (id: string) => void;
  readonly disposed: (id: string) => void;
}): React.ReactElement {
  useEffect(() => {
    mounted(id);
    return () => disposed(id);
  }, [disposed, id, mounted]);
  return <input data-surface-input={id} defaultValue="" />;
}
