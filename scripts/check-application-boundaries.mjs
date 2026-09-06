#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { extractImportSpecifiers } from './check-package-boundaries.mjs';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const productionRoots = ['apps/neko-desktop/src', 'packages'];
const nodeModules = new Set(builtinModules.map((name) => name.replace(/^node:/u, '')));

export async function checkApplicationBoundaries(root = repositoryRoot) {
  const catalog = JSON.parse(await readFile(resolve(root, 'quality/package-roles.json'), 'utf8'));
  const findings = [];
  const files = [];
  for (const sourceRoot of productionRoots) {
    await collectProductionFiles(resolve(root, sourceRoot), files);
  }

  for (const file of files) {
    const relativeFile = normalize(relative(root, file));
    const source = await readFile(file, 'utf8');
    const owner = catalog.packages.find((entry) => relativeFile.startsWith(`${entry.path}/src/`));
    const browserSource =
      relativeFile.startsWith('apps/neko-desktop/src/renderer/') ||
      owner?.roles.includes('webview') ||
      (owner?.runtimes.includes('browser') && !owner.runtimes.includes('node'));
    const hostSource =
      relativeFile.startsWith('apps/neko-desktop/src/main/') ||
      (owner && !owner.runtimes.includes('browser'));

    for (const specifier of extractImportSpecifiers(source)) {
      const target = catalog.packages.find(
        (entry) =>
          entry.name && (specifier === entry.name || specifier.startsWith(`${entry.name}/`)),
      );
      const nodePackage =
        target?.roles.includes('node') &&
        !target.roles.includes('contracts') &&
        !target.runtimes.includes('browser');
      if (relativeFile.startsWith('packages/') && isApplicationImport(specifier)) {
        findings.push(`${relativeFile}: packages must not import application code (${specifier})`);
      }
      if (relativeFile.startsWith('packages/') && specifier === 'electron') {
        findings.push(`${relativeFile}: host-neutral packages must not import Electron`);
      }
      if (
        browserSource &&
        (specifier === 'electron' ||
          nodePackage ||
          specifier.startsWith('node:') ||
          nodeModules.has(specifier) ||
          /\/node(?:\/|$)/u.test(specifier))
      ) {
        findings.push(`${relativeFile}: Desktop renderer must remain browser-safe (${specifier})`);
      }
      if (
        hostSource &&
        (specifier === 'react' ||
          specifier.startsWith('react/') ||
          /^react-dom(?:\/|$)/u.test(specifier))
      ) {
        findings.push(`${relativeFile}: Host code must not depend on React`);
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

function isApplicationImport(specifier) {
  return specifier.startsWith('apps/') || /(?:^|\/)apps\//u.test(specifier);
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
