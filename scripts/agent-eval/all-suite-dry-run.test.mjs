import { describe, expect, it } from 'vitest';
import { runAllSuiteDryRun } from './all-suite-dry-run.mjs';

describe('all-suite key-free dry-run', () => {
  it('validates every indexed v2 suite and case', async () => {
    await expect(runAllSuiteDryRun()).resolves.toMatchObject({
      schema: 'neko.agent-eval.all-suite-dry-run.v2',
      ok: true,
      suiteCount: 23,
      caseCount: 45,
    });
  });
});
