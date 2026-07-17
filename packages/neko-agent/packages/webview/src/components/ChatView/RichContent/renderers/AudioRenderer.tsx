/**
 * AudioRenderer — Adapter wrapping AudioCard for the RichContent registry.
 */

import type { RichContentProps, RichContentRendererEntry } from '../types';
import { AudioCard } from '@/components/ChatView/MediaPreview';

// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------

export interface AudioRichData {
  src: string;
  title?: string;
  localPath?: string;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function isAudioRichData(data: unknown): data is AudioRichData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d['src'] === 'string';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AudioRendererComponent({ data, className, inline }: RichContentProps<AudioRichData>) {
  return (
    <AudioCard
      src={data.src}
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

export const audioRendererEntry: RichContentRendererEntry<AudioRichData> = {
  kind: 'audio',
  validate: isAudioRichData,
  component: AudioRendererComponent,
};
