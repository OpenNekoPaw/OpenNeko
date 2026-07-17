/**
 * RichContent renderers — barrel export.
 */

export { imageRendererEntry, type ImageRichData } from './ImageRenderer';
export { imageGridRendererEntry, type ImageGridRichData } from './ImageGridRenderer';
export { panoramicImageRendererEntry, panoramicVideoRendererEntry } from './PanoramicRenderer';
export { videoRendererEntry, type VideoRichData } from './VideoRenderer';
export { audioRendererEntry, type AudioRichData } from './AudioRenderer';
export { storyboardRendererEntry, type StoryboardRichData } from './StoryboardRenderer';
export {
  compositeArtifactRendererEntry,
  type CompositeArtifactRichData,
  type CompositeArtifactPageRichData,
} from './CompositeArtifactRenderer';
export {
  assetGalleryRendererEntry,
  comparisonGridRendererEntry,
  storyboardTableRendererEntry,
} from './CompositeRenderers';
export type {
  AssetGalleryRichData,
  ComparisonGridRichData,
  StoryboardTableRichData,
} from '@/presenters/composite-content-presenter';
