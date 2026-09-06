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

export function inspectWorkspaceDependencies(sourceRoots, root = repositoryRoot) {
  if (sourceRoots.length === 0)
    throw new Error('No workspace package source roots were discovered');
  const executable = path.join(
    repositoryRoot,
    'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
  );
  const result = spawnSync(
    process.execPath,
    [executable, ...sourceRoots, '--config', '--output-type', 'json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Dependency scan terminated by ${result.signal}`);
  if (!result.stdout.trim()) throw new Error(result.stderr || 'Dependency scan returned no report');
  const report = JSON.parse(result.stdout);
  for (const sourceRoot of sourceRoots) {
    if (!report.modules.some((module) => module.source.startsWith(`${sourceRoot}/`))) {
      throw new Error(
        `Dependency scan did not inspect ${sourceRoot}; check source discovery and TypeScript parser support`,
      );
    }
  }
  return {
    status: result.status === 0 && report.summary.error === 0 ? 'passed' : 'failed',
    summary: {
      totalCruised: report.summary.totalCruised,
      totalDependenciesCruised: report.summary.totalDependenciesCruised,
      error: report.summary.error,
      warn: report.summary.warn,
      violations: report.summary.violations,
    },
  };
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
  const report = inspectWorkspaceDependencies(sourceRoots);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === 'passed' ? 0 : 1;
}

async function isDirectory(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run();
}
