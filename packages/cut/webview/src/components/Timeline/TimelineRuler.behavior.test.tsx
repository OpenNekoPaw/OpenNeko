// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineRuler } from './TimelineRuler';

describe('TimelineRuler pointer ownership', () => {
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

  it.each(['lostpointercapture', 'blur'] as const)(
    'clears the active seek gesture after %s',
    (termination) => {
      const onSeek = vi.fn();
      act(() =>
        root.render(<TimelineRuler totalDuration={10} pixelsPerSecond={10} onSeek={onSeek} />),
      );
      const ruler = host.querySelector<HTMLElement>('.cut-basic-ruler');
      if (!ruler) throw new Error('Timeline ruler was not rendered.');
      ruler.setPointerCapture = vi.fn();
      ruler.releasePointerCapture = vi.fn();
      ruler.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;

      act(() => ruler.dispatchEvent(pointerEvent('pointerdown', 1, 20)));
      expect(onSeek).toHaveBeenCalledTimes(1);
      act(() => {
        if (termination === 'blur') window.dispatchEvent(new Event('blur'));
        else ruler.dispatchEvent(pointerEvent('lostpointercapture', 1, 20));
      });
      act(() => ruler.dispatchEvent(pointerEvent('pointermove', 1, 40)));

      expect(onSeek).toHaveBeenCalledTimes(1);
    },
  );

  it('ignores events owned by another pointer', () => {
    const onSeek = vi.fn();
    act(() =>
      root.render(<TimelineRuler totalDuration={10} pixelsPerSecond={10} onSeek={onSeek} />),
    );
    const ruler = host.querySelector<HTMLElement>('.cut-basic-ruler');
    if (!ruler) throw new Error('Timeline ruler was not rendered.');
    ruler.setPointerCapture = vi.fn();
    ruler.releasePointerCapture = vi.fn();
    ruler.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;

    act(() => ruler.dispatchEvent(pointerEvent('pointerdown', 3, 20)));
    act(() => ruler.dispatchEvent(pointerEvent('pointermove', 4, 50)));

    expect(onSeek).toHaveBeenCalledTimes(1);
  });

  it('continues the active gesture after the first seek rerenders its parent', () => {
    function Harness() {
      const [time, setTime] = useState(0);
      return (
        <>
          <output data-testid="time">{time}</output>
          <TimelineRuler
            totalDuration={10}
            pixelsPerSecond={10}
            onSeek={(nextTime) => setTime(nextTime)}
          />
        </>
      );
    }
    act(() => root.render(<Harness />));
    const ruler = host.querySelector<HTMLElement>('.cut-basic-ruler');
    if (!ruler) throw new Error('Timeline ruler was not rendered.');
    ruler.setPointerCapture = vi.fn();
    ruler.releasePointerCapture = vi.fn();
    ruler.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;

    act(() => ruler.dispatchEvent(pointerEvent('pointerdown', 5, 20)));
    act(() => ruler.dispatchEvent(pointerEvent('pointermove', 5, 60)));

    expect(host.querySelector('[data-testid="time"]')?.textContent).toBe('6');
  });

  it('accepts a new moving gesture immediately after lost pointer capture', () => {
    const onSeek = vi.fn();
    act(() =>
      root.render(<TimelineRuler totalDuration={10} pixelsPerSecond={10} onSeek={onSeek} />),
    );
    const ruler = host.querySelector<HTMLElement>('.cut-basic-ruler');
    if (!ruler) throw new Error('Timeline ruler was not rendered.');
    ruler.setPointerCapture = vi.fn();
    ruler.releasePointerCapture = vi.fn();
    ruler.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;

    act(() => ruler.dispatchEvent(pointerEvent('pointerdown', 6, 20)));
    act(() => ruler.dispatchEvent(pointerEvent('lostpointercapture', 6, 20)));
    act(() => ruler.dispatchEvent(pointerEvent('pointerdown', 7, 30)));
    act(() => ruler.dispatchEvent(pointerEvent('pointermove', 7, 70)));

    expect(onSeek).toHaveBeenLastCalledWith(7);
  });
});

function pointerEvent(type: string, pointerId: number, clientX: number): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
  });
  return event;
}
