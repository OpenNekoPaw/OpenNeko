#!/usr/bin/env node

import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  SUPPORTED_DESKTOP_TARGETS,
  resolveSupportedDesktopTarget,
} from './assert-supported-desktop-host.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executablePaths = Object.freeze({
  'darwin-arm64':
    'apps/neko-desktop/out/OpenNeko-darwin-arm64/OpenNeko.app/Contents/MacOS/OpenNeko',
});

export function resolveDesktopPackageExecutable(target, root = repositoryRoot) {
  const relativeExecutablePath = executablePaths[target];
  if (!relativeExecutablePath) {
    throw new Error(
      `Unsupported OpenNeko Desktop package target: ${target}. Supported targets: ${SUPPORTED_DESKTOP_TARGETS.join(', ')}.`,
    );
  }
  return resolve(root, relativeExecutablePath);
}

export function assertDesktopPackageOutput({ target, repositoryRoot: root = repositoryRoot } = {}) {
  const resolvedTarget = target ?? resolveSupportedDesktopTarget();
  const executablePath = resolveDesktopPackageExecutable(resolvedTarget, root);
  let outputStat;
  try {
    outputStat = statSync(executablePath);
  } catch (error) {
    throw new Error(
      `OpenNeko Desktop package output is missing for ${resolvedTarget}: ${executablePath}.`,
      { cause: error },
    );
  }
  if (!outputStat.isFile()) {
    throw new Error(
      `OpenNeko Desktop package executable is not a file for ${resolvedTarget}: ${executablePath}.`,
    );
  }
  return Object.freeze({ executablePath, target: resolvedTarget });
}

function main() {
  const result = assertDesktopPackageOutput();
  process.stdout.write(
    `OpenNeko Desktop package output verified for ${result.target}: ${result.executablePath}.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
