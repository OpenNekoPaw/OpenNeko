#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const qualificationPrefix = 'openneko-media-qualification-';

export function createOpenNekoQualificationCommands(input) {
  const pnpm = input.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  return Object.freeze({
    build: Object.freeze({
      command: pnpm,
      args: Object.freeze([
        'exec',
        'esbuild',
        'apps/neko-desktop/src/main/desktop-openneko-qualification.ts',
        '--bundle',
        '--platform=node',
        '--format=cjs',
        '--target=node24',
        '--external:electron',
        `--outfile=${input.bundlePath}`,
      ]),
    }),
    electron: Object.freeze({
      command: pnpm,
      args: Object.freeze(['--filter', '@neko/app-desktop', 'exec', 'electron', input.bundlePath]),
    }),
  });
}

export async function runOpenNekoQualification(options = {}) {
  const fixtureRoot = await (
    options.createTemporaryRoot ?? (() => mkdtemp(join(tmpdir(), qualificationPrefix)))
  )();
  const bundlePath = join(fixtureRoot, 'qualification.cjs');
  const reportPath =
    options.reportPath ??
    resolve(
      repositoryRoot,
      'reports',
      'desktop-functional',
      'replace-desktop-media-scheme-with-http-resource-gateway',
      `${new Date().toISOString().replaceAll(':', '-')}-openneko`,
      'report.json',
    );
  await mkdir(dirname(reportPath), { recursive: true });
  const commands = createOpenNekoQualificationCommands({
    platform: options.platform ?? process.platform,
    bundlePath,
  });
  const spawnProcess = options.spawnProcess ?? spawn;
  try {
    await runProcess(spawnProcess, commands.build, {});
    await runProcess(spawnProcess, commands.electron, {
      OPENNEKO_MEDIA_QUALIFICATION_ROOT: fixtureRoot,
      OPENNEKO_MEDIA_QUALIFICATION_REPORT: reportPath,
    });
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    if (report.status !== 'passed') {
      throw new Error(`OpenNeko qualification report status is ${String(report.status)}.`);
    }
    process.stdout.write(`OpenNeko qualification passed: ${reportPath}\n`);
    return { reportPath, report };
  } finally {
    await (options.removeTemporaryRoot ?? ((root) => rm(root, { recursive: true, force: true })))(
      fixtureRoot,
    );
  }
}

function runProcess(spawnProcess, command, environment) {
  return new Promise((resolveExit, reject) => {
    const child = spawnProcess(command.command, command.args, {
      cwd: repositoryRoot,
      env: { ...process.env, ...environment },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command.command} exited from signal ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${command.command} exited with code ${String(code)}.`));
        return;
      }
      resolveExit(code);
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runOpenNekoQualification();
  } catch (error) {
    process.stderr.write(
      `OpenNeko qualification launcher failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  }
}
