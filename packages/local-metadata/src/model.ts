export interface LocalMetadataPartition {
  readonly scope: 'global' | 'workspace';
  readonly workspaceId: string | null;
  readonly domain: string;
}
