// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimelineView } from '@neko-cut/domain';
import { ExportConfigView } from './ExportConfigView';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const view: TimelineView = {
  documentUri: 'file:///workspace/project.otio',
  sessionId: 'session-1',
  revision: 2,
  name: 'Project',
  profile: {
    profile: '1080p30',
    editRateNumerator: 30,
    editRateDenominator: 1,
    width: 1920,
    height: 1080,
  },
  tracks: [],
  durationSeconds: 3,
};

describe('ExportConfigView', () => {
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

  it('initializes job settings from the OTIO profile and submits explicit values', () => {
    const onExport = vi.fn();
    act(() => {
      root.render(
        <ExportConfigView
          view={view}
          recentTasks={[]}
          onClose={() => undefined}
          onExport={onExport}
        />,
      );
    });

    const more = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('export.more'),
    );
    act(() => more?.click());
    expect(input('width').value).toBe('1920');
    expect(input('height').value).toBe('1080');
    setInput(input('width'), '1280');
    setInput(input('height'), '720');
    const start = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'export.start',
    );
    act(() => start?.click());

    expect(onExport).toHaveBeenCalledWith({
      outputName: 'Project',
      container: 'mp4',
      width: 1280,
      height: 720,
      framesPerSecond: 30,
      videoBitrate: 8_000_000,
      includeAudio: true,
      audioBitrate: 192_000,
      audioSampleRate: 48_000,
    });
  });

  function input(id: string): HTMLInputElement {
    const element = host.querySelector<HTMLInputElement>(
      `input[data-neko-keyboard-owner="number-input:${id}"]`,
    );
    if (!element) throw new Error(`Missing ${id} input.`);
    return element;
  }
});

function setInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTML input value setter is unavailable.');
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
