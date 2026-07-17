// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertyPanel } from './PropertyPanel';
import type { ProjectDefaults, TimelineElement, Transform } from '../../types';
import { createDefaultElementTransform } from '../../types/animation';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../SpeedControl', () => ({
  SpeedControl: () => <div data-testid="speed-control" />,
}));

vi.mock('../TransitionPicker', () => ({
  TransitionPicker: () => <div data-testid="transition-picker" />,
}));

vi.mock('../ColorCorrection', () => ({
  ColorCorrectionPanel: () => <div data-testid="color-correction" />,
}));

vi.mock('../Effects', () => ({
  EffectsPanel: () => <div data-testid="effects-panel" />,
}));

vi.mock('../Mask', () => ({
  MaskPanel: () => <div data-testid="mask-panel" />,
}));

vi.mock('./AIActionsButton', () => ({
  AIActionsButton: () => <button type="button">AI</button>,
}));

vi.mock('./NormalizeLoudnessButton', () => ({
  NormalizeLoudnessButton: () => <button type="button">Normalize</button>,
}));

describe('Cut PropertyPanel shared UI migration', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
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

  it('keeps preview and commit separated for shared transform controls', () => {
    const onElementChange = vi.fn();
    const onElementCommit = vi.fn();
    const element = createElement();

    act(() => {
      renderPropertyPanel({ element, onElementChange, onElementCommit });
    });

    const opacityInput = host.querySelector<HTMLInputElement>(
      '[data-property-id="animTransform.opacity"] input[type="number"]',
    );
    expect(opacityInput).not.toBeNull();

    act(() => {
      setInputValue(opacityInput, '0.4');
      opacityInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onElementChange).toHaveBeenCalledTimes(1);
    expect(onElementCommit).not.toHaveBeenCalled();
    expect(onElementChange.mock.calls[0]?.[0]).toBe('element-1');
    expect(onElementChange.mock.calls[0]?.[1].animTransform.opacity.baseValue).toBe(0.4);

    act(() => {
      opacityInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(onElementCommit).toHaveBeenCalledTimes(1);
    expect(onElementCommit.mock.calls[0]?.[0]).toBe('element-1');
    expect(onElementCommit.mock.calls[0]?.[1].animTransform.opacity.baseValue).toBe(0.4);
  });

  it('routes shared keyframe toggle to add/remove callbacks', () => {
    const onAddKeyframe = vi.fn();
    const onRemoveKeyframe = vi.fn();
    const element = createElement();
    element.animTransform!.opacity.keyframes = [];

    act(() => {
      renderPropertyPanel({ element, onAddKeyframe, onRemoveKeyframe });
    });

    const keyframeButton = host.querySelector<HTMLButtonElement>(
      '[data-property-id="animTransform.opacity"] button[aria-pressed]',
    );

    act(() => {
      keyframeButton?.click();
    });

    expect(onAddKeyframe).toHaveBeenCalledWith('element-1', 'animTransform.opacity', 0.75);
    expect(onRemoveKeyframe).not.toHaveBeenCalled();
  });

  it('renders stable basic and transform rows through typed composition', () => {
    act(() => {
      renderPropertyPanel({ element: createElement() });
    });

    const typedBasic = host.querySelector<HTMLElement>('[data-cut-panel-path="typed-basic"]');
    const typedTransform = host.querySelector<HTMLElement>(
      '[data-cut-panel-path="typed-transform"]',
    );
    const opacityRow = typedTransform?.querySelector<HTMLElement>(
      '[data-property-id="animTransform.opacity"]',
    );
    const nameRow = typedBasic?.querySelector<HTMLElement>('[data-property-id="name"]');

    expect(typedBasic).not.toBeNull();
    expect(typedTransform).not.toBeNull();
    expect(opacityRow).not.toBeNull();
    expect(nameRow).not.toBeNull();
    expect(
      host.querySelector('.cut-shared-property-row[data-property-id="animTransform.opacity"]'),
    ).toBeNull();
    expect(host.querySelector('.cut-shared-property-row[data-property-id="name"]')).toBeNull();
  });

  it('does not import the removed legacy shared property adapter in the production panel', () => {
    const source = readFileSync(resolve(__dirname, 'PropertyPanel.tsx'), 'utf8');

    expect(source).not.toContain('sharedPropertyAdapter');
    expect(source).not.toContain('mapCutPropertySourcesToShared');
    expect(source).not.toContain('createCutElementPatch');
    expect(source).not.toContain('SharedPropertyPanel');
  });

  it('renders text, subtitle, and audio stable sections through typed composition rows', () => {
    act(() => {
      renderPropertyPanel({ element: createTextElement() });
    });

    expect(host.querySelector('[data-cut-panel-path="typed-text"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="content"]')).not.toBeNull();
    expect(host.querySelector('.cut-shared-property-row[data-property-id="content"]')).toBeNull();

    act(() => {
      renderPropertyPanel({ element: createSubtitleElement() });
    });

    expect(host.querySelector('[data-cut-panel-path="typed-subtitle"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="strokeWidth"]')).not.toBeNull();

    act(() => {
      renderPropertyPanel({ element: createElement() });
    });

    expect(host.querySelector('[data-cut-panel-path="typed-audio"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="audio.volume"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="audio.muted"]')).not.toBeNull();
  });

  it('keeps migrated collapsible shell expanded by default and toggles content', () => {
    act(() => {
      renderPropertyPanel({ element: createElement() });
    });

    const basicHeader = getGroupHeader('propertyPanel.group.basic');
    expect(basicHeader).not.toBeNull();
    expect(basicHeader?.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[data-property-id="name"]')).not.toBeNull();

    act(() => {
      basicHeader?.click();
    });

    expect(basicHeader?.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[data-property-id="name"]')).toBeNull();
  });

  it('keeps disabled migrated collapsible shell closed without rendering rows', () => {
    act(() => {
      renderPropertyPanel({ element: null, projectDefaults: null });
    });

    const basicHeader = getGroupHeader('propertyPanel.group.basic');
    expect(basicHeader).not.toBeNull();
    expect(basicHeader?.disabled).toBe(true);
    expect(basicHeader?.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[data-property-id="name"]')).toBeNull();
  });

  it('keeps advanced edit groups out of basic mode and restores them in professional mode', () => {
    act(() => {
      renderPropertyPanel({ element: createElement(), mode: 'basic' });
    });

    expect(getGroupHeader('propertyPanel.group.basic')).not.toBeNull();
    expect(getGroupHeader('propertyPanel.group.transform')).not.toBeNull();
    expect(getGroupHeader('propertyPanel.group.audio')).not.toBeNull();
    expect(getGroupHeader('propertyPanel.group.speed')).toBeNull();
    expect(getGroupHeader('propertyPanel.group.inTransition')).toBeNull();
    expect(getGroupHeader('colorCorrection.title')).toBeNull();
    expect(host.textContent).not.toContain('blendMode.title');

    act(() => {
      renderPropertyPanel({ element: createElement(), mode: 'professional' });
    });

    expect(getGroupHeader('propertyPanel.group.speed')).not.toBeNull();
    expect(getGroupHeader('propertyPanel.group.inTransition')).not.toBeNull();
    expect(getGroupHeader('propertyPanel.group.outTransition')).not.toBeNull();
    expect(getGroupHeader('colorCorrection.title')).not.toBeNull();
    expect(getGroupHeader('effects.title')).not.toBeNull();
    expect(getGroupHeader('masks.title')).not.toBeNull();
    expect(host.textContent).toContain('blendMode.title');
  });

  function getGroupHeader(label: string): HTMLButtonElement | null {
    return (
      Array.from(host.querySelectorAll<HTMLButtonElement>('.neko-collapsible-header')).find(
        (button) => button.textContent?.includes(label),
      ) ?? null
    );
  }

  function renderPropertyPanel({
    currentTime = 0,
    element,
    mode = 'basic',
    onAddKeyframe = vi.fn(),
    onDefaultsChange = vi.fn(),
    onElementChange = vi.fn(),
    onElementCommit = vi.fn(),
    onRemoveKeyframe = vi.fn(),
    projectDefaults = createDefaults(),
  }: {
    currentTime?: number;
    element: TimelineElement | null;
    mode?: 'basic' | 'professional';
    onAddKeyframe?: Parameters<typeof PropertyPanel>[0]['onAddKeyframe'];
    onDefaultsChange?: Parameters<typeof PropertyPanel>[0]['onDefaultsChange'];
    onElementChange?: Parameters<typeof PropertyPanel>[0]['onElementChange'];
    onElementCommit?: Parameters<typeof PropertyPanel>[0]['onElementCommit'];
    onRemoveKeyframe?: Parameters<typeof PropertyPanel>[0]['onRemoveKeyframe'];
    projectDefaults?: ProjectDefaults | null;
  }): void {
    root.render(
      <PropertyPanel
        currentTime={currentTime}
        element={element}
        mode={mode}
        projectDefaults={projectDefaults}
        onAddKeyframe={onAddKeyframe}
        onDefaultsChange={onDefaultsChange}
        onElementChange={onElementChange}
        onElementCommit={onElementCommit}
        onRemoveKeyframe={onRemoveKeyframe}
      />,
    );
  }
});

function createElement(): TimelineElement {
  const animTransform = createDefaultElementTransform();
  animTransform.opacity = {
    baseValue: 0.75,
    keyframes: [{ id: 'kf-opacity', time: 0, value: 0.75, easing: 'linear' }],
  };

  return {
    id: 'element-1',
    type: 'media',
    name: 'Clip 1',
    src: '/clip.mp4',
    startTime: 0,
    duration: 10,
    trimStart: 0,
    trimEnd: 0,
    transform: createTransform(),
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    animTransform,
  };
}

function createTextElement(): TimelineElement {
  return {
    ...createElement(),
    type: 'text',
    content: 'Title',
    fontSize: 48,
    fontFamily: 'Arial',
    color: '#ffffff',
    backgroundColor: '#000000',
    textAlign: 'center',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
  } as TimelineElement;
}

function createSubtitleElement(): TimelineElement {
  return {
    ...createElement(),
    type: 'subtitle',
    text: 'Caption',
    fontSize: 32,
    fontFamily: 'Arial',
    color: '#ffffff',
    backgroundColor: '#000000',
    textAlign: 'center',
    strokeColor: '#000000',
    strokeWidth: 2,
  } as TimelineElement;
}

function createDefaults(): ProjectDefaults {
  return {
    text: {
      fontSize: 48,
      fontFamily: 'Arial',
      color: '#ffffff',
      backgroundColor: 'transparent',
      textAlign: 'center',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
    },
    transform: {
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
    },
    audio: {
      volume: 1,
      pan: 0,
      fadeIn: 0,
      fadeOut: 0,
      gain: 0,
    },
  };
}

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}

function createTransform(): Transform {
  return {
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    anchorX: 0.5,
    anchorY: 0.5,
  };
}

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
