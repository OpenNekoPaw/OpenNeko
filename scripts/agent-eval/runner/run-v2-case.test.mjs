import { describe, expect, it, vi } from 'vitest';
import { runV2Case } from './run-v2-case.mjs';

describe('Desktop Agent evaluation driver boundary', () => {
  it('requires an explicit provider/model/credential/cost authorization before launch', async () => {
    await expect(runV2Case(selection())).rejects.toMatchObject({
      code: 'infrastructure-blocked',
      message: expect.stringContaining('provider, model, credential environment and cost'),
    });
  });

  it('launches one isolated Desktop sample through the injected functional boundary', async () => {
    const runDesktop = vi.fn(async (options) => ({
      reportPath: '/reports/sample/desktop-functional.json',
      report: { evidence: { facts: { schemaVersion: 1 } }, scenario: options.scenario.id },
    }));
    const createScenario = vi.fn(() => ({ id: 'agent-eval-case-1', owner: 'evaluation' }));

    await expect(
      runV2Case(selection(), {
        env: { FIXTURE_KEY: 'available' },
        providerAuthorization: {
          providerId: 'provider-1',
          modelId: 'model-1',
          credentialEnvName: 'FIXTURE_KEY',
          configurationFile: '/fixtures/config.toml',
          costApproved: true,
        },
        runDesktop,
        createScenario,
        outputRoot: '/reports',
        runId: 'sample',
      }),
    ).resolves.toEqual({
      outcome: 'pass',
      result: {
        reportLocations: ['/reports/sample/desktop-functional.json'],
        facts: { schemaVersion: 1 },
      },
    });
    expect(createScenario).toHaveBeenCalledOnce();
    expect(runDesktop).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'development',
        windowMode: 'hidden',
        reportPath: '/reports/sample/desktop-functional.json',
      }),
    );
  });
});

function selection() {
  return {
    suite: {
      id: 'suite-1',
      target: { kind: 'runtime', id: 'runtime-1', contractHash: `sha256:${'a'.repeat(64)}` },
      runtimeProfiles: [
        {
          id: 'runtime-1',
          settings: {},
          configurationHash: `sha256:${'b'.repeat(64)}`,
        },
      ],
      modelProfiles: [
        {
          id: 'model-1',
          selection: 'configured-default',
          configurationHash: `sha256:${'c'.repeat(64)}`,
        },
      ],
      judgeProfiles: [],
      fixtures: [
        {
          id: 'fixture-1',
          root: 'shared-fixtures/fixture-1',
          source: 'repository',
          digest: `sha256:${'d'.repeat(64)}`,
          mutable: true,
        },
      ],
      reportPolicy: { rawRetentionDays: 14, trustedCiRetentionDays: 14, committedSummary: true },
    },
    scenario: {
      schema: 'neko.agent-eval.scenario.v2',
      id: 'locator-backed-display-projection',
      suiteId: 'suite-1',
      caseGroup: 'regression',
      visibility: 'public',
      evidenceContract: {
        userBehavior: 'Run one Desktop turn.',
        canonicalPath: ['Desktop'],
        forbiddenFallback: ['direct runtime'],
        observables: [{ ref: 'facts', kind: 'runtime-fact', description: 'facts', required: true }],
        expectedResult: 'turn completes',
        expectedFailure: 'turn fails',
      },
      fixtureRefs: ['fixture-1'],
      runtimeProfileId: 'runtime-1',
      modelProfileIds: ['model-1'],
      steps: [
        { id: 'submit', kind: 'submit', prompt: 'hello' },
        { id: 'idle', kind: 'wait-for-idle', timeoutMs: 1000 },
      ],
      assertions: [{ id: 'answer', kind: 'final-answer', mode: 'non-empty', evidenceRef: 'facts' }],
      artifactChecks: [],
      budget: { timeoutMs: 1000, repetitions: 1 },
    },
  };
}
