import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startHostWithInfrastructureRetry } from './scenario-runtime.mjs';

describe('webview functional host retry policy', () => {
  it('retries one infrastructure startup failure', async () => {
    let attempts = 0;
    const host = await startHostWithInfrastructureRetry({}, {}, {}, () => ({
      identity: {},
      async start() {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error('CDP startup failed');
          error.failureClassification = 'infrastructure';
          throw error;
        }
      },
    }));

    assert.equal(attempts, 2);
    assert.equal(host.identity.startupAttempt, 2);
  });

  it('does not retry non-infrastructure startup failures', async () => {
    let attempts = 0;
    await assert.rejects(
      startHostWithInfrastructureRetry({}, {}, {}, () => ({
        identity: {},
        async start() {
          attempts += 1;
          const error = new Error('business contract failed');
          error.failureClassification = 'test-case';
          throw error;
        },
      })),
      /business contract failed/u,
    );
    assert.equal(attempts, 1);
  });
});
