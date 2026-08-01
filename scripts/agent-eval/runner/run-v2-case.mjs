import { resolve } from 'node:path';
import { runAutomatedDesktopFunctional } from '../../desktop-functional/runner.mjs';
import { createDesktopAgentEvaluationScenario } from '../desktop/scenario.mjs';
import { validateScenarioForExecution } from '../schemas/contracts.mjs';

export async function runV2Case(selection, options = {}) {
  if (!selection) throw configurationError('Desktop Agent Evaluation selection is required.');
  createV2DryRun(selection);
  if (selection.scenario.id !== 'locator-backed-display-projection') {
    throw infrastructureBlocker(
      `Desktop Agent M1 execution currently supports only locator-backed-display-projection; '${selection.scenario.id}' requires its owning Desktop scenario adapter.`,
    );
  }
  const authorization = readProviderAuthorization(options.providerAuthorization, options.env ?? {});
  const runDesktop = options.runDesktop ?? runAutomatedDesktopFunctional;
  const scenario = (options.createScenario ?? createDesktopAgentEvaluationScenario)(
    selection,
    authorization,
  );
  const runId = options.runId ?? `${selection.scenario.id}-${Date.now().toString(36)}`;
  const outputRoot = resolve(options.outputRoot ?? 'reports/agent-eval');
  const execution = await runDesktop({
    scenario,
    target: options.target ?? 'development',
    windowMode: options.windowMode ?? 'hidden',
    reportPath: resolve(outputRoot, runId, 'desktop-functional.json'),
    scenarioTimeoutMs: selection.scenario.budget.timeoutMs,
  });
  return {
    outcome: 'pass',
    result: {
      reportLocations: [execution.reportPath],
      facts: execution.report.evidence?.facts,
    },
  };
}

export function createV2DryRun(selection) {
  validateScenarioForExecution(selection.scenario);
  const fixture = readSingleFixture(selection.suite, selection.scenario);
  const runtimeProfile = readProfile(
    selection.suite.runtimeProfiles,
    selection.scenario.runtimeProfileId,
    'runtime',
  );
  const modelProfiles = selection.scenario.modelProfileIds.map((id) =>
    readProfile(selection.suite.modelProfiles, id, 'model'),
  );
  return {
    ok: true,
    dryRun: true,
    schema: 'neko.agent-eval.dry-run.v2',
    suiteId: selection.suite.id,
    caseId: selection.scenario.id,
    target: selection.suite.target,
    caseGroup: selection.scenario.caseGroup,
    fixture,
    runtimeProfile,
    modelProfiles,
    steps: selection.scenario.steps,
    assertions: selection.scenario.assertions,
    reportPolicy: selection.suite.reportPolicy,
  };
}

function readSingleFixture(suite, scenario) {
  if (scenario.fixtureRefs.length !== 1) {
    throw configurationError('M1 runner requires exactly one isolated fixture per case');
  }
  return readProfile(suite.fixtures, scenario.fixtureRefs[0], 'fixture');
}

function readProfile(items, id, label) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw configurationError(`${label} ${id} is not declared by the suite`);
  return item;
}

function configurationError(message) {
  const error = new Error(message);
  error.code = 'configuration-invalid';
  return error;
}

function readProviderAuthorization(explicit, env) {
  const input =
    explicit ??
    (env.OPENNEKO_AGENT_EVAL_PROVIDER_ID ||
    env.OPENNEKO_AGENT_EVAL_MODEL_ID ||
    env.OPENNEKO_AGENT_EVAL_CREDENTIAL_ENV ||
    env.OPENNEKO_AGENT_EVAL_CONFIG_PATH ||
    env.OPENNEKO_AGENT_EVAL_COST_APPROVED
      ? {
          providerId: env.OPENNEKO_AGENT_EVAL_PROVIDER_ID,
          modelId: env.OPENNEKO_AGENT_EVAL_MODEL_ID,
          credentialEnvName: env.OPENNEKO_AGENT_EVAL_CREDENTIAL_ENV,
          configurationFile: env.OPENNEKO_AGENT_EVAL_CONFIG_PATH,
          costApproved: env.OPENNEKO_AGENT_EVAL_COST_APPROVED === 'true',
        }
      : undefined);
  if (!input) {
    throw infrastructureBlocker(
      'Real Desktop Agent evaluation requires explicit provider, model, credential environment and cost authorization.',
    );
  }
  for (const [label, value] of [
    ['provider', input.providerId],
    ['model', input.modelId],
    ['configuration file', input.configurationFile],
  ]) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw infrastructureBlocker(`Desktop Agent ${label} authorization is missing.`);
    }
  }
  if (
    typeof input.credentialEnvName !== 'string' ||
    !/^[A-Z][A-Z0-9_]*$/u.test(input.credentialEnvName)
  ) {
    throw infrastructureBlocker('Desktop Agent credential environment authorization is invalid.');
  }
  if (
    typeof env[input.credentialEnvName] !== 'string' ||
    env[input.credentialEnvName].length === 0
  ) {
    throw infrastructureBlocker(
      `Desktop Agent credential environment '${input.credentialEnvName}' is unavailable.`,
    );
  }
  if (input.costApproved !== true) {
    throw infrastructureBlocker('Desktop Agent provider cost authorization is not approved.');
  }
  return Object.freeze({
    providerId: input.providerId,
    modelId: input.modelId,
    credentialEnvName: input.credentialEnvName,
    configurationFile: resolve(input.configurationFile),
    costApproved: true,
  });
}

function infrastructureBlocker(message) {
  return Object.assign(new Error(message), { code: 'infrastructure-blocked' });
}
