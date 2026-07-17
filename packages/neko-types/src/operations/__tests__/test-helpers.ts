// =============================================================================
// 测试工具 — 创建测试用 ProjectData 和操作
// =============================================================================

import type { ProjectData } from '../../types/project';
import type { TimelineTrack } from '../../types/timelineTrack';
import type {
  TimelineElement,
  MediaElement,
  AudioElement,
  TextElement,
  ShapeElement,
  SubtitleElement,
} from '../../types/element';
import type { ShapeInstance, ShapeStyle, RectangleShape } from '../../types/shape';
import type { OperationMeta } from '../types';
import type { WebviewElement } from '../webview-types';

let counter = 0;

export function createMeta(source: 'user' | 'ai' | 'system' = 'user'): OperationMeta {
  return {
    id: `test-${++counter}`,
    timestamp: Date.now(),
    source,
  };
}

export function createTestTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: `track-${++counter}`,
    name: 'Test Track',
    type: 'video',
    elements: [],
    muted: false,
    locked: false,
    hidden: false,
    isMain: false,
    ...overrides,
  };
}

export function createTestMediaElement(overrides: Partial<MediaElement> = {}): MediaElement {
  return {
    id: `elem-${++counter}`,
    type: 'media',
    name: 'Test Media',
    src: '/test/video.mp4',
    duration: 10,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    ...overrides,
  };
}

export function createTestAudioElement(overrides: Partial<AudioElement> = {}): AudioElement {
  return {
    id: `elem-${++counter}`,
    type: 'audio',
    name: 'Test Audio',
    src: '/test/audio.mp3',
    duration: 10,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    ...overrides,
  };
}

export function createTestTextElement(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: `elem-${++counter}`,
    type: 'text',
    name: 'Test Text',
    content: 'Hello',
    fontSize: 48,
    fontFamily: 'Arial',
    color: '#ffffff',
    backgroundColor: 'transparent',
    textAlign: 'center',
    fontWeight: 'normal',
    fontStyle: 'normal',
    duration: 5,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    ...overrides,
  };
}

export function createTestShapeElement(overrides: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: `elem-${++counter}`,
    type: 'shape',
    name: 'Test Shape',
    shapeType: 'rectangle',
    fill: '#4a90d9',
    stroke: '#333333',
    strokeWidth: 2,
    duration: 5,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    ...overrides,
  };
}

export function createTestSubtitleElement(
  overrides: Partial<SubtitleElement> = {},
): SubtitleElement {
  return {
    id: `elem-${++counter}`,
    type: 'subtitle',
    name: 'Test Subtitle',
    text: 'Hello World',
    fontSize: 48,
    color: '#ffffff',
    fontFamily: 'Arial',
    backgroundColor: 'transparent',
    textAlign: 'center',
    strokeColor: 'transparent',
    strokeWidth: 0,
    duration: 5,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0.5, y: 0.85, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    ...overrides,
  };
}

export function createTestShapeInstance(overrides: Partial<ShapeInstance> = {}): ShapeInstance {
  const defaultShape: RectangleShape = {
    shapeType: 'rectangle',
    centerX: 50,
    centerY: 50,
    width: 30,
    height: 20,
    rotation: 0,
    cornerRadius: 0,
  };

  const defaultStyle: ShapeStyle = {
    fill: { type: 'solid', color: '#4a90d9', opacity: 1 },
    stroke: {
      enabled: true,
      color: '#333',
      width: 2,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
      miterLimit: 10,
      dashArray: [],
      dashOffset: 0,
    },
    shadow: { enabled: false, color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 4, offsetY: 4 },
  };

  return {
    id: `shape-${++counter}`,
    name: 'Test Shape',
    shape: defaultShape,
    style: defaultStyle,
    zIndex: 0,
    visible: true,
    locked: false,
    ...overrides,
  };
}

/**
 * 创建 WebviewElement（TimelineElement + UI-only 字段）
 * 用于需要 animTransform / masks / shapes 字段的测试
 */
export function createWebviewElement(
  base: TimelineElement,
  extras: Partial<Omit<WebviewElement, keyof TimelineElement>> = {},
): WebviewElement {
  return { ...base, ...extras } as WebviewElement;
}

export function createTestProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    version: '2.0',
    name: 'Test Project',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [],
    ...overrides,
  };
}

/**
 * 创建一个包含基本轨道和元素的测试项目
 */
export function createPopulatedProject(): {
  project: ProjectData;
  videoTrack: TimelineTrack;
  audioTrack: TimelineTrack;
  videoElement: MediaElement;
  audioElement: AudioElement;
} {
  const videoElement = createTestMediaElement({ id: 'v1', name: 'Video 1' });
  const audioElement = createTestAudioElement({ id: 'a1', name: 'Audio 1' });

  const videoTrack = createTestTrack({
    id: 'vt1',
    name: 'Video Track',
    type: 'video',
    elements: [videoElement],
  });

  const audioTrack = createTestTrack({
    id: 'at1',
    name: 'Audio Track',
    type: 'audio',
    elements: [audioElement],
  });

  const project = createTestProject({
    tracks: [videoTrack, audioTrack],
  });

  return { project, videoTrack, audioTrack, videoElement, audioElement };
}
