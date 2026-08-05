import { describe, expect, it } from 'vitest';
import { evaluateLocalMetadataCacheQuota } from '../repositories';

describe('local metadata contracts', () => {
  it('computes bounded cache reclamation without touching state ownership', () => {
    expect(
      evaluateLocalMetadataCacheQuota(
        { maximumBytes: 1_000, targetBytes: 750, orphanRetentionMs: 86_400_000 },
        1_200,
      ),
    ).toEqual({ overBudget: true, reclaimBytes: 450 });
    expect(
      evaluateLocalMetadataCacheQuota(
        { maximumBytes: 1_000, targetBytes: 750, orphanRetentionMs: 86_400_000 },
        900,
      ),
    ).toEqual({ overBudget: false, reclaimBytes: 0 });
  });
});
