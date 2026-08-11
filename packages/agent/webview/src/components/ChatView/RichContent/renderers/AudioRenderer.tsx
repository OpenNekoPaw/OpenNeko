/**
 * AudioRenderer — authorized Preview descriptor adapter for the RichContent registry.
 */

import { parsePreviewMediaDescriptor, type PreviewMediaDescriptor } from '@neko/preview-domain';
import { QuickPreviewSurface } from '@neko/preview-webview/embedded';
import type { RichContentProps, RichContentRendererEntry } from '../types';
import { getLocale } from '../../../../i18n';

// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------

export interface AudioRichData {
  descriptor: PreviewMediaDescriptor;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function isAudioRichData(data: unknown): data is AudioRichData {
  if (typeof data !== 'object' || data === null) return false;
  try {
    return parsePreviewMediaDescriptor(Reflect.get(data, 'descriptor')).contentKind === 'audio';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AudioRendererComponent({ data, className }: RichContentProps<AudioRichData>) {
  return (
    <div className={className}>
      <QuickPreviewSurface descriptor={data.descriptor} locale={getLocale()} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registry entry
// ---------------------------------------------------------------------------

export const audioRendererEntry: RichContentRendererEntry<AudioRichData> = {
  kind: 'audio',
  validate: isAudioRichData,
  component: AudioRendererComponent,
};
