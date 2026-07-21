import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const SHARED_GATE_JOBS = Object.freeze([
  'build',
  'local-metadata-runtime',
  'test-ts',
  'test-rust',
  'cargo-deny',
  'proto-check',
  'code-quality',
  'openspec-check',
  'package-ts-vsix',
  'package-engine-vsix',
]);

describe('dev/main quality gate orchestration', () => {
  it('keeps local and remote-reproduction commands separate from local runtime checks', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
    const scripts = packageJson.scripts ?? {};

    assert.equal(
      scripts['gate:local'],
      'pnpm check:build && pnpm test && pnpm check:repository-quality && pnpm test:local:vscode',
    );
    assert.equal(scripts['gate:remote'], 'pnpm check:ci && pnpm check:proto-sync');
    assert.equal(scripts['ci:local'], 'pnpm gate:local');
    assert.equal(scripts['ci:remote'], 'pnpm gate:remote');
    for (const removedScript of ['gate:branch', 'gate:main', 'ci:branch', 'ci:main']) {
      assert.equal(scripts[removedScript], undefined, `${removedScript} must be removed`);
    }
    assert.doesNotMatch(scripts['gate:local'], /coverage/u);
    assert.doesNotMatch(scripts['gate:remote'], /test:local:/u);
  });

  it('runs remote CI only when dispatched manually or for a Pull Request to main', async () => {
    const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));

    assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'workflow_dispatch']);
    assert.deepEqual(workflow.on.pull_request.branches, ['main']);
    assert.equal(workflow.on.push, undefined);
  });

  it('publishes Manual Gate and dev-to-main Merge Gate over one shared full job graph', async () => {
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

  it('does not path-skip deterministic validation or supported-platform packaging', async () => {
    const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));

    assert.equal(workflow.jobs?.changes, undefined);
    for (const jobName of ['test-rust', 'cargo-deny', 'proto-check', 'openspec-check']) {
      assert.equal(workflow.jobs?.[jobName]?.if, undefined, `${jobName} must always run`);
    }
    assert.equal(workflow.jobs?.['package-ts-vsix']?.if, undefined);
    assert.equal(workflow.jobs?.['package-engine-vsix']?.if, undefined);
  });
});

function findRunStep(job, stepName) {
  const step = job?.steps?.find((candidate) => candidate.name === stepName);
  assert.equal(typeof step?.run, 'string', `missing run step: ${stepName}`);
  return step.run.replaceAll(/\s+/gu, ' ').replaceAll('"', '').trim();
}
