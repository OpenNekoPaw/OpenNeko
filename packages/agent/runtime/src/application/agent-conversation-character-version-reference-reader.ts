import type { PiConversationCatalogReader } from '../pi/node-conversation-catalog-reader';

export interface AgentConversationCharacterVersionReference {
  readonly conversationId: string;
  readonly characterVersionId: string;
}

export class AgentConversationCharacterVersionReferenceReader {
  constructor(private readonly catalog: PiConversationCatalogReader) {}

  async readReferences(
    characterVersionIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly AgentConversationCharacterVersionReference[]> {
    const exactCharacterVersionIds = new Set(
      characterVersionIds.map((characterVersionId) =>
        requireIdentity(characterVersionId, 'CharacterVersion'),
      ),
    );
    signal?.throwIfAborted();
    const snapshot = this.catalog.listConversations();
    signal?.throwIfAborted();
    if (snapshot.diagnostics.length > 0) {
      throw new Error(
        `Agent Conversation reference inventory is incomplete: ${snapshot.diagnostics
          .map((diagnostic) => diagnostic.message)
          .join('; ')}`,
      );
    }
    return snapshot.records.flatMap((record) =>
      record.context?.kind === 'character' &&
      exactCharacterVersionIds.has(record.context.characterVersionId)
        ? [
            {
              conversationId: record.conversationId,
              characterVersionId: record.context.characterVersionId,
            },
          ]
        : [],
    );
  }
}

function requireIdentity(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} identity must be non-empty.`);
  return value;
}
