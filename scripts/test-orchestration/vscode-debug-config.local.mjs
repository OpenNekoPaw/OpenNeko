import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const localVSCodeConfigurationPaths = ['.vscode/launch.json', '.vscode/tasks.json'];
const productDevStageArgument =
  '--extensionDevelopmentPath=${workspaceFolder}/.tmp/openneko-vscode-dev';
const canonicalTestWorkspaceArgument = '${env:HOME}/Git/neko-test';
const retiredRepositoryTestWorkspace = '.tmp/vscode-test-workspaces/media-runtime';
const processScopedArguments = ['--extensions-dir', '--remote-debugging-port', '--user-data-dir'];
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
        if (argument === productDevStageArgument) {
          continue;
        }
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
    assert.deepEqual(
      developmentConfiguration.args.filter((argument) =>
        argument.startsWith('--extensionDevelopmentPath='),
      ),
      [productDevStageArgument],
      'Debug Dev (All) must load the composed apps/neko-vscode development stage',
    );
    assert.ok(
      developmentConfiguration.args.includes(canonicalTestWorkspaceArgument),
      'Debug Dev (All) must open the canonical neko-test workspace',
    );
    assert.equal(
      JSON.stringify(launchConfiguration).includes(retiredRepositoryTestWorkspace),
      false,
      'VS Code launch configurations must not use a repository-local test workspace',
    );
    assert.equal(
      JSON.stringify(launchConfiguration).includes('/packages/neko-engine'),
      false,
      'VS Code launch configurations must not activate the retired Engine feature',
    );
    assert.ok(
      developmentConfiguration.args.includes('--disable-extensions'),
      'Debug Dev (All) must not activate unrelated installed extensions',
    );
    assert.equal(
      developmentConfiguration.runtimeExecutable,
      '${execPath}',
      'Debug Dev (All) must use the VS Code executable running the workspace',
    );
    assert.deepEqual(
      developmentConfiguration.args.filter((argument) =>
        processScopedArguments.some(
          (prefix) => argument === prefix || argument.startsWith(`${prefix}=`),
        ),
      ),
      [],
      'Debug Dev (All) must not claim process isolation or CDP through window-scoped extensionHost arguments',
    );
    assert.equal(
      developmentConfiguration.preLaunchTask,
      'build:product-dev',
      'Debug Dev (All) must stage the composed product before launch',
    );
    const featureConfiguration = launchConfiguration.configurations.find(
      (configuration) => configuration.name === 'Debug Feature Packages (All)',
    );
    assert.ok(
      featureConfiguration,
      'Standalone feature diagnostics must use the explicit Debug Feature Packages (All) name',
    );
    assert.ok(
      featureConfiguration.args.some((argument) =>
        argument.startsWith('--extensionDevelopmentPath=${workspaceFolder}/packages/'),
      ),
      'Debug Feature Packages (All) must retain the package-local extension roots',
    );
    assert.ok(
      featureConfiguration.args.includes(canonicalTestWorkspaceArgument),
      'Debug Feature Packages (All) must open the canonical neko-test workspace',
    );
    assert.equal(featureConfiguration.preLaunchTask, 'build:feature-dev');
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
    const productDevTask = taskConfiguration.tasks.find(
      (task) => task.label === 'build:product-dev',
    );
    assert.equal(
      productDevTask?.command,
      'pnpm prepare:vscode-media-fixture && pnpm build:vscode:dev',
    );
    assert.equal(
      typeof packageManifest.scripts['prepare:vscode-media-fixture'],
      'string',
      'root package scripts must provide prepare:vscode-media-fixture',
    );
    assert.equal(
      typeof packageManifest.scripts['build:vscode:dev'],
      'string',
      'root package scripts must provide build:vscode:dev',
    );

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

test('product development staging rebuilds feature bundles without stale Turbo outputs', async () => {
  const stageScript = await readFile(
    path.join(repositoryRoot, 'scripts/stage-openneko-dev-extension.mjs'),
    'utf8',
  );

  assert.match(
    stageScript,
    /'turbo',\s*'run',\s*'compile',\s*'--force'/u,
    'product development staging must force current workspace sources into feature bundles',
  );
  assert.match(
    stageScript,
    /OPENNEKO_FEATURE_PACKAGES\.map/u,
    'product development staging must compile the composed feature package set',
  );
});
