import { describe, expect, it } from 'vitest';
import type { ProjectData, TimelineElement } from '../../types';
import { buildCompositeLayers } from './compositeUtils';

function createMediaElement(overrides: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id: 'element-1',
    type: 'media',
    name: 'Clip',
    src: 'clip.mp4',
    duration: 7,
    startTime: 20,
    trimStart: 1,
    trimEnd: 1,
    transform: {
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    ...overrides,
  } as TimelineElement;
}

function createProject(element: TimelineElement): ProjectData {
  return {
    version: '2.0',
    name: 'Preview source time test',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: 'track-1',
        name: 'Media Track',
        type: 'media',
        elements: [element],
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
      },
    ],
  };
}

describe('compositeUtils', () => {
  it('uses the shared clip mapping for speed-adjusted source times', () => {
    const element = createMediaElement({
      speed: {
        speed: 2,
        reverse: false,
        preservePitch: true,
      },
    });

    const layers = buildCompositeLayers(createProject(element), 22.5);

    expect(layers).toHaveLength(1);
    expect(layers[0]?.sourceTime).toBe(6);
  });

  it('uses the effective timeline duration when deciding clip visibility', () => {
    const element = createMediaElement();
    const project = createProject(element);

    expect(buildCompositeLayers(project, 24.999)).toHaveLength(1);
    expect(buildCompositeLayers(project, 25)).toHaveLength(0);
  });
});
