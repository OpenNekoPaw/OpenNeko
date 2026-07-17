import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditTestOwnership } from './audit-test-ownership.mjs';

describe('workspace test ownership audit', () => {
  it('accepts the repository ownership inventory', async () => {
    const result = await auditTestOwnership();
    assert.equal(result.ok, true);
    assert.ok(result.sourceBearingWorkspaces > 40);
  });

  it('rejects duplicate workspace ownership entries before scanning', async () => {
    const entry = {
      path: 'packages/example', owner: 'packages/example', mode: 'self',
      sourceScope: 'src/**/*.ts', testScope: 'src/**/*.test.ts',
    };
    await assert.rejects(
      auditTestOwnership({
        config: { schemaVersion: 'neko.test-ownership.v1', workspaces: [entry, entry] },
      }),
      /multiple ownership entries|unknown workspace/u,
    );
  });
});
