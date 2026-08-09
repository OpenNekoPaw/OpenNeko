#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAutomatedDesktopFunctional } from './desktop-functional/runner.mjs';
import { validateDesktopFunctionalStoragePaths } from './desktop-functional/scenario-contract.mjs';
import { resolveDesktopFunctionalScenarios } from './desktop-functional/scenarios.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixturePrefix = 'openneko-desktop-functional-';
const MANUAL_FIXTURE_WORKSPACE_ID = '4c58697b-af37-4e30-8863-502ed5927a6e';

export async function prepareDesktopUiFunctionalWorkspace(fixtureHome) {
  const workspacePath = join(fixtureHome, 'workspace');
  const projectRoot = join(workspacePath, 'neko');
  await mkdir(projectRoot, { recursive: true });
  await writeFile(
    join(projectRoot, 'project.json'),
    `${JSON.stringify({ workspaceId: MANUAL_FIXTURE_WORKSPACE_ID }, null, 2)}\n`,
    'utf8',
  );
  return workspacePath;
}

export function createDesktopUiFunctionalLaunch(input) {
  validateDesktopFunctionalStoragePaths(input);
  const command = input.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  return Object.freeze({
    command,
    args: Object.freeze([
      '--filter',
      '@neko/app-desktop',
      'dev',
      '--',
      '--openneko-functional-fixture',
      `--user-data-dir=${input.userDataRoot}`,
    ]),
    environment: Object.freeze({
      OPENNEKO_DESKTOP_FUNCTIONAL_HOME: input.fixtureHome,
      OPENNEKO_DESKTOP_FUNCTIONAL_WORKSPACE: input.workspacePath,
    }),
  });
}

export async function runDesktopUiFunctional(options = {}) {
  const createTemporaryRoot =
    options.createTemporaryRoot ?? (() => mkdtemp(join(tmpdir(), fixturePrefix)));
  const removeTemporaryRoot =
    options.removeTemporaryRoot ?? ((root) => rm(root, { recursive: true, force: true }));
  const spawnProcess = options.spawnProcess ?? spawn;
  const fixtureHome = await createTemporaryRoot();
  const userDataRoot = join(fixtureHome, 'electron-user-data');
  const [, workspacePath] = await Promise.all([
    mkdir(userDataRoot, { recursive: true }),
    prepareDesktopUiFunctionalWorkspace(fixtureHome),
  ]);

  const launch = createDesktopUiFunctionalLaunch({
    platform: options.platform ?? process.platform,
    fixtureHome,
    userDataRoot,
    workspacePath,
  });
  process.stdout.write(`Launching isolated OpenNeko Desktop UI fixture from ${fixtureHome}.\n`);

  try {
    return await waitForProcess(
      spawnProcess(launch.command, launch.args, {
        cwd: repositoryRoot,
        env: { ...process.env, ...launch.environment },
        stdio: 'inherit',
      }),
    );
  } finally {
    await removeTemporaryRoot(fixtureHome);
  }
}

function waitForProcess(child) {
  return new Promise((resolveExitCode, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Desktop UI fixture process exited from signal ${signal}.`));
        return;
      }
      resolveExitCode(code ?? 1);
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const cli = parseCli(process.argv.slice(2));
    if (!cli.scenario) {
      process.exitCode = await runDesktopUiFunctional();
    } else {
      for (const scenario of resolveDesktopFunctionalScenarios(cli.scenario)) {
        const result = await runAutomatedDesktopFunctional({
          scenario,
          target: cli.target,
        });
        process.stdout.write(
          `Desktop functional scenario '${scenario.id}' passed: ${result.reportPath}\n`,
        );
      }
      process.exitCode = 0;
    }
  } catch (error) {
    process.stderr.write(
      `Desktop UI functional launcher failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

function parseCli(args) {
  let scenario;
  let target = 'development';
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--scenario') {
      scenario = args[index + 1];
      index += 1;
      continue;
    }
    if (argument?.startsWith('--scenario=')) {
      scenario = argument.slice('--scenario='.length);
      continue;
    }
    if (argument === '--target') {
      target = args[index + 1];
      index += 1;
      continue;
    }
    if (argument?.startsWith('--target=')) {
      target = argument.slice('--target='.length);
      continue;
    }
    throw new Error(`Unknown Desktop functional argument '${String(argument)}'.`);
  }
  if (target !== 'development' && target !== 'packaged') {
    throw new Error(`Desktop functional target '${String(target)}' is invalid.`);
  }
  if (args.includes('--scenario') && !scenario) {
    throw new Error('Desktop functional --scenario requires a value.');
  }
  return { scenario, target };
}
