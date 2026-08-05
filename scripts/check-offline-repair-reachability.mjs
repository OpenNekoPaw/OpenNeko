#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repairRoot = 'tools/offline-repair';
const exactAuditFiles = new Set([
  'scripts/check-offline-repair-reachability.mjs',
  'scripts/check-offline-repair-reachability.test.mjs',
]);
const ignoredDirectoryNames = new Set(['.git', 'coverage', 'node_modules', 'reports', 'target']);
const textExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const moduleSpecifierPattern = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*['"]([^'"]+)['"]/gu;

export function findOfflineRepairReachabilityViolations(sources) {
  const violations = [];
  for (const source of sources) {
    const sourcePath = normalizePath(source.path);
    if (exactAuditFiles.has(sourcePath) || isInsideRepairRoot(sourcePath)) continue;
    if (sourcePath.includes('/offline-repair/') || sourcePath.startsWith('offline-repair/')) {
      violations.push({ path: sourcePath, reason: 'repair-module-outside-tools-root' });
    }
    if (source.content.includes(repairRoot)) {
      violations.push({ path: sourcePath, reason: 'direct-offline-repair-reference' });
    }
    for (const specifier of extractModuleSpecifiers(source.content)) {
      if (moduleSpecifierTargetsRepairRoot(sourcePath, specifier)) {
        violations.push({ path: sourcePath, reason: 'offline-repair-import' });
      }
    }
  }
  return deduplicateViolations(violations);
}

function collectRepositorySources() {
  return collectFiles(repositoryRoot).flatMap((filePath) => {
    const path = normalizePath(relative(repositoryRoot, filePath));
    if (!textExtensions.has(extname(path))) return [];
    const fileStat = statSync(filePath);
    if (fileStat.size > 5 * 1024 * 1024) return [];
    return [{ path, content: readFileSync(filePath, 'utf8') }];
  });
}

function collectFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue;
    const entryPath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function extractModuleSpecifiers(content) {
  return [...content.matchAll(moduleSpecifierPattern)].flatMap((match) =>
    typeof match[1] === 'string' ? [match[1]] : [],
  );
}

function moduleSpecifierTargetsRepairRoot(sourcePath, specifier) {
  if (specifier === repairRoot || specifier.startsWith(`${repairRoot}/`)) return true;
  if (!specifier.startsWith('.')) return false;
  const resolved = posix.normalize(posix.join(posix.dirname(sourcePath), specifier));
  return resolved === repairRoot || resolved.startsWith(`${repairRoot}/`);
}

function isInsideRepairRoot(path) {
  return path === repairRoot || path.startsWith(`${repairRoot}/`);
}

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function deduplicateViolations(violations) {
  return [
    ...new Map(
      violations.map((violation) => [`${violation.path}:${violation.reason}`, violation]),
    ).values(),
  ].sort((left, right) =>
    `${left.path}:${left.reason}`.localeCompare(`${right.path}:${right.reason}`),
  );
}

function main() {
  const violations = findOfflineRepairReachabilityViolations(collectRepositorySources());
  if (violations.length === 0) {
    console.log('Offline repair reachability audit passed.');
    return;
  }
  console.error('Offline repair reachability audit failed:');
  for (const violation of violations) {
    console.error(`  ${violation.path}: ${violation.reason}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
