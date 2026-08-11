/**
 * VideoRenderer — authorized Preview descriptor adapter for the RichContent registry.
 */

import { parsePreviewMediaDescriptor, type PreviewMediaDescriptor } from '@neko/preview-domain';
import { QuickPreviewSurface } from '@neko/preview-webview/embedded';
import type { RichContentProps, RichContentRendererEntry } from '../types';
import { getLocale } from '../../../../i18n';

// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------

export interface VideoRichData {
  descriptor: PreviewMediaDescriptor;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function isVideoRichData(data: unknown): data is VideoRichData {
  if (typeof data !== 'object' || data === null) return false;
  try {
    return parsePreviewMediaDescriptor(Reflect.get(data, 'descriptor')).contentKind === 'video';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function VideoRendererComponent({ data, className }: RichContentProps<VideoRichData>) {
  return (
    <div className={className}>
      <QuickPreviewSurface descriptor={data.descriptor} locale={getLocale()} />
    </div>
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
