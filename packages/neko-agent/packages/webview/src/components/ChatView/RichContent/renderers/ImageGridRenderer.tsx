/**
 * ImageGridRenderer — Adapter wrapping ImageGridCard for the RichContent registry.
 */

import type { RichContentProps, RichContentRendererEntry } from '../types';
import { ImageGridCard } from '@/components/ChatView/MediaPreview';

// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------

export interface ImageGridRichData {
  urls: string[];
  localPaths?: string[];
  name?: string;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function isImageGridRichData(data: unknown): data is ImageGridRichData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d['urls']);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ImageGridRendererComponent({
  data,
  className,
  openOnClick,
}: RichContentProps<ImageGridRichData>) {
  return (
    <ImageGridCard
      urls={data.urls}
      localPaths={data.localPaths}
      name={data.name}
      openOnClick={openOnClick}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Registry entry
// ---------------------------------------------------------------------------

export const imageGridRendererEntry: RichContentRendererEntry<ImageGridRichData> = {
  kind: 'image-grid',
  validate: isImageGridRichData,
  component: ImageGridRendererComponent,
};
