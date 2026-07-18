// =============================================================================
// EditOperation 类型定义 — 覆盖所有 ProjectData 修改操作
//
// 设计原则：
// - namespace.verb 命名，可映射 Rust serde tagged enum
// - 每条操作携带 before 字段用于生成逆操作（纯函数，不需访问 ProjectData）
// - 关键帧通过 KeyframeTarget 判别联合收敛 12 个 action 为 3 种操作
// - batch 支持原子批量操作
// =============================================================================

import type { TimelineTrack } from '../types/timelineTrack';
import type { TimelineElement } from '../types/element';
import type { ShapeInstance, Shape, ShapeStyle } from '../types/shape';
import type { Keyframe } from '../types/keyframe';
import type { EffectParameterKeyframe } from '../types/effects';
import type { MaskPropertyKeyframe, MaskShapeKeyframe } from '../types/mask';
import type { ProjectData } from '../types/project';
import type { CanvasNode, CanvasConnection } from '../types/canvas';

// =============================================================================
// Operation Meta — 操作元数据
// =============================================================================

export type OperationSource = 'user' | 'ai' | 'system' | 'undo' | 'redo';

export interface OperationMeta {
  /** 操作唯一 ID */
  id: string;
  /** 操作时间戳 */
  timestamp: number;
  /** 操作来源 */
  source: OperationSource;
  /** 操作描述（用于审计/展示） */
  description?: string;
}

// =============================================================================
// Track Operations（5 种 → 覆盖 9 个 action）
// =============================================================================

export interface TrackAddOperation {
  type: 'track.add';
  meta: OperationMeta;
  payload: {
    track: TimelineTrack;
    /** 插入位置索引，默认末尾 */
    index?: number;
  };
}

export interface TrackRemoveOperation {
  type: 'track.remove';
  meta: OperationMeta;
  payload: {
    trackId: string;
  };
  /** 被删除的 track 快照，用于 invert */
  before: {
    track: TimelineTrack;
    index: number;
  };
}

export interface TrackUpdateOperation {
  type: 'track.update';
  meta: OperationMeta;
  payload: {
    trackId: string;
    updates: Partial<Omit<TimelineTrack, 'id' | 'elements'>>;
  };
  /** 更新前的字段值 */
  before: {
    updates: Partial<Omit<TimelineTrack, 'id' | 'elements'>>;
  };
}

export interface TrackReorderOperation {
  type: 'track.reorder';
  meta: OperationMeta;
  payload: {
    trackId: string;
    fromIndex: number;
    toIndex: number;
  };
}

export interface TrackToggleOperation {
  type: 'track.toggle';
  meta: OperationMeta;
  payload: {
    trackId: string;
    field: 'muted' | 'locked' | 'hidden';
  };
  /** 切换前的值 */
  before: {
    value: boolean;
  };
}

export type TrackOperation =
  | TrackAddOperation
  | TrackRemoveOperation
  | TrackUpdateOperation
  | TrackReorderOperation
  | TrackToggleOperation;

// =============================================================================
// Element Operations（7 种 → 覆盖 8 个 action）
// =============================================================================

export interface ElementAddOperation {
  type: 'element.add';
  meta: OperationMeta;
  payload: {
    trackId: string;
    element: TimelineElement;
    /** 插入位置索引，默认末尾 */
    index?: number;
  };
}

export interface ElementRemoveOperation {
  type: 'element.remove';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
  };
  /** 被删除的元��快照 + 涟纹编辑影响 */
  before: {
    element: TimelineElement;
    index: number;
    /** 涟纹编辑模式下受影响元素的原始 startTime */
    rippleAffected?: Array<{ elementId: string; startTime: number }>;
  };
}

export interface ElementUpdateOperation {
  type: 'element.update';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    updates: Partial<TimelineElement>;
  };
  /** 更新前的字段值 */
  before: {
    updates: Partial<TimelineElement>;
  };
}

export interface ElementMoveOperation {
  type: 'element.move';
  meta: OperationMeta;
  payload: {
    fromTrackId: string;
    toTrackId: string;
    elementId: string;
  };
  before: {
    /** 元素在源 track 中的索引 */
    fromIndex: number;
  };
}

export interface ElementToggleOperation {
  type: 'element.toggle';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    field: 'muted' | 'hidden' | 'locked';
  };
  before: {
    value: boolean;
  };
}

export interface ElementLinkAudioOperation {
  type: 'element.linkAudio';
  meta: OperationMeta;
  payload: {
    /** 视频元素所在 track */
    videoTrackId: string;
    videoElementId: string;
    /** 音频元素所在 track */
    audioTrackId: string;
    audioElement: TimelineElement;
    /** 如果需要创建新的 audio track */
    audioTrack?: TimelineTrack;
  };
}

export interface ElementUnlinkAudioOperation {
  type: 'element.unlinkAudio';
  meta: OperationMeta;
  payload: {
    videoTrackId: string;
    videoElementId: string;
  };
  before: {
    linkedAudioId: string;
    audioTrackId: string;
    audioElement: TimelineElement;
    /** 如果 audio track 是专门为此创建的 */
    audioTrack?: TimelineTrack;
    audioTrackIndex?: number;
  };
}

export type ElementOperation =
  | ElementAddOperation
  | ElementRemoveOperation
  | ElementUpdateOperation
  | ElementMoveOperation
  | ElementToggleOperation
  | ElementLinkAudioOperation
  | ElementUnlinkAudioOperation;

// =============================================================================
// Element Split Operations（3 种 → 覆盖 3 个 action）
// =============================================================================

export interface ElementSplitAtOperation {
  type: 'element.splitAt';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    /** 分割点（相对于元素源的时间） */
    splitPoint: number;
    /** 右半部分新元素 */
    rightElement: TimelineElement;
  };
  before: {
    /** 原元素分割前的 trimEnd */
    trimEnd: number;
  };
}

export interface ElementSplitKeepLeftOperation {
  type: 'element.splitKeepLeft';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    splitPoint: number;
    newName: string;
  };
  before: {
    trimEnd: number;
    name: string;
  };
}

export interface ElementSplitKeepRightOperation {
  type: 'element.splitKeepRight';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    splitPoint: number;
    newStartTime: number;
    newName: string;
  };
  before: {
    startTime: number;
    trimStart: number;
    name: string;
  };
}

export type ElementSplitOperation =
  ElementSplitAtOperation | ElementSplitKeepLeftOperation | ElementSplitKeepRightOperation;

// =============================================================================
// Shape Operations（9 种 → 覆盖 15 个 action）
// =============================================================================

export interface ShapeAddElementOperation {
  type: 'shape.addElement';
  meta: OperationMeta;
  payload: {
    trackId: string;
    element: TimelineElement;
    index?: number;
  };
}

export interface ShapeAddOperation {
  type: 'shape.add';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    shape: ShapeInstance;
    /** 插入位置索引，默认末尾 */
    index?: number;
  };
}

export interface ShapeRemoveOperation {
  type: 'shape.remove';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    shapeId: string;
  };
  before: {
    shape: ShapeInstance;
    index: number;
  };
}

export interface ShapeDuplicateOperation {
  type: 'shape.duplicate';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    /** 复制后的新 shape（含偏移） */
    newShape: ShapeInstance;
  };
}

export interface ShapeUpdateOperation {
  type: 'shape.update';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    shapeId: string;
    updates: Partial<ShapeInstance>;
  };
  before: {
    updates: Partial<ShapeInstance>;
  };
}

export interface ShapeUpdateGeometryOperation {
  type: 'shape.updateGeometry';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    shapeId: string;
    shape: Partial<Shape>;
  };
  before: {
    shape: Partial<Shape>;
  };
}

export interface ShapeUpdateStyleOperation {
  type: 'shape.updateStyle';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    shapeId: string;
    style: Partial<ShapeStyle>;
  };
  before: {
    style: Partial<ShapeStyle>;
  };
}

export interface ShapeToggleOperation {
  type: 'shape.toggle';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    shapeId: string;
    field: 'visible' | 'locked';
  };
  before: {
    value: boolean;
  };
}

export interface ShapeReorderOperation {
  type: 'shape.reorder';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    shapeId: string;
    fromIndex: number;
    toIndex: number;
  };
}

export type ShapeOperation =
  | ShapeAddElementOperation
  | ShapeAddOperation
  | ShapeRemoveOperation
  | ShapeDuplicateOperation
  | ShapeUpdateOperation
  | ShapeUpdateGeometryOperation
  | ShapeUpdateStyleOperation
  | ShapeToggleOperation
  | ShapeReorderOperation;

// =============================================================================
// Keyframe Operations（3 种 × 4 target → 覆盖 12 个 action）
// =============================================================================

/**
 * 关键帧目标 — 判别联合，收敛 4 种关键帧存储位置
 */
export type KeyframeTarget =
  | { kind: 'transform'; property: string }
  | { kind: 'effect'; effectId: string; paramKey: string }
  | { kind: 'maskProperty'; maskId: string; property: 'feather' | 'expansion' | 'opacity' }
  | { kind: 'maskShape'; maskId: string };

export interface KeyframeAddOperation {
  type: 'keyframe.add';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    target: KeyframeTarget;
    keyframe: Keyframe | EffectParameterKeyframe | MaskPropertyKeyframe | MaskShapeKeyframe;
  };
}

export interface KeyframeRemoveOperation {
  type: 'keyframe.remove';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    target: KeyframeTarget;
    /** 用 time 或 id 定位要删除的关键帧 */
    keyframeId?: string;
    keyframeTime?: number;
  };
  before: {
    keyframe: Keyframe | EffectParameterKeyframe | MaskPropertyKeyframe | MaskShapeKeyframe;
    index: number;
  };
}

export interface KeyframeUpdateOperation {
  type: 'keyframe.update';
  meta: OperationMeta;
  payload: {
    trackId: string;
    elementId: string;
    target: KeyframeTarget;
    keyframeId?: string;
    keyframeTime?: number;
    updates:
      | Partial<Keyframe>
      | Partial<EffectParameterKeyframe>
      | Partial<MaskPropertyKeyframe>
      | Partial<MaskShapeKeyframe>;
  };
  before: {
    updates:
      | Partial<Keyframe>
      | Partial<EffectParameterKeyframe>
      | Partial<MaskPropertyKeyframe>
      | Partial<MaskShapeKeyframe>;
  };
}

export type KeyframeOperation =
  KeyframeAddOperation | KeyframeRemoveOperation | KeyframeUpdateOperation;

// =============================================================================
// Clipboard Operations（1 种）
// =============================================================================

export interface ClipboardPasteOperation {
  type: 'clipboard.paste';
  meta: OperationMeta;
  payload: {
    /** 粘贴产生的所有操作（可能包含 track.add + element.add） */
    items: Array<{
      trackId: string;
      element: TimelineElement;
      /** 如果需要创建新 track */
      newTrack?: TimelineTrack;
    }>;
  };
}

export type ClipboardOperation = ClipboardPasteOperation;

// =============================================================================
// Project Operations（1 种）
// =============================================================================

export interface ProjectUpdateOperation {
  type: 'project.update';
  meta: OperationMeta;
  payload: {
    updates: Partial<Omit<ProjectData, 'tracks'>>;
  };
  before: {
    updates: Partial<Omit<ProjectData, 'tracks'>>;
  };
}

export type ProjectOperation = ProjectUpdateOperation;

// =============================================================================
// Batch Operation — 原子批量操作
// =============================================================================

export interface BatchOperation {
  type: 'batch';
  meta: OperationMeta;
  payload: {
    operations: EditOperation[];
  };
}

// =============================================================================
// Canvas Operations — 无限画布节点/连线操作
// =============================================================================

export interface CanvasNodeAddOperation {
  type: 'canvas.node.add';
  meta: OperationMeta;
  payload: { node: CanvasNode };
}

export interface CanvasNodeRemoveOperation {
  type: 'canvas.node.remove';
  meta: OperationMeta;
  payload: { nodeId: string };
  /** 被删除的节点快照 + 关联连线，用于 invert */
  before: { node: CanvasNode; connections: CanvasConnection[]; index: number };
}

export interface CanvasNodeUpdateOperation {
  type: 'canvas.node.update';
  meta: OperationMeta;
  payload: { nodeId: string; updates: Partial<Omit<CanvasNode, 'id' | 'type'>> };
  before: { updates: Partial<Omit<CanvasNode, 'id' | 'type'>> };
}

export interface CanvasNodeReorderOperation {
  type: 'canvas.node.reorder';
  meta: OperationMeta;
  payload: { nodeId: string; newZIndex: number };
  before: { oldZIndex: number };
}

export interface CanvasNodeGroupOperation {
  type: 'canvas.node.group';
  meta: OperationMeta;
  payload: { groupNode: CanvasNode; childIds: string[] };
}

export interface CanvasNodeUngroupOperation {
  type: 'canvas.node.ungroup';
  meta: OperationMeta;
  payload: { groupId: string };
  before: { groupNode: CanvasNode; childIds: string[] };
}

export interface CanvasConnectionAddOperation {
  type: 'canvas.connection.add';
  meta: OperationMeta;
  payload: { connection: CanvasConnection };
}

export interface CanvasConnectionRemoveOperation {
  type: 'canvas.connection.remove';
  meta: OperationMeta;
  payload: { connectionId: string };
  before: { connection: CanvasConnection };
}

export type CanvasOperation =
  | CanvasNodeAddOperation
  | CanvasNodeRemoveOperation
  | CanvasNodeUpdateOperation
  | CanvasNodeReorderOperation
  | CanvasNodeGroupOperation
  | CanvasNodeUngroupOperation
  | CanvasConnectionAddOperation
  | CanvasConnectionRemoveOperation;

// =============================================================================
// EditOperation 联合类型
// =============================================================================

export type EditOperation =
  | TrackOperation
  | ElementOperation
  | ElementSplitOperation
  | ShapeOperation
  | KeyframeOperation
  | ClipboardOperation
  | ProjectOperation
  | CanvasOperation
  | BatchOperation;

/**
 * 提取操作的 type 字段字面量类型
 */
export type EditOperationType = EditOperation['type'];
