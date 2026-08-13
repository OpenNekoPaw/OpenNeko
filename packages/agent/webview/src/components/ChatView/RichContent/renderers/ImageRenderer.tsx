/**
 * ImageRenderer — authorized Preview descriptor adapter for the RichContent registry.
 */

import { parsePreviewMediaDescriptor, type PreviewMediaDescriptor } from '@neko/preview-domain';
import { LightweightPreview } from '@neko/preview-webview/root';
import type { RichContentProps, RichContentRendererEntry } from '../types';
import { getLocale } from '../../../../i18n';

// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------

export interface ImageRichData {
  descriptor: PreviewMediaDescriptor;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function isImageRichData(data: unknown): data is ImageRichData {
  if (typeof data !== 'object' || data === null) return false;
  try {
    return parsePreviewMediaDescriptor(Reflect.get(data, 'descriptor')).contentKind === 'image';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ImageRendererComponent({ data, className }: RichContentProps<ImageRichData>) {
  return (
    <div className={className}>
      <LightweightPreview descriptor={data.descriptor} locale={getLocale()} />
    </div>
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
