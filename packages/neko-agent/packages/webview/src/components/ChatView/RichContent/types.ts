/**
 * RichContent — Registry-driven content block rendering (ADR-6 §6.2)
 *
 * Type definitions for the renderer registry pattern that replaces
 * hard-coded if/switch dispatching in TaskCard and ToolCallDisplay.
 */

import type { ComponentType } from 'react';

// ---------------------------------------------------------------------------
// Content kinds
// ---------------------------------------------------------------------------

/** Built-in rich content kinds shipped with neko-agent */
export type BuiltinContentKind =
  'image' | 'image-grid' | 'video' | 'audio' | 'storyboard' | 'panoramic-image' | 'panoramic-video';

/**
 * Union of all content kinds.
 * Accepts any string so third-party renderers can register custom kinds
 * without modifying this type.
 */
export type RichContentKind = BuiltinContentKind | (string & {});

// ---------------------------------------------------------------------------
// Renderer props
// ---------------------------------------------------------------------------

/** Props passed to every registered renderer component */
export interface RichContentProps<T = unknown> {
  /** Typed data payload validated by the renderer entry */
  data: T;
  conversationId?: string | null;
  className?: string;
  /** Compact mode — no header/chrome, used inside TaskCard inline results */
  inline?: boolean;
  /** Whether clicking the rendered media should request the host to open it. */
  openOnClick?: boolean;
}

// ---------------------------------------------------------------------------
// Registry entry
// ---------------------------------------------------------------------------

/** A single renderer registration: kind → validate → component */
export interface RichContentRendererEntry<T = unknown> {
  /** Unique content kind identifier (e.g. 'video', 'image-grid') */
  kind: string;
  /** Type guard that validates the raw data shape before rendering */
  validate: (data: unknown) => data is T;
  /** React component responsible for rendering this content kind */
  component: ComponentType<RichContentProps<T>>;
}
