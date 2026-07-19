import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REMOTE_GATE_ROOTS = Object.freeze([
  'check:ci',
  'gate:branch',
  'gate:main',
  'ci:branch',
  'ci:main',
]);
const LOCAL_RUNTIME_SCRIPTS = Object.freeze([
  'test:local:vscode',
  'test:local:ui',
  'test:local:api',
]);

describe('VS Code functional workflow boundary', () => {
  it('does not replace built-in Extension Debug with a workflow-owned code launch', async () => {
    const workflowRoot = join(repoRoot, '.github/workflows');
    const workflowNames = (await readdir(workflowRoot))
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
    const workflowText = (await Promise.all(
      workflowNames.map((name) => readFile(join(workflowRoot, name), 'utf8')),
    )).join('\n');

    assert.doesNotMatch(workflowText, /NEKO_VSCODE_COMMAND/u);
    assert.doesNotMatch(workflowText, /pnpm test:webview:functional/u);
    assert.doesNotMatch(workflowText, /scripts\/webview-functional/u);
    assert.doesNotMatch(workflowText, /update\.code\.visualstudio\.com/u);
  });

  it('keeps the retired Webview functional harness out of CI quality scripts', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    const scripts = packageJson.scripts ?? {};
    const retiredScriptNames = Object.keys(scripts).filter(
      (name) => name.includes('webview:functional'),
    );

    assert.deepEqual(retiredScriptNames, []);
    assert.doesNotMatch(scripts['check:test-orchestration'] ?? '', /webview-functional/u);
  });

  it('keeps VS Code, GUI, and real API commands unreachable from remote gates', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    const scripts = packageJson.scripts ?? {};
    const workflowRoot = join(repoRoot, '.github/workflows');
    const workflowNames = (await readdir(workflowRoot)).filter(
      (name) => name.endsWith('.yml') || name.endsWith('.yaml'),
    );
    const workflowSources = await Promise.all(
      workflowNames.map((name) => readFile(join(workflowRoot, name), 'utf8')),
    );
    const workflowRoots = Object.keys(scripts).filter((scriptName) =>
      workflowSources.some((source) => referencesScript(source, scriptName)),
    );
    const reachableScripts = collectReachableScripts(scripts, [
      ...REMOTE_GATE_ROOTS,
      ...workflowRoots,
    ]);

    assert.match(scripts['gate:local'] ?? '', /test:local:vscode/u);
    for (const localScript of LOCAL_RUNTIME_SCRIPTS) {
      assert.equal(typeof scripts[localScript], 'string', `missing local script: ${localScript}`);
      assert.equal(
        reachableScripts.has(localScript),
        false,
        `${localScript} must not be reachable from remote CI`,
      );
    }
    assert.doesNotMatch(
      scripts['check:test-orchestration'] ?? '',
      /vscode-debug-config\.local\.mjs/u,
    );
    for (const source of workflowSources) {
      assert.doesNotMatch(source, /vscode-debug-config\.local\.mjs|test:local:/u);
    }
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
