// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoDetails } from './VideoDiffViewer';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('VideoDetails Hook lifecycle', () => {
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

  it('preserves Hook order while details become available or unavailable', () => {
    act(() => root.render(<VideoDetails />));
    expect(host.textContent).toBe('');

    act(() => {
      root.render(
        <VideoDetails
          details={{
            duration: { current: 12, previous: 10 },
            resolution: {
              current: { width: 1920, height: 1080 },
              previous: { width: 1280, height: 720 },
            },
            fps: { current: 30, previous: 24 },
            keyframeDiffs: [{ time: 1, similarity: 0.75 }],
          }}
        />,
      );
    });
    expect(host.textContent).toContain('1920×1080');

    act(() => root.render(<VideoDetails />));
    expect(host.textContent).toBe('');
  });
});
