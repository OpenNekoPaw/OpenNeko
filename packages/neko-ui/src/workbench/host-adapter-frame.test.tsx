// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CreativeHostAdapterFrame } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const labels = {
  dock: 'Adapter inspector',
  packageName: 'Package',
  panel: 'Panel',
  runtime: 'Runtime',
  file: 'File',
};

describe('CreativeHostAdapterFrame', () => {
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

  it('keeps the inspector dock and resize handle visible by default', () => {
    renderFrame();

    expect(host.querySelector('.neko-host-adapter-inspector')).not.toBeNull();
    expect(host.querySelector('.neko-creative-workbench-right-resize-handle')).not.toBeNull();
  });

  it('can hide host projection inspector chrome without removing package-owned main UI', () => {
    renderFrame({ hostAdapterInspector: 'hidden' });

    expect(host.querySelector('[data-testid="main"]')).not.toBeNull();
    expect(host.querySelector('.neko-host-adapter-inspector')).toBeNull();
    expect(host.querySelector('.neko-creative-workbench-right-resize-handle')).toBeNull();
  });

  function renderFrame(
    runtimeOverrides: Partial<Parameters<typeof CreativeHostAdapterFrame>[0]['runtime']> = {},
  ): void {
    act(() => {
      root.render(
        <CreativeHostAdapterFrame
          document={{
            id: 'workspace:scene.nkc',
            name: 'scene.nkc',
            relativePath: 'scene.nkc',
            kind: 'canvas',
          }}
          inspectorLabels={labels}
          leftRail={<div data-testid="left-rail" />}
          main={<div data-testid="main" />}
          mainKind="canvas"
          runtime={{
            label: 'Canvas',
            packageName: '@neko-canvas/webview',
            panelKind: 'canvas-workbench',
            runtime: 'host-adapter-projection',
            ...runtimeOverrides,
          }}
        />,
      );
    });
  }
});
