import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const matrixPath = join(repositoryRoot, 'quality', 'local-metadata-runtime-matrix.json');
const packageRoot = join(repositoryRoot, 'packages');

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseVersion(value) {
  return value.split('.').map((part) => Number.parseInt(part, 10));
}

function isVersionAtLeast(actual, minimum) {
  const actualParts = parseVersion(actual);
  const minimumParts = parseVersion(minimum);
  for (let index = 0; index < minimumParts.length; index += 1) {
    const actualPart = actualParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (actualPart > minimumPart) return true;
    if (actualPart < minimumPart) return false;
  }
  return true;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function collectPackageJsonPaths(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await collectPackageJsonPaths(path)));
    } else if (entry.name === 'package.json') {
      paths.push(path);
    }
  }
  return paths;
}

export async function validateLocalMetadataRuntimeMatrix() {
  const errors = [];
  const matrix = await readJson(matrixPath);
  if (!isRecord(matrix) || matrix.version !== 1 || !isRecord(matrix.minimums)) {
    return ['Runtime matrix must be a version 1 object with minimums'];
  }
  const minimumNode = matrix.minimums.node;
  if (typeof minimumNode !== 'string') {
    return ['Runtime matrix minimum versions must be strings'];
  }

  const targets = Array.isArray(matrix.targets) ? matrix.targets : [];
  const targetKeys = new Set();
  for (const target of targets) {
    if (
      !isRecord(target) ||
      typeof target.host !== 'string' ||
      typeof target.os !== 'string' ||
      typeof target.arch !== 'string'
    ) {
      errors.push('Runtime matrix contains an invalid target');
      continue;
    }
    targetKeys.add(`${target.host}:${target.os}:${target.arch}`);
  }
  const expectedHosts = ['electron-main'];
  const expectedPlatforms = [
    ['darwin', 'arm64'],
    ['win32', 'x64'],
  ];
  for (const host of expectedHosts) {
    for (const [os, arch] of expectedPlatforms) {
      if (!targetKeys.has(`${host}:${os}:${arch}`)) {
        errors.push(`Runtime matrix is missing ${host}:${os}:${arch}`);
      }
    }
  }
  if (targetKeys.size !== 2) errors.push(`Runtime matrix must contain 2 unique targets`);

  for (const packageJsonPath of await collectPackageJsonPaths(packageRoot)) {
    const packageJson = await readJson(packageJsonPath);
    if (!isRecord(packageJson)) continue;
    const engines = isRecord(packageJson.engines) ? packageJson.engines : null;
    const development = isRecord(packageJson.devDependencies) ? packageJson.devDependencies : null;
    if (development && typeof development['@types/node'] === 'string') {
      if (development['@types/node'] !== `^${minimumNode.split('.')[0]}.0.0`) {
        errors.push(`${packageJsonPath} must use @types/node ^${minimumNode.split('.')[0]}.0.0`);
      }
    }
    if (development && typeof development['@types/vscode'] === 'string') {
      errors.push(`${packageJsonPath} must not depend on @types/vscode`);
    }
  }

  const desktopPackage = await readJson(
    join(repositoryRoot, 'apps', 'neko-desktop', 'package.json'),
  );
  if (desktopPackage.engines?.node !== `>=${minimumNode}`) {
    errors.push(`OpenNeko Desktop must declare Node >=${minimumNode}`);
  }

  if (!isVersionAtLeast(process.versions.node, minimumNode)) {
    errors.push(`Node ${minimumNode}+ is required; received ${process.versions.node}`);
  } else {
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const database = new DatabaseSync(':memory:');
      database.exec('CREATE TABLE runtime_probe (id TEXT PRIMARY KEY) STRICT');
      database.close();
    } catch (error) {
      errors.push(`node:sqlite runtime probe failed: ${String(error)}`);
    }
  }

  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = await validateLocalMetadataRuntimeMatrix();
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log('Local metadata runtime matrix is valid (2 Desktop targets).');
  }
}
