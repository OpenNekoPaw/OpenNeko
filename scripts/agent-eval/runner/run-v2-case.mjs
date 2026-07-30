import { validateScenarioForExecution } from '../schemas/contracts.mjs';

export async function runV2Case() {
  const error = new Error(
    'Real Agent evaluation is infrastructure-blocked: the Desktop application does not yet expose a complete-session evaluation driver.',
  );
  error.code = 'infrastructure-blocked';
  throw error;
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
