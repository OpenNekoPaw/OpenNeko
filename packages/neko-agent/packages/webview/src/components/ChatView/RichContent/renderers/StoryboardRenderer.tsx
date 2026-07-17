/**
 * StoryboardRenderer — Adapter wrapping StoryboardMessage for the RichContent registry.
 */

import type { RichContentProps, RichContentRendererEntry } from '../types';
import { StoryboardMessage, type StoryboardScene } from '@/components/ChatView/MediaPreview';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';

// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------

export interface StoryboardRichData {
  scenes: StoryboardScene[];
  plugins?: PluginsAvailable;
  onRegenerateScene?: (sceneIndex: number) => void;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function isStoryboardRichData(data: unknown): data is StoryboardRichData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d['scenes']);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function StoryboardRendererComponent({ data, className }: RichContentProps<StoryboardRichData>) {
  return (
    <StoryboardMessage
      scenes={data.scenes}
      plugins={data.plugins}
      onRegenerateScene={data.onRegenerateScene}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Registry entry
// ---------------------------------------------------------------------------

export const storyboardRendererEntry: RichContentRendererEntry<StoryboardRichData> = {
  kind: 'storyboard',
  validate: isStoryboardRichData,
  component: StoryboardRendererComponent,
};
