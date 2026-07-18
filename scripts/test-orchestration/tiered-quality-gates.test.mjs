import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

describe('tiered quality gate orchestration', () => {
  it('keeps stable local, branch, and main command composition', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
    const scripts = packageJson.scripts ?? {};

    assert.equal(
      scripts['gate:local'],
      'pnpm check:build && pnpm test && pnpm check:repository-quality',
    );
    assert.equal(scripts['gate:branch'], 'pnpm check:ci');
    assert.equal(scripts['gate:main'], 'pnpm gate:branch && pnpm check:proto-sync');
    assert.equal(scripts['ci:local'], 'pnpm gate:local');
    assert.equal(scripts['ci:branch'], 'pnpm gate:branch');
    assert.equal(scripts['ci:main'], 'pnpm gate:main');
    assert.doesNotMatch(scripts['gate:local'], /coverage/u);
  });

  it('publishes stable Branch Gate and Main Gate aggregate jobs', async () => {
    const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));
    const branchGate = workflow.jobs?.['branch-gate'];
    const mainGate = workflow.jobs?.['main-gate'];

    assert.equal(branchGate?.name, 'Branch Gate');
    assert.equal(mainGate?.name, 'Main Gate');
    assert.deepEqual(branchGate?.needs, [
      'changes',
      'build',
      'local-metadata-runtime',
      'test-ts',
      'test-rust',
      'cargo-deny',
      'proto-check',
      'code-quality',
      'openspec-check',
      'dependency-review',
    ]);
    assert.deepEqual(mainGate?.needs, [
      ...branchGate.needs,
      'package-ts-vsix',
      'package-engine-vsix',
    ]);

    const branchCommand = findRunStep(branchGate, 'Assert required branch jobs');
    const mainCommand = findRunStep(mainGate, 'Assert required main jobs');
    assert.match(branchCommand, /assert-ci-gate-results\.mjs Branch Gate/u);
    assert.match(mainCommand, /assert-ci-gate-results\.mjs Main Gate/u);
    assert.match(mainCommand, /package-ts-vsix package-engine-vsix/u);
  });
});

function findRunStep(job, stepName) {
  const step = job.steps.find((candidate) => candidate.name === stepName);
  assert.equal(typeof step?.run, 'string', `missing run step: ${stepName}`);
  return step.run.replaceAll(/\s+/gu, ' ').replaceAll('"', '').trim();
}
