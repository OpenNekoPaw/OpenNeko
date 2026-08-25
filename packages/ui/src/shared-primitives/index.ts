/**
 * Internal resize/drag/drop primitives shared between `@neko/ui/hooks` and
 * `@neko/ui/primitives`. This is not a public entry: the canonical public surfaces
 * are `@neko/ui/hooks` (useResizable/useDrag/useFileDrop and persisted-resize helpers)
 * and `@neko/ui/primitives` (ResizeHandle).
 */

export { useFileDrop } from './useFileDrop';
export type {
  FileDropOptions,
  FileDropResult,
  FileDropResultType,
  FileDropBindings,
} from './useFileDrop';

export { useDrag } from './useDrag';
export type { DragCallbacks, DragOptions, DragBindings } from './useDrag';

export {
  normalizeResizeState,
  readPersistedResizeState,
  usePersistedResize,
  useResizable,
  writePersistedResizeState,
} from './useResizable';
export type {
  PersistedResizeOptions,
  PersistedResizeReturn,
  ResizeBounds,
  ResizeEdge,
  ResizeHandleBindings,
  ResizeMode,
  ResizeOrientation,
  ResizePointerPosition,
  ResizeRect,
  ResizeState,
  ResizeStateDiagnostic,
  ResizeStateDiagnosticReporter,
  UseResizableControlledOptions,
  UseResizableOptions,
  UseResizableReturn,
  UseResizableUncontrolledOptions,
} from './useResizable';
