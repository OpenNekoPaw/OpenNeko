import fs from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertDesktopBaselineCandidate,
  validateEvidenceMigrationLedger,
} from './evidence-migration.mjs';

const REPO_ROOT = join(import.meta.dirname, '../../..');

describe('retired TUI evidence migration', () => {
  it('keeps Host attribution and only maps host-neutral authoring assets', async () => {
    const ledger = JSON.parse(
      await fs.readFile(
        join(REPO_ROOT, 'scripts/agent-eval/migrations/tui-evidence-ledger.json'),
        'utf8',
      ),
    );
    expect(validateEvidenceMigrationLedger(ledger)).toEqual(ledger);
    expect(ledger.retiredHost).toMatchObject({ kind: 'tui', status: 'retired' });
    expect(JSON.stringify(ledger.reusableMappings)).not.toMatch(/report|baseline|latency|score/iu);
  });

  it('rejects historical TUI or unattributed evidence as a Desktop baseline', () => {
    expect(() => assertDesktopBaselineCandidate({ executionHost: { kind: 'tui' } })).toThrow(
      'historical TUI evidence is non-comparable',
    );
    expect(() => assertDesktopBaselineCandidate({})).toThrow('observed=missing');
    expect(
      assertDesktopBaselineCandidate({ executionHost: { kind: 'desktop' }, id: 'baseline-1' }),
    ).toMatchObject({ id: 'baseline-1' });
  });
});
