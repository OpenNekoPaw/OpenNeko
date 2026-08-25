#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browserRoots = [
  'apps/neko-desktop/src/renderer',
  'packages/agent/webview/src',
  'packages/assets/webview/src',
  'packages/canvas/webview/src',
  'packages/cut/webview/src',
  'packages/model/webview/src',
  'packages/preview/webview/src',
];
const prohibitedImports = new Set([
  'electron',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'node:sqlite',
]);

export async function checkContentAccessBoundaries(root = repositoryRoot) {
  const findings = [];
  const files = [];
  for (const sourceRoot of browserRoots) {
    await collectProductionFiles(resolve(root, sourceRoot), files);
  }

  for (const file of files) {
    const relativeFile = normalize(relative(root, file));
    const source = await readFile(file, 'utf8');
    for (const specifier of extractImportSpecifiers(source)) {
      if (prohibitedImports.has(specifier) || specifier.startsWith('vscode')) {
        findings.push(`${relativeFile}: browser runtime imports prohibited host API ${specifier}`);
      }
    }
    if (/\bacquireVsCodeApi\b/u.test(source)) {
      findings.push(`${relativeFile}: removed VS Code Webview runtime acquisition remains`);
    }
  }

  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    checkedFiles: files.length,
    findings,
  };
}

async function collectProductionFiles(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', '__tests__'].includes(entry.name)) continue;
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await collectProductionFiles(file, files);
    } else if (
      entry.isFile() &&
      /\.[cm]?[jt]sx?$/u.test(entry.name) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name)
    ) {
      files.push(file);
    }
  }
}

function extractImportSpecifiers(source) {
  return [
    ...source.matchAll(
      /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gu,
    ),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu),
  ].map((match) => match[1]);
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkContentAccessBoundaries();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
