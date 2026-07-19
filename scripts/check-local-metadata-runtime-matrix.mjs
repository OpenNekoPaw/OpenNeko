import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
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

export async function validateLocalMetadataRuntimeMatrix({ probeBun = false } = {}) {
  const errors = [];
  const matrix = await readJson(matrixPath);
  if (!isRecord(matrix) || matrix.version !== 1 || !isRecord(matrix.minimums)) {
    return ['Runtime matrix must be a version 1 object with minimums'];
  }
  const minimumNode = matrix.minimums.node;
  const minimumBun = matrix.minimums.bun;
  const minimumVscode = matrix.minimums.vscode;
  const vscodeTypes = matrix.minimums.vscodeTypes;
  if (
    typeof minimumNode !== 'string' ||
    typeof minimumBun !== 'string' ||
    typeof minimumVscode !== 'string' ||
    typeof vscodeTypes !== 'string'
  ) {
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
  const expectedHosts = ['vscode-extension', 'node-cli', 'bun-tui'];
  const expectedPlatforms = [
    ['darwin', 'arm64'],
    ['linux', 'x64'],
    ['win32', 'x64'],
  ];
  for (const host of expectedHosts) {
    for (const [os, arch] of expectedPlatforms) {
      if (!targetKeys.has(`${host}:${os}:${arch}`)) {
        errors.push(`Runtime matrix is missing ${host}:${os}:${arch}`);
      }
    }
  }
  if (targetKeys.size !== 9) errors.push(`Runtime matrix must contain 9 unique targets`);

  for (const packageJsonPath of await collectPackageJsonPaths(packageRoot)) {
    const packageJson = await readJson(packageJsonPath);
    if (!isRecord(packageJson)) continue;
    const engines = isRecord(packageJson.engines) ? packageJson.engines : null;
    if (engines && typeof engines.vscode === 'string' && engines.vscode !== `^${minimumVscode}`) {
      errors.push(`${packageJsonPath} must declare VS Code ^${minimumVscode}`);
    }
    const development = isRecord(packageJson.devDependencies) ? packageJson.devDependencies : null;
    if (development && typeof development['@types/node'] === 'string') {
      if (development['@types/node'] !== `^${minimumNode.split('.')[0]}.0.0`) {
        errors.push(`${packageJsonPath} must use @types/node ^${minimumNode.split('.')[0]}.0.0`);
      }
    }
    if (development && typeof development['@types/vscode'] === 'string') {
      if (development['@types/vscode'] !== `^${vscodeTypes}`) {
        errors.push(`${packageJsonPath} must use @types/vscode ^${vscodeTypes}`);
      }
    }
  }

  const tuiPackage = await readFile(
    join(repositoryRoot, 'apps', 'neko-tui', 'package.json'),
    'utf8',
  );
  const tuiBuild = await readFile(
    join(repositoryRoot, 'apps', 'neko-tui', 'tsup.config.ts'),
    'utf8',
  );
  if (!tuiPackage.includes('"node": ">=24.0.0"') || !tuiBuild.includes("target: 'node24'")) {
    errors.push('OpenNeko TUI runtime and bundle targets must be node24');
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

  if (probeBun) {
    try {
      const versionResult = await execFileAsync('bun', ['--version']);
      const bunVersion = versionResult.stdout.trim();
      if (!isVersionAtLeast(bunVersion, minimumBun)) {
        errors.push(`Bun ${minimumBun}+ is required; received ${bunVersion}`);
      }
      await execFileAsync('bun', [
        '-e',
        "import { Database } from 'bun:sqlite'; const db = new Database(':memory:'); db.run('CREATE TABLE runtime_probe (id TEXT PRIMARY KEY) STRICT'); db.close();",
      ]);
    } catch (error) {
      errors.push(`bun:sqlite runtime probe failed: ${String(error)}`);
    }
  }

  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = await validateLocalMetadataRuntimeMatrix({
    probeBun: process.argv.includes('--probe-bun'),
  });
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log('Local metadata runtime matrix is valid (9 targets).');
  }
}
