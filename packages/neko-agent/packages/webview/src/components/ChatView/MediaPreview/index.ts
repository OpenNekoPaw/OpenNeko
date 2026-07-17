/**
 * MediaPreview - Media result card components (ADR-6)
 *
 * These are lightweight result display cards — NOT full players.
 * Full playback is delegated to neko-preview via click→openFile.
 */

// Primary exports (new names per ADR-6)
export { ImagePreview } from './ImagePreview';
export { AudioCard } from './AudioCard';
export { VideoCard } from './VideoCard';
export { ImageGridCard } from './ImageGridCard';
export { StoryboardMessage, type StoryboardScene } from './StoryboardMessage';
