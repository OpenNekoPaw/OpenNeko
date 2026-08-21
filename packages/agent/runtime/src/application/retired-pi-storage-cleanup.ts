import type { LocalMetadataStore } from '@neko/local-metadata';

const RETIRED_PI_TABLES = [
  'agent_conversation_records',
  'conversations',
  'pi_conversations',
  'pi_messages',
] as const;

export const RETIRED_PI_STORAGE_DIRECTORIES = ['conversations', 'journals'] as const;

export type RetiredPiStorageDirectory = (typeof RETIRED_PI_STORAGE_DIRECTORIES)[number];

export interface RetiredPiStorageFilePort {
  remove(directory: RetiredPiStorageDirectory): Promise<void>;
}

export interface RemoveRetiredPiStorageOptions {
  readonly metadataStore: LocalMetadataStore;
  readonly files: RetiredPiStorageFilePort;
}

export async function removeRetiredPiStorage(
  options: RemoveRetiredPiStorageOptions,
): Promise<void> {
  for (const directory of RETIRED_PI_STORAGE_DIRECTORIES) {
    await options.files.remove(directory);
  }

  await options.metadataStore.transaction(
    {
      mode: 'system-write',
      ownership: 'system',
      operation: 'remove-retired-pi-agent-storage',
    },
    async ({ sql }) => {
      for (const table of RETIRED_PI_TABLES) {
        await sql.run(`DROP TABLE IF EXISTS ${table}`);
      }
    },
  );
}
