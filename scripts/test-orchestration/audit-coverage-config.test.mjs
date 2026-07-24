import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditCoverageConfigs } from './audit-coverage-config.mjs';

describe('coverage owner config audit', () => {
  it('requires every canonical test owner to use explicit shared coverage', async () => {
    const result = await auditCoverageConfigs();
    assert.equal(result.ok, true);
    assert.equal(result.owners, 24);
  });

  it('fails visibly for an unknown owner config', async () => {
    const result = await auditCoverageConfigs({
      throwOnError: false,
      ownership: {
        workspaces: [
          { path: 'packages/missing', owner: 'packages/missing', mode: 'self' },
        ],
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /has no vitest\.config\.ts/u);
  });
});
