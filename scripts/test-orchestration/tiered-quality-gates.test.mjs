import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const SHARED_GATE_JOBS = Object.freeze([
  'static-build',
  'desktop-package',
  'platform-test',
  'test-ts',
  'functional-test',
  'code-quality',
  'openspec-check',
]);

describe('development/main quality gate orchestration', () => {
  it('keeps local and remote-reproduction commands separate from local runtime checks', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
    const scripts = packageJson.scripts ?? {};

    assert.equal(scripts['build'], 'pnpm --recursive --if-present --sort run build');
    assert.equal(
      scripts['build:ui'],
      'pnpm --filter @neko/cut-webview --filter @neko/preview-webview --filter @neko/agent-webview --filter @neko/canvas-webview run build',
    );
    assert.equal(scripts['typecheck'], 'pnpm --recursive --if-present --sort run typecheck');
    assert.equal(scripts['typecheck:desktop'], 'pnpm --dir apps/neko-desktop run typecheck');
    assert.equal(
      scripts['check:static-build'],
      'pnpm format:check && pnpm lint && pnpm typecheck && pnpm build:ui',
    );
    assert.equal(
      scripts['check:build'],
      'pnpm format:check && pnpm lint && pnpm typecheck && pnpm build',
    );
    assert.equal(
      scripts['gate:local'],
      'pnpm check:build && pnpm test && pnpm check:repository-quality',
    );
    assert.equal(scripts['gate:remote'], 'pnpm check:ci');
    assert.equal(scripts['ci:local'], 'pnpm gate:local');
    assert.equal(scripts['ci:remote'], 'pnpm gate:remote');
    assert.equal(
      scripts['test'],
      'pnpm --recursive --if-present --sort --workspace-concurrency=2 run test',
    );
    assert.equal(
      scripts['test:coverage'],
      'pnpm --recursive --if-present --sort --no-bail --workspace-concurrency=2 run test -- --coverage',
    );
    assert.match(
      scripts['test:functional:headless'] ?? '',
      /^pnpm --dir apps\/neko-desktop exec vitest run /u,
    );
    for (const removedScript of ['gate:branch', 'gate:main', 'ci:branch', 'ci:main']) {
      assert.equal(scripts[removedScript], undefined, `${removedScript} must be removed`);
    }
    assert.doesNotMatch(scripts['gate:local'], /coverage/u);
    assert.doesNotMatch(scripts['gate:remote'], /test:local:/u);
    assert.equal(scripts['lint:turbo'], undefined);
    assert.equal(packageJson.devDependencies?.turbo, undefined);
    await assert.rejects(access('turbo.json'));
    for (const command of Object.values(scripts)) {
      assert.doesNotMatch(command, /\bturbo\b/u);
    }
  });

  it('runs remote CI only when dispatched manually or for a Pull Request to main', async () => {
    const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));

    assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'workflow_dispatch']);
    assert.deepEqual(workflow.on.pull_request.branches, ['main']);
    assert.equal(workflow.on.push, undefined);
  });

  it('publishes Manual Gate and development-to-main Merge Gate over one shared full job graph', async () => {
    const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));
    const manualGate = workflow.jobs?.['manual-gate'];
    const mergeGate = workflow.jobs?.['merge-gate'];

    assert.equal(manualGate?.name, 'Manual Gate');
    assert.equal(mergeGate?.name, 'Merge Gate');
    assert.deepEqual(manualGate?.needs, SHARED_GATE_JOBS);
    assert.deepEqual(mergeGate?.needs, [
      ...SHARED_GATE_JOBS,
      'promotion-source',
      'dependency-review',
    ]);
    assert.match(manualGate?.if ?? '', /github\.event_name == 'workflow_dispatch'/u);
    assert.match(mergeGate?.if ?? '', /github\.event_name == 'pull_request'/u);

    const manualCommand = findRunStep(manualGate, 'Assert required manual jobs');
    const mergeCommand = findRunStep(mergeGate, 'Assert required merge jobs');
    assert.match(manualCommand, /assert-ci-gate-results\.mjs Manual Gate/u);
    assert.match(mergeCommand, /assert-ci-gate-results\.mjs Merge Gate/u);
    for (const jobName of SHARED_GATE_JOBS) {
      assert.match(manualCommand, new RegExp(`(?:^| )${jobName}(?: |$)`, 'u'));
      assert.match(mergeCommand, new RegExp(`(?:^| )${jobName}(?: |$)`, 'u'));
    }
    assert.match(mergeCommand, /promotion-source dependency-review/u);
  });

  it('runs unit-contract and credential-free headless functional tests as separate CI evidence', async () => {
    const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));
    const unitTests = workflow.jobs?.['test-ts'];
    const functionalTests = workflow.jobs?.['functional-test'];

    assert.equal(unitTests?.name, 'Unit & Contract Tests');
    assert.equal(unitTests?.['runs-on'], 'ubuntu-latest');
    assert.match(findRunStep(unitTests, 'Run unit and contract tests'), /pnpm check:test/u);

    assert.equal(functionalTests?.name, 'Desktop Headless Functional Tests');
    assert.equal(functionalTests?.['runs-on'], 'ubuntu-latest');
    assert.equal(
      findRunStep(functionalTests, 'Run headless Desktop functional tests'),
      'pnpm test:functional:headless',
    );
  });

  it('does not path-skip deterministic validation', async () => {
    const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));

    assert.equal(workflow.jobs?.changes, undefined);
    for (const jobName of ['test-rust', 'cargo-deny', 'openspec-check']) {
      assert.equal(workflow.jobs?.[jobName]?.if, undefined, `${jobName} must always run`);
    }
    assert.equal(workflow.jobs?.['package-openneko-vsix'], undefined);
    assert.equal(workflow.jobs?.['package-ts-vsix'], undefined);
    assert.equal(workflow.jobs?.['package-engine-vsix'], undefined);
  });
});

function findRunStep(job, stepName) {
  const step = job?.steps?.find((candidate) => candidate.name === stepName);
  assert.equal(typeof step?.run, 'string', `missing run step: ${stepName}`);
  return step.run.replaceAll(/\s+/gu, ' ').replaceAll('"', '').trim();
}
