/**
 * VideoRenderer — Adapter wrapping VideoCard for the RichContent registry.
 */

import type { RichContentProps, RichContentRendererEntry } from '../types';
import { VideoCard } from '@/components/ChatView/MediaPreview';

// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------

export interface VideoRichData {
  src: string;
  poster?: string;
  title?: string;
  localPath?: string;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function isVideoRichData(data: unknown): data is VideoRichData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d['src'] === 'string';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function VideoRendererComponent({ data, className, inline }: RichContentProps<VideoRichData>) {
  return (
    <VideoCard
      src={data.src}
      poster={data.poster}
      title={data.title}
      localPath={data.localPath}
      inline={inline}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Registry entry
// ---------------------------------------------------------------------------

export const videoRendererEntry: RichContentRendererEntry<VideoRichData> = {
  kind: 'video',
  validate: isVideoRichData,
  component: VideoRendererComponent,
};
