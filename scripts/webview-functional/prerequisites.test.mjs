import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runPrerequisites } from './prerequisites.mjs';

describe('webview functional prerequisites', () => {
  it('projects an isolated unavailable Engine port without simulating readiness', async () => {
    const runtime = await runPrerequisites(
      [{ kind: 'engine', state: 'unavailable' }],
      '/repo',
      'darwin',
      { reservePort: async () => 4567 },
    );

    assert.equal(runtime.environment.NEKO_ENGINE_PORT, '4567');
    assert.deepEqual(runtime.observations.map((entry) => entry.event), [
      'engine.health.unavailable',
    ]);
    await runtime.cleanup();
  });

  it('waits for the real Engine health boundary and owns process cleanup', async () => {
    const listeners = new Map();
    const child = {
      exitCode: null,
      stdout: { on() {} },
      stderr: { on() {} },
      once(event, listener) {
        listeners.set(event, listener);
      },
      kill(signal) {
        assert.equal(signal, 'SIGTERM');
        this.exitCode = 0;
        listeners.get('exit')?.(0, null);
      },
    };
    const runtime = await runPrerequisites(
      [{ kind: 'engine', state: 'ready' }],
      '/repo',
      'darwin',
      {
        reservePort: async () => 7654,
        engineExecutable: process.execPath,
        spawnEngine: () => child,
        fetchHealth: async () => ({ ok: true }),
      },
    );

    assert.equal(runtime.environment.NEKO_ENGINE_PORT, '7654');
    assert.deepEqual(runtime.observations.map((entry) => entry.event), ['engine.health.ready']);
    await runtime.cleanup();
    assert.equal(child.exitCode, 0);
  });
});
