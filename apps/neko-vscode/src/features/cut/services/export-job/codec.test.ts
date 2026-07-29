import { describe, expect, it } from 'vitest';
import { decodeExportJobSnapshot } from './codec';

describe('Export Job persistence codec', () => {
  it('rejects the retired Engine snapshot instead of resuming through compatibility fields', () => {
    expect(() =>
      decodeExportJobSnapshot(
        JSON.stringify({
          engineJobId: 'retired-engine-job',
          request: { engineConfig: { executionKey: 'legacy' } },
        }),
      ),
    ).toThrow('retired Engine schema');
  });
});
