#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPackageRoles } from './check-package-roles.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function discoverDependencyRoots(catalog, root = repositoryRoot) {
  const sourceRoots = [];
  for (const entry of catalog.packages) {
    const sourceRoot = path.join(root, entry.path, 'src');
    if (await isDirectory(sourceRoot)) sourceRoots.push(path.posix.join(entry.path, 'src'));
  }
  return sourceRoots.sort();
}

async function run() {
  const roleResult = await inspectPackageRoles(repositoryRoot);
  if (roleResult.status !== 'passed') {
    process.stderr.write(`${JSON.stringify(roleResult, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(
    await readFile(path.join(repositoryRoot, 'quality/package-roles.json'), 'utf8'),
  );
  const sourceRoots = await discoverDependencyRoots(catalog);
  if (sourceRoots.length === 0)
    throw new Error('No workspace package source roots were discovered');

  process.stdout.write(
    `[workspace-dependencies] checking ${sourceRoots.length} package source roots from package role catalog\n`,
  );
  const executable = path.join(
    repositoryRoot,
    'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
  );
  const result = spawnSync(process.execPath, [executable, ...sourceRoots, '--config'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

async function isDirectory(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run();
}
