/**
 * Node Type Descriptor — unified metadata for each canvas node type.
 *
 * Converges three previously scattered definitions into a single source of truth:
 *   - Display label i18n key (was in PropertyPanel.tsx:getNodeTypeLabel)
 *   - Toolbar icon           (was in CanvasToolbar.tsx inline emoji)
 *   - Default creation size  (was in nodeFactory.ts switch cases)
 *
 * Property panel renderers remain in PropertyPanel.tsx to avoid circular imports
 * (PropertyPanel depends on i18n + form helpers that would create a cycle).
 */

import type React from 'react';
import type { CanvasNode, CanvasNodeType } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface NodeDefaultSize {
  width: number;
  height: number;
}

export type NodePresentation = 'foundational' | 'spatial-container' | 'structured';

export type NodeFullscreenPresentation =
  | 'image-viewer'
  | 'visual-stage'
  | 'text-document'
  | 'workbench'
  | 'shot-workbench';

export type NodeFullscreenPresentationResolver = (
  node: CanvasNode,
) => NodeFullscreenPresentation | undefined;

export type NodeFullscreenPresentationDeclaration =
  | NodeFullscreenPresentation
  | NodeFullscreenPresentationResolver;

export interface NodeTypeDescriptor {
  /** Canvas node type (matches CanvasNodeType union) */
  type: CanvasNodeType;
  /** i18n key for the display label, resolved via t() at render time */
  labelKey: string;
  /** Toolbar/library icon. Strings are supported for existing descriptors. */
  icon: React.ReactNode;
  /** Short uppercase tag label for the node header (e.g. "SHOT", "SCENE") */
  tagLabel: string;
  /** Hex color for the type tag in the node header */
  tagColor: string;
  /** Default size when creating a new node of this type */
  defaultSize: NodeDefaultSize;
  /** Renderer chrome policy. Presentation never becomes persisted Canvas data. */
  presentation: NodePresentation;
  /** Optional fullscreen capability. A resolver may select a viewer from durable node material. */
  fullscreenPresentation?: NodeFullscreenPresentationDeclaration;
}

/**
 * Complete registry of all node type descriptors.
 */
export type NodeTypeDescriptorRegistry = Partial<Record<CanvasNodeType, NodeTypeDescriptor>>;

// =============================================================================
// Accessor utilities
// =============================================================================

/**
 * Resolve the i18n display label for a node type.
 */
export function getNodeLabel(
  registry: NodeTypeDescriptorRegistry,
  type: CanvasNodeType,
  t: (key: string) => string,
): string {
  const descriptor = registry[type];
  return descriptor ? t(descriptor.labelKey) : type;
}

export function resolveNodeFullscreenPresentation(
  descriptor: NodeTypeDescriptor | undefined,
  node: CanvasNode,
): NodeFullscreenPresentation | undefined {
  const declaration = descriptor?.fullscreenPresentation;
  return typeof declaration === 'function' ? declaration(node) : declaration;
}
