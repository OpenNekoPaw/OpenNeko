/**
 * Editor Store - 使用 Zustand Slices 模式重构
 * 通过组合多个独立的 Slices 来管理编辑器状态
 */

import { create } from 'zustand';

// Import all slice types and creators
import { ProjectSlice, createProjectSlice } from './slices/projectSlice';
import { SelectionSlice, createSelectionSlice } from './slices/selectionSlice';
import { PlaybackSlice, createPlaybackSlice } from './slices/playbackSlice';
import { UIStateSlice, createUIStateSlice } from './slices/uiStateSlice';
import { OperationHistorySlice, createOperationHistorySlice } from './slices/operationHistorySlice';
import { DispatchSlice, createDispatchSlice } from './slices/dispatchSlice';
import { KeyframeSlice, createKeyframeSlice } from './slices/keyframeSlice';
import { TrackOpsSlice, createTrackOpsSlice } from './slices/trackOpsSlice';
import { ElementOpsSlice, createElementOpsSlice } from './slices/elementOpsSlice';
import { ElementSplitSlice, createElementSplitSlice } from './slices/elementSplitSlice';
import { ClipboardSlice, createClipboardSlice } from './slices/clipboardSlice';
import { ShapeOpsSlice, createShapeOpsSlice } from './slices/shapeOpsSlice';
import { AIActionSlice, createAIActionSlice } from './slices/aiActionSlice';

// Combined store type - intersection of all slices
export type EditorStore = ProjectSlice &
  SelectionSlice &
  PlaybackSlice &
  UIStateSlice &
  OperationHistorySlice &
  DispatchSlice &
  KeyframeSlice &
  TrackOpsSlice &
  ElementOpsSlice &
  ElementSplitSlice &
  ClipboardSlice &
  ShapeOpsSlice &
  AIActionSlice;

/**
 * Create the combined editor store
 *
 * 使用 Zustand 的 Slices 模式组合所有状态管理模块
 * 依赖顺序:
 * 1. 独立 Slices (无依赖): Project, Selection, Playback, UIState
 * 2. 历史管理 Slices: OperationHistory (操作式 undo/redo), Dispatch
 * 3. 简单依赖 Slices: Keyframe
 * 4. 复杂依赖 Slices: TrackOps, ElementOps, ElementSplit, Clipboard
 */
export const useEditorStore = create<EditorStore>()((set, get, store) => ({
  // Phase 1: 独立 Slices (无依赖)
  ...createProjectSlice(set, get, store),
  ...createSelectionSlice(set, get, store),
  ...createPlaybackSlice(set, get, store),
  ...createUIStateSlice(set, get, store),

  // Phase 2: 历史管理 Slices
  ...createOperationHistorySlice(set, get, store),
  ...createDispatchSlice(set, get, store),
  ...createKeyframeSlice(set, get, store),

  // Phase 3: 复杂依赖 Slices
  ...createTrackOpsSlice(set, get, store),
  ...createElementOpsSlice(set, get, store),
  ...createElementSplitSlice(set, get, store),
  ...createClipboardSlice(set, get, store),
  ...createShapeOpsSlice(set, get, store),
  ...createAIActionSlice(set, get, store),
}));

// Export individual slice types for external use
export type {
  ProjectSlice,
  SelectionSlice,
  PlaybackSlice,
  UIStateSlice,
  OperationHistorySlice,
  DispatchSlice,
  KeyframeSlice,
  TrackOpsSlice,
  ElementOpsSlice,
  ElementSplitSlice,
  ClipboardSlice,
  ShapeOpsSlice,
  AIActionSlice,
};
