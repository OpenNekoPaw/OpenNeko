import { describe, expect, it, vi } from 'vitest';

import type { LocalMetadataStore, LocalMetadataTransactionContext } from '@neko/local-metadata';

import { removeRetiredPiStorage } from './retired-pi-storage-cleanup';

describe('removeRetiredPiStorage', () => {
  it('removes only the exact retired Pi directories and tables', async () => {
    const remove = vi.fn(async () => undefined);
    const run = vi.fn(async () => ({ changes: 0, lastInsertRowid: 0 }));
    const transaction = vi.fn(
      async <T>(
        _options: unknown,
        operation: (context: LocalMetadataTransactionContext) => Promise<T>,
      ) =>
        operation({
          mode: 'system-write',
          ownership: 'system',
          repositories: {} as LocalMetadataTransactionContext['repositories'],
          sql: { run, all: vi.fn(async () => []) },
        }),
    );

    await removeRetiredPiStorage({
      metadataStore: { transaction } as unknown as LocalMetadataStore,
      files: { remove },
    });

    expect(remove.mock.calls).toEqual([['conversations'], ['journals']]);
    expect(run.mock.calls).toEqual([
      ['DROP TABLE IF EXISTS agent_conversation_records'],
      ['DROP TABLE IF EXISTS conversations'],
      ['DROP TABLE IF EXISTS pi_conversations'],
      ['DROP TABLE IF EXISTS pi_messages'],
    ]);
    expect(transaction).toHaveBeenCalledWith(
      {
        mode: 'system-write',
        ownership: 'system',
        operation: 'remove-retired-pi-agent-storage',
      },
      expect.any(Function),
    );
  });

  it('fails visibly without dropping tables when retired file removal fails', async () => {
    const transaction = vi.fn();

    await expect(
      removeRetiredPiStorage({
        metadataStore: { transaction } as unknown as LocalMetadataStore,
        files: {
          remove: async (directory) => {
            if (directory === 'journals') throw new Error('permission denied');
          },
        },
      }),
    ).rejects.toThrow('permission denied');

    expect(transaction).not.toHaveBeenCalled();
  });
});
