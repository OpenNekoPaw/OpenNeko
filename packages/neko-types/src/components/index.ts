/**
 * @neko/shared/components — legacy shared UI compatibility surface
 *
 * Components use CSS classes injected by the Tailwind preset plugin.
 * All packages using nekoTailwindPreset get these classes automatically.
 *
 * New Webview UI code should import React UI from @neko/ui. This subpath stays
 * available during the Webview UI design system migration for untouched legacy
 * packages and compatibility re-exports.
 *
 * Legacy import:
 *   import { VerticalToolbar, ToolbarButton, ContextMenu, MacButton, ... } from '@neko/shared/components';
 */

// ── Layout / Structure ────────────────────────────────────────────────────────

export { VerticalToolbar, ToolbarButton, ToolbarSeparator, ToolbarSpacer } from './Toolbar';
export type { VerticalToolbarProps, ToolbarButtonProps } from './Toolbar';

export { CollapsibleSection } from './CollapsibleSection';
export type { CollapsibleSectionProps } from './CollapsibleSection';

export { Panel, PanelSection } from './Panel';
export type { PanelProps, PanelSectionProps } from './Panel';

export { ResizeHandle } from './ResizeHandle';
export type { ResizeHandleProps } from './ResizeHandle';

// ── Overlay ───────────────────────────────────────────────────────────────────

export { ContextMenu } from './ContextMenu';
export type { ContextMenuProps, MenuItem, MenuAction, MenuSeparator } from './ContextMenu';

export { buildAIMenuSection } from './contextMenuAI';
export type { AICapability, AIMenuConfig } from './contextMenuAI';

// ── Media ─────────────────────────────────────────────────────────────────────

export { TimelineRuler } from './TimelineRuler';
export type { TimelineRulerProps } from './TimelineRuler';

export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps } from './ProgressBar';

// ── Keyframe Editing ─────────────────────────────────────────────────────────

export { KeyframeDiamond } from './KeyframeDiamond';
export type { KeyframeDiamondProps } from './KeyframeDiamond';

export { KeyframeTimeline } from './KeyframeTimeline';
export type { KeyframeTimelineProps } from './KeyframeTimeline';

// ── Primitives (macOS-style controls) ─────────────────────────────────────────

export { MacButton } from './MacButton';
export type { MacButtonProps, ButtonVariant, ButtonSize } from './MacButton';

export { MacIconButton } from './MacIconButton';
export type { MacIconButtonProps, IconButtonSize } from './MacIconButton';

export { MacSlider } from './MacSlider';
export type { MacSliderProps } from './MacSlider';

export { MacTabs } from './MacTabs';
export type { MacTabsProps, MacTab } from './MacTabs';

// ── Hooks ────────────────────────────────────────────────────────────────────

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
  UseResizableControlledOptions,
  UseResizableOptions,
  UseResizableReturn,
  UseResizableUncontrolledOptions,
} from './useResizable';
