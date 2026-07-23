// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertyPanel, type PropertyPanelProps } from './PropertyPanel';
import type { TimelineElement } from '../../types';
import { ENGINE_DEFAULT_TRANSFORM } from '../../types';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Cut PropertyPanel retained basic UI', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('renders only OTIO-backed basic, speed and audio sections', () => {
    act(() => root.render(<PropertyPanel {...props()} />));

    expect(host.querySelector('[aria-label="propertyPanel.group.basic"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="propertyPanel.group.speed"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="propertyPanel.group.audio"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="name"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="audio.gain"]')).not.toBeNull();
    expect(host.textContent).not.toContain('colorCorrection');
    expect(host.textContent).not.toContain('effects.title');
    expect(host.textContent).not.toContain('masks.title');
  });

  it('keeps preview and commit callbacks separate for controlled text input', () => {
    const onElementChange = vi.fn();
    const onElementCommit = vi.fn();
    const element = createElement();
    const callbacks = { onElementChange, onElementCommit };
    act(() => root.render(<PropertyPanel {...props({ ...callbacks, element })} />));
    const input = host.querySelector<HTMLInputElement>(
      'input[aria-label="propertyPanel.basic.name"]',
    );
    expect(input).not.toBeNull();

    act(() => {
      setInputValue(input, 'Renamed');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onElementChange).toHaveBeenCalledWith('clip-1', { name: 'Renamed' });
    expect(onElementCommit).not.toHaveBeenCalled();

    act(() =>
      root.render(
        <PropertyPanel {...props({ ...callbacks, element: { ...element, name: 'Renamed' } })} />,
      ),
    );
    const updatedInput = host.querySelector<HTMLInputElement>(
      'input[aria-label="propertyPanel.basic.name"]',
    );
    act(() => updatedInput?.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(onElementCommit).toHaveBeenCalledWith('clip-1', { name: 'Renamed' });
  });

  it('projects a visible empty state when no Clip is selected', () => {
    act(() => root.render(<PropertyPanel {...props({ element: null })} />));
    expect(host.textContent).toContain('propertyPanel.noSelection');
  });
});

function props(overrides: Partial<PropertyPanelProps> = {}): PropertyPanelProps {
  return {
    mode: 'basic',
    element: createElement(),
    currentTime: 0,
    onElementChange: vi.fn(),
    onElementCommit: vi.fn(),
    ...overrides,
  };
}

function createElement(): TimelineElement {
  return {
    id: 'clip-1',
    type: 'media',
    name: 'Clip',
    src: '../media/clip.mp4',
    mediaType: 'video',
    duration: 3,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: ENGINE_DEFAULT_TRANSFORM,
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    speed: { speed: 1, preservePitch: true, reverse: false },
    audio: { volume: 1, pan: 0, muted: false, fadeIn: 0, fadeOut: 0, gain: 0 },
  };
}

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
}

class TestResizeObserver implements ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}
