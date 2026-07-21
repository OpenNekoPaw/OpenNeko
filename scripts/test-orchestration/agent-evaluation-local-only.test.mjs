import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { describe, it } from 'node:test';

const WORKFLOW_DIRECTORY = '.github/workflows';
const GENERIC_CI_SCRIPTS = Object.freeze([
  'check:test',
  'check:ci',
  'gate:local',
  'gate:remote',
  'ci:local',
  'ci:remote',
]);
const FORBIDDEN_REFERENCES = Object.freeze([
  'test:agent:eval',
  'scripts/agent-eval/',
  'NEKO_AGENT_EVAL',
  'reports/agent-eval',
  'local-run.mjs',
]);

describe('Agent Evaluation local-only boundary', () => {
  it('keeps every GitHub Actions workflow free of Evaluation execution surfaces', async () => {
    const workflowPaths = (await readdir(WORKFLOW_DIRECTORY, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
      .map((entry) => join(WORKFLOW_DIRECTORY, entry.name));

    assert.ok(workflowPaths.length > 0, 'expected at least one GitHub Actions workflow');
    for (const workflowPath of workflowPaths) {
      assert.notEqual(
        basename(workflowPath),
        'agent-evaluation.yml',
        'dedicated Agent Evaluation workflow must not exist',
      );
      const source = await readFile(workflowPath, 'utf8');
      for (const forbiddenReference of FORBIDDEN_REFERENCES) {
        assert.equal(
          source.includes(forbiddenReference),
          false,
          `${workflowPath} must not reference ${forbiddenReference}`,
        );
      }
    }
  });

  it('keeps generic CI script composition separate from explicit local Evaluation commands', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
    const scripts = packageJson.scripts ?? {};
    const workflowSources = await readWorkflowSources();
    const workflowScriptRoots = Object.keys(scripts).filter((scriptName) =>
      workflowSources.some((source) => referencesScript(source, scriptName)),
    );
    const reachableScripts = collectReachableScripts(scripts, [
      ...GENERIC_CI_SCRIPTS,
      ...workflowScriptRoots,
    ]);

    for (const scriptName of reachableScripts) {
      const command = scripts[scriptName];
      for (const forbiddenReference of FORBIDDEN_REFERENCES) {
        assert.equal(
          command.includes(forbiddenReference),
          false,
          `${scriptName} must not reference ${forbiddenReference}`,
        );
      }
    }

    assert.match(
      scripts['test:agent:eval'],
      /vitest.+vitest\.agent-eval\.config\.mts.+all-suite-dry-run\.mjs/u,
      'explicit local harness command must remain available',
    );
    assert.equal((await stat('scripts/agent-eval/local-run.mjs')).isFile(), true);
  });
});

function collectReachableScripts(scripts, roots) {
  const reachable = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const scriptName = pending.shift();
    assert.equal(typeof scripts[scriptName], 'string', `missing root script: ${scriptName}`);
    if (reachable.has(scriptName)) continue;
    reachable.add(scriptName);

    for (const candidate of Object.keys(scripts)) {
      if (referencesScript(scripts[scriptName], candidate)) pending.push(candidate);
    }
  }
  return reachable;
}

function referencesScript(command, scriptName) {
  const escaped = scriptName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(
    `(?:^|[\\s;&|])(?:pnpm(?:\\s+run)?|npm\\s+run|yarn)\\s+${escaped}(?=\\s|$|[;&|])`,
    'u',
  ).test(command);
}

async function readWorkflowSources() {
  const workflowNames = (await readdir(WORKFLOW_DIRECTORY, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
    .map((entry) => entry.name);
  return Promise.all(
    workflowNames.map((workflowName) => readFile(join(WORKFLOW_DIRECTORY, workflowName), 'utf8')),
  );
}
