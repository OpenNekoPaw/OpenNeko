import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { validateScenario } from './contracts.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const pilotScenarioPaths = [
  'scripts/webview-functional/scenarios/agent/agent-view-submit.p0.scenario.json',
  'scripts/webview-functional/scenarios/agent/agent-lifecycle-reload.p0.scenario.json',
  'scripts/webview-functional/scenarios/canvas/canvas-board-basic-professional.p0.scenario.json',
  'scripts/webview-functional/scenarios/canvas/canvas-edit-save-reopen.p0.scenario.json',
  'scripts/webview-functional/scenarios/canvas/canvas-invalid-project.p0.scenario.json',
];

describe('Agent and Canvas functional pilot boundaries', () => {
  it('uses only the closed scenario contract with authoritative and runtime assertions', async () => {
    for (const path of pilotScenarioPaths) {
      const scenario = validateScenario(JSON.parse(await readFile(resolve(repoRoot, path), 'utf8')));
      const serialized = JSON.stringify(scenario);

      assert.doesNotMatch(serialized, /evaluate-javascript|storeMutation|privateHandler|testOnly/u);
      assert.ok(scenario.assertions.some((assertion) => assertion.kind === 'runtime-errors'));
      assert.ok(
        scenario.assertions.some((assertion) =>
          ['file-json', 'file-text', 'observation', 'diagnostic', 'engine-result', 'lifecycle'].includes(
            assertion.kind,
          ),
        ),
      );
    }
  });

  it('keeps controller business actions on public VS Code APIs without direct file writes', async () => {
    const source = await readFile(
      resolve(repoRoot, 'scripts/webview-functional/vscode-controller/extension.cjs'),
      'utf8',
    );
    const executeBody = source.slice(
      source.indexOf('async function execute('),
      source.indexOf('\nfunction collectWebviewViewTypes'),
    );

    assert.match(executeBody, /vscode\.commands\.executeCommand/u);
    assert.match(executeBody, /editor\.document\.save\(\)/u);
    assert.match(executeBody, /vscode\.window\.tabGroups\.close/u);
    assert.doesNotMatch(executeBody, /closeActiveEditor|closeAllEditors/u);
    assert.doesNotMatch(executeBody, /workspace\.fs\.writeFile|writeFileSync|writeFile\(/u);
    assert.doesNotMatch(executeBody, /postMessage\(|getState\(|setState\(/u);
  });

  it('does not inject functional scenario or controller identities into production sources', async () => {
    const roots = [
      'packages/neko-agent/packages/extension/src',
      'packages/neko-agent/packages/webview/src',
      'packages/neko-canvas/packages/extension/src',
      'packages/neko-canvas/packages/webview/src',
    ];
    const forbidden = [
      'NEKO_FUNCTIONAL_CONTROLLER',
      'agent.view-submit.p0',
      'agent.lifecycle-reload.p0',
      'canvas.board-basic-professional.p0',
      'canvas.edit-save-reopen.p0',
      'canvas.invalid-project.p0',
      'vscode-functional-controller',
    ];

    for (const root of roots) {
      for (const path of await collectProductionSources(resolve(repoRoot, root))) {
        const source = await readFile(path, 'utf8');
        for (const value of forbidden) {
          assert.equal(source.includes(value), false, `${path} contains forbidden test identity ${value}`);
        }
      }
    }
  });
});

async function collectProductionSources(root) {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) {
      continue;
    }
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await collectProductionSources(path));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name)) {
      paths.push(path);
    }
  }
  return paths;
}
