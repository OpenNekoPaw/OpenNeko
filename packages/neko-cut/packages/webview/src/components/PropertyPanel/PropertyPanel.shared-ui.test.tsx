// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertyPanel, type CutClipPropertyDraft, type PropertyPanelProps } from './PropertyPanel';

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

  it('renders one continuous OTIO-backed grouped surface without tabs', () => {
    act(() => root.render(<PropertyPanel {...props()} />));

    expect(host.querySelector('.cut-inspector-property-surface')).not.toBeNull();
    expect(
      Array.from(host.querySelectorAll('.cut-inspector-group')).map((section) =>
        section.getAttribute('aria-label'),
      ),
    ).toEqual([
      'propertyPanel.group.basic',
      'propertyPanel.group.timing',
      'propertyPanel.group.speed',
      'propertyPanel.group.audio',
    ]);
    expect(
      host
        .querySelector('[data-property-id="startTime"]')
        ?.closest('.cut-inspector-group')
        ?.getAttribute('aria-label'),
    ).toBe('propertyPanel.group.timing');
    expect(host.querySelector('[data-property-id="name"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="audio.gain"]')).not.toBeNull();
    expect(host.querySelector('[role="tab"], [role="tablist"]')).toBeNull();
    expect(host.textContent).not.toContain('colorCorrection');
    expect(host.textContent).not.toContain('effects.title');
    expect(host.textContent).not.toContain('masks.title');
  });

  it('keeps slider, numeric value and unit in one responsive property row', () => {
    act(() => root.render(<PropertyPanel {...props()} />));

    for (const [propertyId, unit] of [
      ['speed', '×'],
      ['audio.gain', 'dB'],
    ] as const) {
      const row = host.querySelector(`[data-property-id="${propertyId}"]`);
      expect(row?.querySelector('[role="slider"]')).not.toBeNull();
      expect(row?.querySelector('input[type="number"]')).not.toBeNull();
      expect(row?.textContent).toContain(unit);
    }
  });

  it('omits speed and audio groups for Subtitle Clips', () => {
    const subtitle = {
      ...createElement(),
      type: 'subtitle' as const,
    };
    act(() => root.render(<PropertyPanel {...props({ element: subtitle })} />));

    expect(
      Array.from(host.querySelectorAll('.cut-inspector-group')).map((section) =>
        section.getAttribute('aria-label'),
      ),
    ).toEqual(['propertyPanel.group.basic', 'propertyPanel.group.timing']);
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

function createElement(): CutClipPropertyDraft {
  return {
    id: 'clip-1',
    type: 'media',
    name: 'Clip',
    duration: 3,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
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
