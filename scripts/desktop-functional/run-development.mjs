#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  closeSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertDshRuntimeDirectory } from '../dsh-runtime-closure.mjs';
import { prepareDshDevelopmentRuntime } from '../prepare-dsh-development-runtime.mjs';

const desktopAppRoot = resolve(fileURLToPath(new URL('../../apps/neko-desktop/', import.meta.url)));

export function resolveDesktopDevelopmentOwnerPath(appRoot, temporaryDirectory = tmpdir()) {
  const canonicalRoot = realpathSync(appRoot);
  const checkoutIdentity = createHash('sha256').update(canonicalRoot).digest('hex').slice(0, 20);
  return join(temporaryDirectory, `openneko-desktop-development-${checkoutIdentity}.lock`);
}

export function acquireDesktopDevelopmentBundleOwner(options = {}) {
  const appRoot = realpathSync(options.appRoot ?? desktopAppRoot);
  const lockPath =
    options.lockPath ??
    resolveDesktopDevelopmentOwnerPath(appRoot, options.temporaryDirectory ?? tmpdir());
  const pid = options.pid ?? process.pid;
  const token = options.token ?? randomUUID();
  const isProcessAlive = options.isProcessAlive ?? processIsAlive;
  const record = Object.freeze({ appRoot, pid, token });

  validateOwnerRecord(record, appRoot, 'New Desktop development ownership state is invalid.');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      writeOwnerRecord(lockPath, record);
      return Object.freeze({
        lockPath,
        pid,
        token,
        release: () => releaseDesktopDevelopmentBundleOwner(lockPath, token, appRoot),
      });
    } catch (error) {
      if (!isFileAlreadyExistsError(error)) throw error;
    }

    const existing = readOwnerRecord(lockPath, appRoot);
    if (isProcessAlive(existing.pid)) {
      throw new Error(
        `Desktop development process ${String(existing.pid)} already owns the Vite bundle for this checkout. Stop that process before starting another development app or functional scenario.`,
      );
    }

    try {
      unlinkSync(lockPath);
    } catch (error) {
      if (!isFileMissingError(error)) throw error;
    }
  }

  throw new Error('Desktop development ownership changed repeatedly during acquisition.');
}

export async function runDesktopDevelopment(options = {}) {
  const appRoot = realpathSync(options.appRoot ?? desktopAppRoot);
  const ownership = acquireDesktopDevelopmentBundleOwner({
    appRoot,
    ...(options.lockPath === undefined ? {} : { lockPath: options.lockPath }),
    ...(options.temporaryDirectory === undefined
      ? {}
      : { temporaryDirectory: options.temporaryDirectory }),
    ...(options.pid === undefined ? {} : { pid: options.pid }),
    ...(options.token === undefined ? {} : { token: options.token }),
    ...(options.isProcessAlive === undefined ? {} : { isProcessAlive: options.isProcessAlive }),
  });
  const releaseOnExit = () => ownership.release();
  process.once('exit', releaseOnExit);

  try {
    const command = (options.platform ?? process.platform) === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const argv = normalizeForwardedArguments(options.argv ?? process.argv.slice(2));
    const environment = resolveDesktopDevelopmentEnvironment({
      appRoot,
      environment: options.environment ?? process.env,
      ...(options.prepareRuntime === undefined ? {} : { prepareRuntime: options.prepareRuntime }),
      ...(options.qualifyRuntime === undefined ? {} : { qualifyRuntime: options.qualifyRuntime }),
    });
    const child = (options.spawnProcess ?? spawn)(
      command,
      ['exec', 'electron-forge', 'start', '--', ...argv],
      {
        cwd: appRoot,
        env: environment,
        stdio: 'inherit',
      },
    );
    return await waitForChild(child);
  } finally {
    process.off('exit', releaseOnExit);
    ownership.release();
  }
}

function resolveDesktopDevelopmentEnvironment(options) {
  const environment = { ...options.environment };
  const configuredRuntimeRoot = environment.NEKO_DSH_RUNTIME_ROOT;
  let runtimeRoot;
  if (configuredRuntimeRoot === undefined) {
    runtimeRoot = (options.prepareRuntime ?? prepareDshDevelopmentRuntime)({
      appRoot: options.appRoot,
    });
    if (!isAbsolute(runtimeRoot)) {
      throw new Error('Desktop development runtime builder must return an absolute path.');
    }
    runtimeRoot = realpathSync(runtimeRoot);
  } else {
    if (!isAbsolute(configuredRuntimeRoot)) {
      throw new Error('NEKO_DSH_RUNTIME_ROOT must be absolute when explicitly configured.');
    }
    runtimeRoot = realpathSync(configuredRuntimeRoot);
    (options.qualifyRuntime ?? qualifyDshDevelopmentRuntime)(runtimeRoot);
  }
  environment.NEKO_DSH_RUNTIME_ROOT = runtimeRoot;
  return environment;
}

function qualifyDshDevelopmentRuntime(runtimeRoot) {
  assertDshRuntimeDirectory(runtimeRoot, 'darwin-arm64', { qualify: true, verifyTree: true });
}

function writeOwnerRecord(lockPath, record) {
  let descriptor;
  try {
    descriptor = openSync(lockPath, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        unlinkSync(lockPath);
      } catch (cleanupError) {
        if (!isFileMissingError(cleanupError)) throw cleanupError;
      }
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readOwnerRecord(lockPath, expectedAppRoot) {
  let value;
  try {
    value = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch (error) {
    if (isFileMissingError(error)) throw error;
    throw new Error(`Desktop development ownership state is invalid at ${lockPath}.`, {
      cause: error,
    });
  }
  return validateOwnerRecord(
    value,
    expectedAppRoot,
    `Desktop development ownership state is invalid at ${lockPath}.`,
  );
}

function validateOwnerRecord(value, expectedAppRoot, message) {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0 ||
    typeof value.token !== 'string' ||
    value.token.length === 0 ||
    value.appRoot !== expectedAppRoot
  ) {
    throw new Error(message);
  }
  return value;
}

function releaseDesktopDevelopmentBundleOwner(lockPath, token, expectedAppRoot) {
  let existing;
  try {
    existing = readOwnerRecord(lockPath, expectedAppRoot);
  } catch (error) {
    if (isFileMissingError(error)) return false;
    return false;
  }
  if (!tokensMatch(existing.token, token)) return false;
  try {
    unlinkSync(lockPath);
    return true;
  } catch (error) {
    if (isFileMissingError(error)) return false;
    throw error;
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isNoSuchProcessError(error);
  }
}

function tokensMatch(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function normalizeForwardedArguments(argv) {
  return argv[0] === '--' ? argv.slice(1) : [...argv];
}

function waitForChild(child) {
  return new Promise((resolveExitCode, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Electron Forge exited from signal ${signal}.`));
        return;
      }
      resolveExitCode(code ?? 1);
    });
  });
}

function isFileAlreadyExistsError(error) {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

function isFileMissingError(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isNoSuchProcessError(error) {
  return error instanceof Error && 'code' in error && error.code === 'ESRCH';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runDesktopDevelopment();
  } catch (error) {
    process.stderr.write(
      `Desktop development launch failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
