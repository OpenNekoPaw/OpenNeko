// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewPanel } from './PreviewPanel';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('PreviewPanel retained canvas presentation', () => {
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

  it('renders the media canvas without a decorative border or visible file metadata', () => {
    act(() => {
      root.render(
        <PreviewPanel
          projectHeight={1920}
          projectWidth={1080}
          source="../media/clip.mp4"
          title="clip.mp4"
        />,
      );
    });

    const stage = host.querySelector('.cut-basic-preview-stage');
    expect(stage?.className).not.toContain('border');
    expect(stage?.className).not.toContain('shadow');
    expect(host.textContent).not.toContain('clip.mp4');
    expect(host.textContent).not.toContain('../media/clip.mp4');
    const canvas = host.querySelector('canvas');
    expect(canvas?.getAttribute('aria-label')).toBe('clip.mp4');
    expect(canvas?.getAttribute('width')).toBe('1080');
    expect(canvas?.getAttribute('height')).toBe('1920');
    expect(canvas?.className).toContain('object-contain');
  });
});
