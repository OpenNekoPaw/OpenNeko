// =============================================================================
// Operations — 统一导出
// =============================================================================

export * from './types';
export * from './errors';
export { applyOperation } from './apply';
export { invertOperation } from './invert';

// Apply primitive abstraction (P2 W6 — dual-flow)
export {
  createApplyRegistry,
  type ApplyFn,
  type ApplyDescriptor,
  type IApplyRegistry,
} from './apply-primitive';
export { applyCanvasOperation } from './apply-canvas';
export {
  findTrack,
  findElement,
  findShape,
  updateTrackInProject,
  updateElementInProject,
  updateShapeInProject,
  getShapes,
  setShapes,
  pickKeys,
  arrayMove,
  createMeta,
  type HasTracks,
} from './helpers';
