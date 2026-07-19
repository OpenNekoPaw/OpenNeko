import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const localVSCodeConfigurationPaths = ['.vscode/launch.json', '.vscode/tasks.json'];
const presentLocalVSCodeConfigurationPaths = localVSCodeConfigurationPaths.filter((relativePath) =>
  existsSync(path.join(repositoryRoot, relativePath)),
);
const hasLocalVSCodeConfiguration =
  presentLocalVSCodeConfigurationPaths.length === localVSCodeConfigurationPaths.length;

function parseJsonWithLineComments(source) {
  return JSON.parse(
    source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n'),
  );
}

async function readWorkspaceJson(relativePath) {
  return parseJsonWithLineComments(await readFile(path.join(repositoryRoot, relativePath), 'utf8'));
}

test('local VS Code configuration is complete when present', (testContext) => {
  if (presentLocalVSCodeConfigurationPaths.length === 0) {
    testContext.skip('Local .vscode configuration is not present in this checkout.');
    return;
  }

  assert.deepEqual(presentLocalVSCodeConfigurationPaths, localVSCodeConfigurationPaths);
});

test(
  'VS Code launch configurations reference valid tasks and local paths',
  {
    skip: !hasLocalVSCodeConfiguration,
  },
  async () => {
    const [launchConfiguration, taskConfiguration] = await Promise.all([
      readWorkspaceJson('.vscode/launch.json'),
      readWorkspaceJson('.vscode/tasks.json'),
    ]);
    const taskLabels = new Set(taskConfiguration.tasks.map((task) => task.label));

    for (const configuration of launchConfiguration.configurations) {
      assert.ok(
        taskLabels.has(configuration.preLaunchTask),
        `${configuration.name} references missing task ${configuration.preLaunchTask}`,
      );

      for (const argument of configuration.args ?? []) {
        const workspacePath = argument.startsWith('--extensionDevelopmentPath=')
          ? argument.slice('--extensionDevelopmentPath='.length)
          : argument;
        if (!workspacePath.startsWith('${workspaceFolder}')) {
          continue;
        }

        const localPath = workspacePath.replace('${workspaceFolder}', repositoryRoot);
        await assert.doesNotReject(
          access(localPath),
          `${configuration.name} references missing path ${argument}`,
        );
      }
    }

    const developmentConfiguration = launchConfiguration.configurations.find(
      (configuration) => configuration.name === 'Debug Dev (All)',
    );
    assert.ok(developmentConfiguration, 'Debug Dev (All) configuration is required');
    assert.ok(
      developmentConfiguration.args.includes('${env:HOME}/Git/neko-test'),
      'Debug Dev (All) must open the dedicated synthetic neko-test workspace',
    );
    assert.equal(
      JSON.stringify(launchConfiguration).includes('neko-dashboard'),
      false,
      'VS Code launch configurations must not reference the removed Dashboard extension',
    );
  },
);

test(
  'VS Code direct pnpm tasks reference root package scripts',
  {
    skip: !hasLocalVSCodeConfiguration,
  },
  async () => {
    const [taskConfiguration, packageManifest] = await Promise.all([
      readWorkspaceJson('.vscode/tasks.json'),
      readWorkspaceJson('package.json'),
    ]);

    for (const task of taskConfiguration.tasks) {
      const directScriptMatch = /^pnpm ([a-z][a-z0-9:-]*)(?:\s|$)/u.exec(task.command ?? '');
      if (!directScriptMatch) {
        continue;
      }

      const scriptName = directScriptMatch[1];
      assert.ok(
        Object.hasOwn(packageManifest.scripts, scriptName),
        `${task.label} references missing root script ${scriptName}`,
      );
    }
  },
);
