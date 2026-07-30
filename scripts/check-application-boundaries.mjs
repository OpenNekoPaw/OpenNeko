#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const productionRoots = ['apps/neko-desktop/src', 'packages'];

export async function checkApplicationBoundaries(root = repositoryRoot) {
  const findings = [];
  const files = [];
  for (const sourceRoot of productionRoots) {
    await collectProductionFiles(resolve(root, sourceRoot), files);
  }

  for (const file of files) {
    const relativeFile = normalize(relative(root, file));
    const source = await readFile(file, 'utf8');
    for (const specifier of extractImportSpecifiers(source)) {
      if (relativeFile.startsWith('packages/') && isApplicationImport(specifier)) {
        findings.push(`${relativeFile}: packages must not import application code (${specifier})`);
      }
      if (relativeFile.startsWith('packages/') && specifier === 'electron') {
        findings.push(`${relativeFile}: host-neutral packages must not import Electron`);
      }
      if (
        relativeFile.startsWith('apps/neko-desktop/src/renderer/') &&
        (specifier === 'electron' || specifier.startsWith('node:'))
      ) {
        findings.push(`${relativeFile}: Desktop renderer must remain browser-safe (${specifier})`);
      }
      if (
        relativeFile.startsWith('apps/neko-desktop/src/main/') &&
        (specifier === 'react' || specifier.startsWith('react-dom'))
      ) {
        findings.push(`${relativeFile}: Desktop Main must not depend on React`);
      }
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
    if (['node_modules', 'dist', 'coverage', '.turbo', '__tests__'].includes(entry.name)) continue;
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

function isApplicationImport(specifier) {
  return (
    specifier.startsWith('apps/') ||
    specifier.includes('/apps/neko-desktop/') ||
    specifier.includes('/apps/neko-vscode/') ||
    specifier.includes('/apps/neko-tui/')
  );
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkApplicationBoundaries();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
