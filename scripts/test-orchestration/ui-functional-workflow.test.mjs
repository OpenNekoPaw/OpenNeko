import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  createDesktopUiFunctionalLaunch,
  prepareDesktopUiFunctionalWorkspace,
} from '../run-desktop-ui-functional.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CODE_GATE_ROOTS = Object.freeze([
  'check:ci',
  'gate:local',
  'gate:remote',
  'ci:local',
  'ci:remote',
]);
const LOCAL_RUNTIME_SCRIPTS = Object.freeze(['dev:desktop']);

describe('Desktop functional workflow boundary', () => {
  it('prepares a minimal project inside the isolated manual Workspace', async () => {
    const fixtureHome = await mkdtemp(join(tmpdir(), 'openneko-desktop-functional-manual-'));
    try {
      const workspacePath = await prepareDesktopUiFunctionalWorkspace(fixtureHome);
      const project = JSON.parse(
        await readFile(join(workspacePath, 'neko', 'project.json'), 'utf8'),
      );

      assert.equal(workspacePath, join(fixtureHome, 'workspace'));
      assert.equal(project.workspaceId, '4c58697b-af37-4e30-8863-502ed5927a6e');
    } finally {
      await rm(fixtureHome, { recursive: true, force: true });
    }
  });

  it('launches graphical UI acceptance with isolated functional and Electron data roots', () => {
    const launch = createDesktopUiFunctionalLaunch({
      platform: 'darwin',
      fixtureHome: '/tmp/openneko-desktop-functional-shell',
      userDataRoot: '/tmp/openneko-desktop-functional-shell/electron-user-data',
      workspacePath: '/tmp/openneko-desktop-functional-shell/workspace',
    });

    assert.equal(launch.command, 'pnpm');
    assert.deepEqual(launch.args, [
      '--filter',
      '@neko/app-desktop',
      'dev',
      '--',
      '--openneko-functional-fixture',
      '--user-data-dir=/tmp/openneko-desktop-functional-shell/electron-user-data',
    ]);
    assert.deepEqual(launch.environment, {
      OPENNEKO_DESKTOP_FUNCTIONAL_HOME: '/tmp/openneko-desktop-functional-shell',
      OPENNEKO_DESKTOP_FUNCTIONAL_WORKSPACE: '/tmp/openneko-desktop-functional-shell/workspace',
    });

    const windowsLaunch = createDesktopUiFunctionalLaunch({
      platform: 'win32',
      fixtureHome: 'D:\\openneko-desktop-functional-shell',
      userDataRoot: 'D:\\openneko-desktop-functional-shell\\electron-user-data',
      workspacePath: 'D:\\openneko-desktop-functional-shell\\workspace',
    });
    assert.equal(windowsLaunch.command, 'pnpm.cmd');
  });

  it('keeps removed VS Code runtime commands out of workflows', async () => {
    const workflowRoot = join(repoRoot, '.github/workflows');
    const workflowNames = (await readdir(workflowRoot)).filter(
      (name) => name.endsWith('.yml') || name.endsWith('.yaml'),
    );
    const workflowText = (
      await Promise.all(workflowNames.map((name) => readFile(join(workflowRoot, name), 'utf8')))
    ).join('\n');

    assert.doesNotMatch(workflowText, /NEKO_VSCODE_COMMAND/u);
    assert.doesNotMatch(workflowText, /pnpm test:webview:functional/u);
    assert.doesNotMatch(workflowText, /scripts\/webview-functional/u);
    assert.doesNotMatch(workflowText, /update\.code\.visualstudio\.com/u);
  });

  it('keeps the retired Webview functional harness out of CI quality scripts', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    const scripts = packageJson.scripts ?? {};
    const retiredScriptNames = Object.keys(scripts).filter((name) =>
      name.includes('webview:functional'),
    );

    assert.deepEqual(retiredScriptNames, []);
    assert.doesNotMatch(scripts['check:test-orchestration'] ?? '', /webview-functional/u);
  });

  it('keeps functional formatting, documentation, and ignored artifacts current', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    const desktopReadme = await readFile(join(repoRoot, 'apps/neko-desktop/README_CN.md'), 'utf8');
    const gitignoreEntries = (await readFile(join(repoRoot, '.gitignore'), 'utf8'))
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    for (const scriptName of ['format', 'format:check']) {
      const command = packageJson.scripts?.[scriptName] ?? '';
      assert.match(command, /scripts\/desktop-functional\/\*\*\/\*\.mjs/u);
      assert.match(command, /packages\/\*\/webview\/functional\/\*\*\/\*\.mjs/u);
    }

    assert.match(desktopReadme, /pnpm test:local:media-openneko/u);
    assert.match(desktopReadme, /--scenario=all-openneko-consumers/u);
    assert.doesNotMatch(desktopReadme, /test:local:ui -- --scenario/u);
    assert.doesNotMatch(desktopReadme, /test:local:media-http/u);

    assert.ok(gitignoreEntries.includes('/reports/'));
    for (const retiredEntry of [
      '/neko',
      'packages/neko-agent/neko',
      '.vscode-test/',
      '*.vsix',
      'vsix-artifacts/',
      'vscode-screenshot*.png',
      'vscode-webview-*.png',
      'target/',
    ]) {
      assert.equal(gitignoreEntries.includes(retiredEntry), false, retiredEntry);
    }
  });

  it('keeps VS Code, GUI startup, and real API commands unreachable from code gates', async () => {
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
      ...CODE_GATE_ROOTS,
      ...workflowRoots,
    ]);

    const explicitLocalScripts = [
      ...LOCAL_RUNTIME_SCRIPTS,
      ...Object.keys(scripts).filter((scriptName) => scriptName.startsWith('test:local:')),
    ];
    assert.ok(explicitLocalScripts.length > 1, 'expected explicit local test commands');
    for (const localScript of explicitLocalScripts) {
      assert.equal(typeof scripts[localScript], 'string', `missing local script: ${localScript}`);
      assert.equal(
        reachableScripts.has(localScript),
        false,
        `${localScript} must not be reachable from code gates or CI`,
      );
    }
    assert.equal(
      scripts['test:local:ui'],
      'node scripts/run-desktop-ui-functional.mjs',
      'graphical UI acceptance must retain one explicit local launcher',
    );
    assert.equal(
      scripts['test:local:ui:contract'],
      'node --test scripts/local-ui-validation/ui-validation-skill.test.mjs',
      'advisory UI policy and coverage must retain one explicit local contract',
    );
    assert.doesNotMatch(
      scripts['check:test-orchestration'] ?? '',
      /local-ui-validation|ui-validation-skill/u,
    );
    assert.equal(
      scripts['test:local:media-openneko'],
      'node scripts/run-desktop-openneko-qualification.mjs',
      'OpenNeko media qualification must retain one explicit local launcher',
    );
    assert.doesNotMatch(
      scripts['check:test-orchestration'] ?? '',
      /vscode-debug-config\.local\.mjs/u,
    );
    for (const source of workflowSources) {
      assert.doesNotMatch(
        source,
        /vscode-debug-config\.local\.mjs|local-ui-validation|ui-validation-skill|test:local:|run-desktop-(?:ui-functional|openneko-qualification)\.mjs|OPENNEKO_(?:DESKTOP_FUNCTIONAL_HOME|MEDIA_QUALIFICATION_ROOT)|openneko-functional-fixture/u,
      );
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
