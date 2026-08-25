import type { ContentLocator } from '@neko/content-domain';

export type AgentFileReferenceSource =
  'workspace' | 'media-library' | 'asset-library' | 'entity-graph' | 'story' | 'canvas';

export type AgentFileReferenceMediaType =
  'video' | 'audio' | 'image' | 'sequence' | 'text' | 'document';

export interface AgentFileReference {
  readonly id: string;
  readonly contentLocator: ContentLocator;
  readonly label: string;
  readonly mediaType?: AgentFileReferenceMediaType;
  readonly source?: AgentFileReferenceSource;
  readonly thumbnailUri?: string;
}
