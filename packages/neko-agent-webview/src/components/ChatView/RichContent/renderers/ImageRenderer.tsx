/**
 * ImageRenderer — Adapter wrapping ImagePreview for the RichContent registry.
 */

import type { RichContentProps, RichContentRendererEntry } from '../types';
import { ImagePreview } from '@/components/ChatView/MediaPreview';

// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------

export interface ImageRichData {
  src: string;
  alt?: string;
  name?: string;
  localPath?: string;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function isImageRichData(data: unknown): data is ImageRichData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d['src'] === 'string';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ImageRendererComponent({
  data,
  className,
  inline,
  openOnClick,
}: RichContentProps<ImageRichData>) {
  return (
    <ImagePreview
      src={data.src}
      alt={data.alt}
      name={data.name}
      localPath={data.localPath}
      inline={inline}
      openOnClick={openOnClick}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Registry entry
// ---------------------------------------------------------------------------

export const imageRendererEntry: RichContentRendererEntry<ImageRichData> = {
  kind: 'image',
  validate: isImageRichData,
  component: ImageRendererComponent,
};
