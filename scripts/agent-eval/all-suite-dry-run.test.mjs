import { describe, expect, it } from 'vitest';
import { parseDryRunArgs, runAllSuiteDryRun } from './all-suite-dry-run.mjs';

describe('all-suite key-free dry-run', () => {
  it('validates every indexed suite and case', async () => {
    await expect(runAllSuiteDryRun()).resolves.toMatchObject({
      schema: 'neko.agent-eval.all-suite-dry-run',
      ok: true,
      suiteCount: 25,
      caseCount: 73,
    });
  });

  it('validates one exact indexed case without starting provider behavior', async () => {
    const options = parseDryRunArgs([
      '--suite',
      'agent-runtime.stream-delivery',
      '--case',
      'locator-backed-display-projection',
    ]);

    await expect(runAllSuiteDryRun(options)).resolves.toEqual({
      schema: 'neko.agent-eval.all-suite-dry-run',
      ok: true,
      suiteCount: 1,
      caseCount: 1,
      suites: [{ id: 'agent-runtime.stream-delivery', caseCount: 1 }],
    });
  });

  it('rejects case selection without an owning suite', () => {
    expect(() => parseDryRunArgs(['--case', 'unknown'])).toThrow('--case requires --suite');
  });
});
