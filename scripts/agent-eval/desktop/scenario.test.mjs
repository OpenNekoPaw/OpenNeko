import { describe, expect, it } from 'vitest';
import { validateDesktopFunctionalScenario } from '../../desktop-functional/scenario-contract.mjs';
import {
  createDesktopAgentEvaluationScenario,
  validateAuthorizedUserConfiguration,
} from './scenario.mjs';

describe('Desktop Agent declarative scenario adapter', () => {
  it('creates a package-owned functional scenario for an ordinary case id', () => {
    const scenario = createDesktopAgentEvaluationScenario(executionCase(), authorization());

    expect(validateDesktopFunctionalScenario(scenario)).toBe(scenario);
    expect(scenario).toMatchObject({
      id: 'agent-eval-ordinary-new-case',
      owner: '@neko/agent-runtime',
    });
  });

  it('does not own assertion evaluation or case-specific outcome branches', () => {
    const input = executionCase();
    input.assertions = [
      {
        id: 'process',
        kind: 'process-order',
        events: [],
        evidenceRef: 'facts',
      },
    ];

    expect(
      validateDesktopFunctionalScenario(
        createDesktopAgentEvaluationScenario(input, authorization()),
      ),
    ).toMatchObject({ id: 'agent-eval-ordinary-new-case', owner: '@neko/agent-runtime' });
  });

  it('validates and preserves the authorized user TOML without compiling it', () => {
    const source = `default_provider = "provider-1"
default_model = "model-1"

[[providers]]
id = "provider-1"
api_key = "fixture-secret"

[[models]]
id = "model-1"
provider_id = "provider-1"
`;
    const validated = validateAuthorizedUserConfiguration(source, authorization());

    expect(validated).toBe(source);
    expect(() =>
      validateAuthorizedUserConfiguration('default_provider =', authorization()),
    ).toThrow('TOML is invalid');
    expect(() =>
      validateAuthorizedUserConfiguration('default_provider = "provider-1"', authorization()),
    ).toThrow('does not declare the approved provider/model identity');
  });
});

function executionCase() {
  return {
    schema: 'neko.agent-eval.execution-case.v1',
    caseId: 'ordinary-new-case',
    fixture: { root: 'shared-fixtures/empty-workspace' },
    steps: [
      { id: 'submit', kind: 'submit', prompt: 'hello' },
      { id: 'idle', kind: 'wait-for-idle', timeoutMs: 1000 },
    ],
    assertions: [{ id: 'answer', kind: 'final-answer', mode: 'non-empty', evidenceRef: 'facts' }],
    artifactChecks: [],
    budget: { timeoutMs: 1000, repetitions: 1 },
    modelProfiles: [],
  };
}

function authorization() {
  return {
    providerId: 'provider-1',
    modelId: 'model-1',
    configurationFile: '/fixture/config.toml',
    costApproved: true,
  };
}
