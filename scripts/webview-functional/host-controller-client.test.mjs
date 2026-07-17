import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isControllerConnectionForRun } from './host-controller-client.mjs';

describe('VS Code functional host controller identity', () => {
  it('rejects the stale controller process during reload handoff', () => {
    const stale = { port: 41000, token: 'run-token', pid: 1200 };
    const replacement = { port: 41001, token: 'run-token', pid: 1201 };

    assert.equal(isControllerConnectionForRun(stale, 'run-token', 1200), false);
    assert.equal(isControllerConnectionForRun(replacement, 'run-token', 1200), true);
    assert.equal(isControllerConnectionForRun(replacement, 'other-token', 1200), false);
  });

  it('accepts a controller-generated token while still validating connection shape', () => {
    assert.equal(
      isControllerConnectionForRun({ port: 41000, token: 'random-token', pid: 1200 }, undefined),
      true,
    );
    assert.equal(
      isControllerConnectionForRun({ port: 41000, token: '', pid: 1200 }, undefined),
      false,
    );
  });
});
