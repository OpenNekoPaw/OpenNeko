// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { ZoomControls } from './ZoomControls';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('ZoomControls', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setLocale('en');
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

  it('localizes control labels and tooltips from the Canvas locale', () => {
    renderControls(root);

    expect(controlLabels(host)).toEqual([
      'Zoom out (Ctrl+-)',
      'Select zoom level',
      'Zoom in (Ctrl++)',
      'Fit content',
      'Reset viewport (100%)',
    ]);

    setLocale('zh-cn');
    renderControls(root);

    expect(controlLabels(host)).toEqual([
      '缩小 (Ctrl+-)',
      '选择缩放级别',
      '放大 (Ctrl++)',
      '适应内容',
      '重置视图 (100%)',
    ]);
  });
});

function renderControls(root: Root): void {
  act(() => {
    root.render(
      <ZoomControls
        zoom={1}
        onZoomIn={() => undefined}
        onZoomOut={() => undefined}
        onZoomTo={() => undefined}
        onFitContent={() => undefined}
        onResetViewport={() => undefined}
      />,
    );
  });
}

function controlLabels(host: HTMLElement): string[] {
  return Array.from(
    host.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select'),
  ).map((control) => {
    expect(control.title).toBe(control.getAttribute('aria-label'));
    return control.title;
  });
}
