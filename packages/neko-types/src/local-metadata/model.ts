export interface LocalMetadataPartition {
  readonly scope: 'global' | 'workspace';
  readonly workspaceId: string | null;
  readonly domain: string;
}

export interface LocalMetadataPartitionRevision {
  readonly partition: LocalMetadataPartition;
  readonly revision: number;
  readonly freshness: 'fresh' | 'stale' | 'rebuilding';
  readonly diagnostic: string | null;
  readonly updatedAt: string;
}
