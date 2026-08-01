#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixturePrefix = 'openneko-desktop-functional-';

export function createDesktopUiFunctionalLaunch(input) {
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
  await mkdir(userDataRoot, { recursive: true });

  const launch = createDesktopUiFunctionalLaunch({
    platform: options.platform ?? process.platform,
    fixtureHome,
    userDataRoot,
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
    process.exitCode = await runDesktopUiFunctional();
  } catch (error) {
    process.stderr.write(
      `Desktop UI functional launcher failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
