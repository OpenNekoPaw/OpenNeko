// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineControls, type TimelineControlsProps } from './TimelineControls';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const baseProps: TimelineControlsProps = {
  zoomLevel: 1,
  setZoomLevel: () => undefined,
  snappingEnabled: true,
  rippleEditingEnabled: false,
  frameAlignEnabled: false,
  showClipThumbnails: true,
  showMinimap: true,
  toggleSnapping: () => undefined,
  toggleRippleEditing: () => undefined,
  toggleFrameAlign: () => undefined,
  toggleClipThumbnails: () => undefined,
  toggleMinimap: () => undefined,
  addTrack: () => undefined,
  propertyPanelVisible: false,
  onOpenPackage: () => undefined,
  onTogglePropertyPanel: () => undefined,
  onExport: () => undefined,
};

describe('TimelineControls workbench actions', () => {
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

  it('routes package and property actions from the timeline control bar', () => {
    const onOpenPackage = vi.fn();
    const onTogglePropertyPanel = vi.fn();

    act(() => {
      root.render(
        <TimelineControls
          {...baseProps}
          onOpenPackage={onOpenPackage}
          onTogglePropertyPanel={onTogglePropertyPanel}
        />,
      );
    });

    const packageButton = host.querySelector<HTMLButtonElement>(
      '[data-cut-control="package-project"]',
    );
    const propertyButton = host.querySelector<HTMLButtonElement>(
      '[data-cut-control="toggle-property-panel"]',
    );

    expect(packageButton?.getAttribute('aria-label')).toBe('preview.packageProject');
    expect(propertyButton?.getAttribute('aria-controls')).toBe('cut-property-panel');
    expect(propertyButton?.getAttribute('aria-expanded')).toBe('false');
    expect(propertyButton?.getAttribute('aria-pressed')).toBe('false');
    expect(propertyButton?.getAttribute('aria-label')).toBe('preview.showPropertyPanel');

    act(() => {
      packageButton?.click();
      propertyButton?.click();
    });

    expect(onOpenPackage).toHaveBeenCalledTimes(1);
    expect(onTogglePropertyPanel).toHaveBeenCalledTimes(1);
  });

  it('projects the expanded property state', () => {
    act(() => {
      root.render(<TimelineControls {...baseProps} propertyPanelVisible={true} />);
    });

    const propertyButton = host.querySelector<HTMLButtonElement>(
      '[data-cut-control="toggle-property-panel"]',
    );
    expect(propertyButton?.getAttribute('aria-expanded')).toBe('true');
    expect(propertyButton?.getAttribute('aria-pressed')).toBe('true');
    expect(propertyButton?.getAttribute('aria-label')).toBe('preview.hidePropertyPanel');
  });
});
