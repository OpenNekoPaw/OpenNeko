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
import type { AudioAutomationLane } from '../types/audioAutomation';
import type { AudioEffectConfig, AudioEffectType } from '../types/audioMix';
import type { SketchBlendMode } from '../types/blendMode';
import type { LayerType, NksVectorLayerData } from '../types/sketch';

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
  | ElementSplitAtOperation
  | ElementSplitKeepLeftOperation
  | ElementSplitKeepRightOperation;

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
  | KeyframeAddOperation
  | KeyframeRemoveOperation
  | KeyframeUpdateOperation;

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
// Sketch Operations — 2D 绘画图层/笔画操作
// =============================================================================

/** Sketch 图层可更新字段 */
export interface SketchLayerUpdates {
  name?: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  blendMode?: SketchBlendMode;
  offsetX?: number;
  offsetY?: number;
  clippingMask?: boolean;
  maskLayerId?: string | null;
  alphaLock?: boolean;
  adjustmentFilter?: string;
  adjustmentParams?: Record<string, number>;
  vectorData?: NksVectorLayerData;
}

/** Sketch 图层快照（不含 texture/pendingData，仅可序列化字段） */
export interface SketchLayerSnapshot {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: SketchBlendMode;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  clippingMask: boolean;
  maskLayerId: string | null;
  children: SketchLayerSnapshot[];
  alphaLock: boolean;
  adjustmentFilter?: string;
  adjustmentParams?: Record<string, number>;
  vectorData?: NksVectorLayerData;
}

/** 区域像素快照（用于笔画 undo） */
export interface RegionSnapshot {
  layerId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Base64 编码的像素数据 */
  data: string;
}

export interface SketchLayerAddOperation {
  type: 'sketch.layer.add';
  meta: OperationMeta;
  payload: { layer: SketchLayerSnapshot; parentId?: string; index?: number };
}

export interface SketchLayerRemoveOperation {
  type: 'sketch.layer.remove';
  meta: OperationMeta;
  payload: { layerId: string };
  before: { layer: SketchLayerSnapshot; parentId?: string; index: number };
}

export interface SketchLayerUpdateOperation {
  type: 'sketch.layer.update';
  meta: OperationMeta;
  payload: { layerId: string; updates: SketchLayerUpdates };
  before: { updates: SketchLayerUpdates };
}

export interface SketchLayerMoveOperation {
  type: 'sketch.layer.move';
  meta: OperationMeta;
  payload: { layerId: string; targetParentId?: string; targetIndex: number };
  before: { parentId?: string; index: number };
}

export interface SketchLayerDuplicateOperation {
  type: 'sketch.layer.duplicate';
  meta: OperationMeta;
  payload: { sourceLayerId: string; newLayer: SketchLayerSnapshot };
}

export interface SketchLayerGroupOperation {
  type: 'sketch.layer.group';
  meta: OperationMeta;
  payload: { groupLayer: SketchLayerSnapshot; childIds: string[] };
}

export interface SketchLayerUngroupOperation {
  type: 'sketch.layer.ungroup';
  meta: OperationMeta;
  payload: { groupId: string };
  before: { groupLayer: SketchLayerSnapshot; childIds: string[] };
}

export interface SketchStrokeApplyOperation {
  type: 'sketch.stroke.apply';
  meta: OperationMeta;
  payload: { layerId: string; regionAfter: RegionSnapshot };
  before: { regionBefore: RegionSnapshot };
}

export interface SketchCanvasUpdateOperation {
  type: 'sketch.canvas.update';
  meta: OperationMeta;
  payload: { updates: { width?: number; height?: number; dpi?: number; backgroundColor?: string } };
  before: { updates: { width?: number; height?: number; dpi?: number; backgroundColor?: string } };
}

export type SketchOperation =
  | SketchLayerAddOperation
  | SketchLayerRemoveOperation
  | SketchLayerUpdateOperation
  | SketchLayerMoveOperation
  | SketchLayerDuplicateOperation
  | SketchLayerGroupOperation
  | SketchLayerUngroupOperation
  | SketchStrokeApplyOperation
  | SketchCanvasUpdateOperation;

// =============================================================================
// Audio Operations — 音频项目效果链/标记操作
// =============================================================================

/** 音频效果实例快照 */
export interface AudioEffectSnapshot {
  id: string;
  type: AudioEffectType;
  name: string;
  enabled: boolean;
  params: Record<string, unknown>;
}

/** 音频标记快照 */
export interface AudioMarkerSnapshot {
  id: string;
  time: number;
  label: string;
  color?: string;
}

export interface AudioEffectAddOperation {
  type: 'audio.effect.add';
  meta: OperationMeta;
  payload: { effect: AudioEffectSnapshot; index?: number };
}

export interface AudioEffectRemoveOperation {
  type: 'audio.effect.remove';
  meta: OperationMeta;
  payload: { effectId: string };
  before: { effect: AudioEffectSnapshot; index: number };
}

export interface AudioEffectUpdateOperation {
  type: 'audio.effect.update';
  meta: OperationMeta;
  payload: { effectId: string; updates: Partial<Omit<AudioEffectSnapshot, 'id'>> };
  before: { updates: Partial<Omit<AudioEffectSnapshot, 'id'>> };
}

export interface AudioEffectToggleOperation {
  type: 'audio.effect.toggle';
  meta: OperationMeta;
  payload: { effectId: string; field: 'enabled' };
  before: { value: boolean };
}

export interface AudioSetBpmOperation {
  type: 'audio.setBpm';
  meta: OperationMeta;
  payload: { bpm?: number };
  before: { bpm?: number };
}

export interface AudioSetTimeSignatureOperation {
  type: 'audio.setTimeSignature';
  meta: OperationMeta;
  payload: { numerator: number; denominator: number };
  before: { numerator: number; denominator: number };
}

export interface AudioSetMasterVolumeOperation {
  type: 'audio.setMasterVolume';
  meta: OperationMeta;
  payload: { masterVolume?: number };
  before: { masterVolume?: number };
}

export interface AudioEffectMoveOperation {
  type: 'audio.effect.move';
  meta: OperationMeta;
  payload: { effectId: string; fromIndex: number; toIndex: number };
}

export interface AudioMarkerAddOperation {
  type: 'audio.marker.add';
  meta: OperationMeta;
  payload: { marker: AudioMarkerSnapshot };
}

export interface AudioMarkerRemoveOperation {
  type: 'audio.marker.remove';
  meta: OperationMeta;
  payload: { markerId: string };
  before: { marker: AudioMarkerSnapshot };
}

export interface AudioMarkerUpdateOperation {
  type: 'audio.marker.update';
  meta: OperationMeta;
  payload: { markerId: string; updates: Partial<Omit<AudioMarkerSnapshot, 'id'>> };
  before: { updates: Partial<Omit<AudioMarkerSnapshot, 'id'>> };
}

export type AudioOperation =
  | AudioEffectAddOperation
  | AudioEffectRemoveOperation
  | AudioEffectUpdateOperation
  | AudioEffectToggleOperation
  | AudioEffectMoveOperation
  | AudioMarkerAddOperation
  | AudioMarkerRemoveOperation
  | AudioMarkerUpdateOperation
  | AudioSetBpmOperation
  | AudioSetTimeSignatureOperation
  | AudioSetMasterVolumeOperation;

// =============================================================================
// Track Mix Operations — persisted per-track mix state
// =============================================================================

export interface TrackMixSetVolumeOperation {
  type: 'track.mix.setVolume';
  meta: OperationMeta;
  payload: { trackId: string; volume: number };
  before: { volume: number };
}

export interface TrackMixSetPanOperation {
  type: 'track.mix.setPan';
  meta: OperationMeta;
  payload: { trackId: string; pan: number };
  before: { pan: number };
}

export interface TrackMixSetSoloOperation {
  type: 'track.mix.setSolo';
  meta: OperationMeta;
  payload: { trackId: string; solo: boolean };
  before: { solo: boolean };
}

export interface TrackMixEffectAddOperation {
  type: 'track.mix.effect.add';
  meta: OperationMeta;
  payload: { trackId: string; effect: AudioEffectConfig; index: number };
}

export interface TrackMixEffectRemoveOperation {
  type: 'track.mix.effect.remove';
  meta: OperationMeta;
  payload: { trackId: string; effectId: string };
  before: { effect: AudioEffectConfig; index: number };
}

export interface TrackMixEffectUpdateOperation {
  type: 'track.mix.effect.update';
  meta: OperationMeta;
  payload: {
    trackId: string;
    effectId: string;
    updates: Partial<Omit<AudioEffectConfig, 'id'>>;
  };
  before: { updates: Partial<Omit<AudioEffectConfig, 'id'>> };
}

export interface TrackMixEffectMoveOperation {
  type: 'track.mix.effect.move';
  meta: OperationMeta;
  payload: { trackId: string; effectId: string; fromIndex: number; toIndex: number };
}

export interface TrackMixSetAutomationOperation {
  type: 'track.mix.setAutomation';
  meta: OperationMeta;
  payload: { trackId: string; automation?: AudioAutomationLane[] };
  before: { automation?: AudioAutomationLane[] };
}

export type TrackMixOperation =
  | TrackMixSetVolumeOperation
  | TrackMixSetPanOperation
  | TrackMixSetSoloOperation
  | TrackMixEffectAddOperation
  | TrackMixEffectRemoveOperation
  | TrackMixEffectUpdateOperation
  | TrackMixEffectMoveOperation
  | TrackMixSetAutomationOperation;

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
  | SketchOperation
  | AudioOperation
  | TrackMixOperation
  | BatchOperation;

/**
 * 提取操作的 type 字段字面量类型
 */
export type EditOperationType = EditOperation['type'];
