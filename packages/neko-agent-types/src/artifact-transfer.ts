import type {
  ArtifactExecutionSummary,
  CompositeArtifactBlock,
  CompositeArtifact,
} from '@neko/shared';

export interface ArtifactSnapshotTransferPayload {
  readonly type: 'artifactSnapshot';
  readonly artifact: CompositeArtifact;
  readonly complete?: boolean;
  readonly blockCursor?: string;
}

export interface ArtifactBlockPageTransferPayload {
  readonly type: 'artifactBlockPage';
  readonly artifactId: string;
  readonly blocks: readonly CompositeArtifactBlock[];
  readonly cursor?: string;
  readonly complete: boolean;
}

export interface ArtifactBackfillTransferPayload {
  readonly type: 'artifactBackfill';
  readonly artifact: CompositeArtifact;
  readonly mergeMode?: 'append' | 'replace';
}

export interface ArtifactExecutionSummaryTransferPayload {
  readonly type: 'artifactExecutionSummary';
  readonly summary: ArtifactExecutionSummary;
}

export type AgentArtifactTransferPayload =
  | ArtifactSnapshotTransferPayload
  | ArtifactBlockPageTransferPayload
  | ArtifactBackfillTransferPayload
  | ArtifactExecutionSummaryTransferPayload;
