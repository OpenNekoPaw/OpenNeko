/**
 * RichContent — Registry-driven content block rendering (ADR-6 §6.2)
 *
 * Usage:
 *   import { RichContentRenderer, registerDefaultRenderers } from '@/components/ChatView/RichContent';
 *   registerDefaultRenderers();  // once at app init
 *   <RichContentRenderer kind="video" data={{ src, poster, title, localPath }} inline />
 */

export { RichContentRenderer } from './RichContentRenderer';
export { registerDefaultRenderers } from './defaultRenderers';
export type { RichContentKind, RichContentProps, RichContentRendererEntry } from './types';
// Re-export data shapes for convenience
export type { ImageRichData } from './renderers/ImageRenderer';
export type { ImageGridRichData } from './renderers/ImageGridRenderer';
export type { VideoRichData } from './renderers/VideoRenderer';
export type { AudioRichData } from './renderers/AudioRenderer';
export type { StoryboardRichData } from './renderers/StoryboardRenderer';
export type {
  AssetGalleryRichData,
  ComparisonGridRichData,
  StoryboardTableRichData,
} from '@/presenters/composite-content-presenter';
