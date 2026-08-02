import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyframeButton } from './index';

describe('@neko/ui KeyframeButton', () => {
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

  it('toggles keyframe for animatable properties', () => {
    const onToggleKeyframe = vi.fn();

    act(() => {
      root.render(
        <KeyframeButton
          animatable
          isAtKeyframe
          onToggleKeyframe={onToggleKeyframe}
          propertyId="opacity"
        />,
      );
    });

    const button = host.querySelector('button');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.disabled).toBe(false);

    act(() => {
      button?.click();
    });
    expect(onToggleKeyframe).toHaveBeenCalledWith('opacity');
  });

  it('disables non-animatable properties', () => {
    const onToggleKeyframe = vi.fn();

    act(() => {
      root.render(<KeyframeButton onToggleKeyframe={onToggleKeyframe} propertyId="name" />);
    });

    const button = host.querySelector('button');
    expect(button?.disabled).toBe(true);

    act(() => {
      button?.click();
    });
    expect(onToggleKeyframe).not.toHaveBeenCalled();
  });
});
