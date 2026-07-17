import { describe, expect, it } from 'vitest';
import {
  NodeLocalMetadataBulkWorkerExecutor,
  isLocalMetadataBulkWorkerResult,
} from '../local-metadata-bulk-worker-executor';

describe('local metadata bulk worker executor', () => {
  it('runs bulk projection work off the Extension Host event loop', async () => {
    const executor = new NodeLocalMetadataBulkWorkerExecutor({
      workerUrl: new URL('./fixtures/local-metadata-bulk-worker.mjs', import.meta.url),
    });
    let hostTicked = false;
    const execution = executor.execute({
      operation: 'fts-rebuild',
      databasePath: '/fixture/neko.db',
      workspaceId: '9b2de3b5-5f50-4be4-9551-71fb5b512489',
      domain: 'search',
      payload: { documentCount: 250 },
    });
    await new Promise<void>((resolve) => {
      setImmediate(() => {
        hostTicked = true;
        resolve();
      });
    });

    const result = await execution;
    expect(hostTicked).toBe(true);
    expect(isLocalMetadataBulkWorkerResult(result)).toBe(true);
    expect(result).toEqual({ operation: 'fts-rebuild', processedCount: 250 });
  });
});
