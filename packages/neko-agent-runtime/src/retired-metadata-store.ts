export type RetiredAgentMetadataStoreKind = 'conversation-index-json' | 'conversation-file-storage';

export class RetiredAgentMetadataStoreError extends Error {
  override readonly name = 'RetiredAgentMetadataStoreError';
  readonly code = 'agent-retired-metadata-store';

  constructor(readonly storeKind: RetiredAgentMetadataStoreKind) {
    super(
      `Retired Agent metadata store cannot be used for normal runtime access: ${storeKind}. Use the shared user-level SQLite repository or an explicit migration source.`,
    );
  }
}
