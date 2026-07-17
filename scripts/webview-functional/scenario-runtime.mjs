import { mkdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { runAssertion } from './assertions.mjs';
import { validateScenario } from './contracts.mjs';
import { classifyRuntimeEvents } from './error-policy.mjs';
import { prepareFixture } from './fixture.mjs';
import { runStep } from './operations.mjs';
import { runPrerequisites } from './prerequisites.mjs';
import {
  createFunctionalReport,
  redactEvidence,
  writeEvidenceFile,
  writeFunctionalReport,
} from './report.mjs';
import { VSCodeFunctionalHost } from './vscode-host.mjs';
import { ElectronApplicationFunctionalHost } from './electron-app-host.mjs';

const FUNCTIONAL_CONTROLLER_EXTENSION_ID = 'neko-test.neko-webview-functional-controller';

export async function loadScenario(scenarioPath, repoRoot) {
  const absolutePath = resolveWithin(repoRoot, scenarioPath);
  let raw;
  try {
    raw = JSON.parse(await readFile(absolutePath, 'utf8'));
  } catch (error) {
    const failure = new Error(`Unable to load scenario ${scenarioPath}: ${error.message}`, {
      cause: error,
    });
    failure.failureClassification = 'configuration';
    throw failure;
  }
  try {
    return validateScenario(raw);
  } catch (error) {
    error.failureClassification = 'configuration';
    throw error;
  }
}

export async function runScenario(scenario, options) {
  if (!scenario.platforms.includes(process.platform)) {
    const error = new Error(
      `Scenario ${scenario.id} does not support platform ${process.platform}; supported: ${scenario.platforms.join(', ')}`,
    );
    error.failureClassification = 'configuration';
    throw error;
  }

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const stepEvidence = [];
  const assertionEvidence = [];
  const sideEffects = [];
  const artifacts = {};
  let fixture;
  let host;
  let prerequisiteRuntime;
  let status = 'pass';
  let failureClassification;
  let runError;
  let runtimeClassification = { events: [], failures: [], expected: [], benign: [] };

  try {
    prerequisiteRuntime = await runPrerequisites(scenario.prerequisites, options.repoRoot);
    fixture = await prepareFixture(options.repoRoot, scenario.fixture, {
      workspaceRoot: scenario.host === 'vscode' ? options.testWorkspaceRoot : undefined,
    });
    host = await startHostWithInfrastructureRetry(scenario, fixture, {
      ...options,
      environment: prerequisiteRuntime.environment,
    });
    await host.activate();
    let webview = await host.connectWebview();

    for (const step of scenario.steps) {
      const stepStartedAt = Date.now();
      const value = await runStep(step, {
        host,
        keyboard: host.page,
        webview,
        defaultTimeoutMs: scenario.timeoutMs,
        captureScreenshot: async (name) => {
          const buffer = await host.page.captureScreenshot();
          artifacts[`stepScreenshot:${name}`] = buffer;
          return { name, byteLength: buffer.byteLength };
        },
      });
      stepEvidence.push({
        id: step.id,
        operation: step.operation,
        status: 'pass',
        durationMs: Date.now() - stepStartedAt,
        value,
      });
      if (
        step.operation === 'reload' ||
        step.operation === 'restart-host' ||
        step.operation === 'hide-reveal' ||
        step.operation === 'close-reopen'
      ) {
        webview = host.webview;
      }
    }

    const observations = [
      ...(prerequisiteRuntime?.observations ?? []),
      ...await host.observations(),
    ];
    const runtimeEvents = [
      ...(prerequisiteRuntime?.runtimeEvents ?? []),
      ...host.runtimeEvents,
      ...host.sessions.flatMap((session) => session.events),
    ];
    runtimeClassification = classifyRuntimeEvents(runtimeEvents, createRuntimeErrorPolicy(scenario));
    for (const assertion of scenario.assertions) {
      const assertionStartedAt = Date.now();
      const value = await runAssertion(assertion, {
        webview,
        fixtureRoot: fixture.fixtureRoot,
        observations,
        steps: stepEvidence,
        runtimeClassification,
      });
      assertionEvidence.push({
        id: assertion.id,
        kind: assertion.kind,
        status: 'pass',
        durationMs: Date.now() - assertionStartedAt,
        ...value,
      });
      if (assertion.kind === 'file-json' || assertion.kind === 'file-text') {
        sideEffects.push({
          kind: 'durable-file',
          path: assertion.path,
          assertionId: assertion.id,
          status: 'verified',
        });
      }
    }

    if (scenario.evidence.domSnapshot) {
      artifacts.domSnapshot = await webview.captureDomSnapshot();
    }
    if (scenario.evidence.screenshot) {
      artifacts.screenshot = await host.page.captureScreenshot();
    }
  } catch (error) {
    runError = error;
    failureClassification = error.failureClassification ?? inferFailureClassification(error);
    status = failureClassification === 'infrastructure' ? 'infrastructure-fail' :
      failureClassification === 'configuration' ? 'configuration-invalid' : 'case-fail';
    if (host) {
      const runtimeEvents = [
        ...(prerequisiteRuntime?.runtimeEvents ?? []),
        ...host.runtimeEvents,
        ...host.sessions.flatMap((session) => session.events),
      ];
      runtimeClassification = classifyRuntimeEvents(runtimeEvents, createRuntimeErrorPolicy(scenario));
      if (host.webview && scenario.evidence.domSnapshot) {
        artifacts.domSnapshot = await host.webview.captureDomSnapshot().catch(() => undefined);
      }
      if (host.page && scenario.evidence.screenshot) {
        artifacts.screenshot = await host.page.captureScreenshot().catch(() => undefined);
      }
    }
  } finally {
    try {
      await host?.stop();
      await prerequisiteRuntime?.cleanup();
    } catch (cleanupError) {
      const previousError = runError;
      runError = previousError
        ? new AggregateError([previousError, cleanupError], 'Scenario and cleanup both failed')
        : cleanupError;
      failureClassification = 'infrastructure';
      status = 'infrastructure-fail';
    }
  }

  const completedAt = new Date().toISOString();
  const outputRoot = resolve(options.outputRoot ?? join(options.repoRoot, 'reports/webview-functional'));
  await mkdir(outputRoot, { recursive: true });
  const report = createFunctionalReport({
    scenario,
    status,
    failureClassification,
    startedAt,
    completedAt,
    durationMs: Date.now() - startedMs,
    hostIdentity: host?.identity,
    fixtureDigest: fixture?.digest,
    steps: stepEvidence,
    assertions: assertionEvidence,
    runtimeErrors: runtimeClassification.events,
    sideEffects,
    artifacts: Object.fromEntries(
      Object.entries(artifacts).map(([key, value]) => [
        key,
        value === undefined
          ? undefined
          : { path: artifactPath(key), byteLength: Buffer.byteLength(value) },
      ]),
    ),
  });
  if (runError) {
    report.failure = {
      name: runError.name,
      message: runError.message,
      evidence: runError.evidence,
    };
  }
  const { reportDir, resultPath } = await writeFunctionalReport(report, outputRoot);
  const structuredEvidence = {
    'steps.json': stepEvidence,
    'assertions.json': assertionEvidence,
    'runtime-errors.json': runtimeClassification.events,
    'side-effect-manifest.json': {
      schemaVersion: 'neko.webview-functional.side-effects.v1',
      scenarioId: scenario.id,
      sideEffects,
    },
    'logs/host.json': host?.runtimeEvents ?? [],
    'logs/prerequisites.json': prerequisiteRuntime?.runtimeEvents ?? [],
  };
  for (const [path, value] of Object.entries(structuredEvidence)) {
    await writeEvidenceFile(
      reportDir,
      path,
      `${JSON.stringify(redactEvidence(value), null, 2)}\n`,
      'utf8',
    );
  }
  for (const [key, value] of Object.entries(artifacts)) {
    if (value !== undefined) {
      await writeEvidenceFile(
        reportDir,
        artifactPath(key),
        value,
        Buffer.isBuffer(value) ? undefined : 'utf8',
      );
    }
  }
  await host?.cleanup();

  return { report, reportDir, resultPath, error: runError };
}

function createRuntimeErrorPolicy(scenario) {
  return {
    ...scenario.errorPolicy,
    developmentExtensionIds:
      scenario.host === 'vscode'
        ? [
            ...scenario.extensions.map((extension) => extension.id),
            FUNCTIONAL_CONTROLLER_EXTENSION_ID,
          ]
        : [],
  };
}

export async function startHostWithInfrastructureRetry(
  scenario,
  fixture,
  options,
  hostFactory = createHost,
) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const host = hostFactory(scenario, fixture, options);
    try {
      await host.start();
      host.identity.startupAttempt = attempt;
      return host;
    } catch (error) {
      lastError = error;
      if (error.failureClassification !== 'infrastructure' || attempt === 2) {
        throw error;
      }
    }
  }
  throw lastError;
}

function createHost(scenario, fixture, options) {
  if (scenario.host === 'electron') {
    return new ElectronApplicationFunctionalHost({
      scenario,
      repoRoot: options.repoRoot,
      runRoot: fixture.runRoot,
      fixtureRoot: fixture.fixtureRoot,
      startupTimeoutMs: options.startupTimeoutMs ?? 60000,
      environment: options.environment ?? {},
    });
  }
  return new VSCodeFunctionalHost({
    scenario,
    repoRoot: options.repoRoot,
    runRoot: fixture.runRoot,
    fixtureRoot: fixture.fixtureRoot,
    expectedVSCodeVersion: options.expectedVSCodeVersion,
    testWorkspaceRoot: options.testWorkspaceRoot,
    debugPort: options.debugPort,
    controllerFile: options.controllerFile,
    startupTimeoutMs: options.startupTimeoutMs ?? 60000,
    environment: options.environment ?? {},
  });
}

function inferFailureClassification(error) {
  if (/timed out|ECONN|spawn|executable|controller|CDP WebSocket/iu.test(error.message)) {
    return 'infrastructure';
  }
  return 'test-case';
}

function artifactPath(key) {
  if (key === 'domSnapshot') return 'dom/webview.html';
  if (key === 'screenshot') return 'screenshots/final.png';
  if (key.startsWith('stepScreenshot:')) return `screenshots/${key.slice('stepScreenshot:'.length)}.png`;
  return `evidence/${key}.txt`;
}

function resolveWithin(root, path) {
  const target = resolve(root, path);
  if (relative(root, target).startsWith('..')) {
    throw new Error(`Scenario path escapes repository root: ${path}`);
  }
  return target;
}
