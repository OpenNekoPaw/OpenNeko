#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const configPath = join(repoRoot, 'quality/test-ownership.json');

export async function auditTestOwnership(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const config =
    options.config ??
    JSON.parse(await readFile(resolve(root, 'quality/test-ownership.json'), 'utf8'));
  validateConfig(config);
  const packages = (
    await Promise.all([
      discoverPackages(resolve(root, 'apps'), root),
      discoverPackages(resolve(root, 'packages'), root),
    ])
  ).flat();
  const packageByPath = new Map(packages.map((workspace) => [workspace.path, workspace]));
  const sourceBearing = packages.filter((workspace) => workspace.sourceFiles.length > 0);
  const entryByPath = new Map(config.workspaces.map((entry) => [entry.path, entry]));
  const errors = [];

  for (const workspace of sourceBearing) {
    const entry = entryByPath.get(workspace.path);
    if (!entry) {
      errors.push(`Unowned source-bearing workspace: ${workspace.path}`);
      continue;
    }
    if (entry.mode === 'alternative') {
      for (const field of ['rationale', 'validationAlternative', 'closingCondition']) {
        if (typeof entry[field] !== 'string' || entry[field].trim().length === 0) {
          errors.push(`${workspace.path} alternative ownership is missing ${field}`);
        }
      }
      continue;
    }
    const owner = packageByPath.get(entry.owner);
    if (!owner) {
      errors.push(`${workspace.path} references unknown test owner ${entry.owner}`);
      continue;
    }
    const testCommand = owner.packageJson.scripts?.test;
    if (typeof testCommand !== 'string' || testCommand.trim().length === 0) {
      errors.push(`${workspace.path} owner ${entry.owner} has no test command`);
    } else if (/passWithNoTests|<NONEXISTENT>/u.test(testCommand)) {
      errors.push(`${workspace.path} owner ${entry.owner} uses empty-test success: ${testCommand}`);
    }
    if (entry.mode === 'self' && entry.owner !== entry.path) {
      errors.push(`${workspace.path} declares self ownership by ${entry.owner}`);
    }
    if (entry.mode === 'aggregated' && entry.owner === entry.path) {
      errors.push(`${workspace.path} declares an aggregator but points to itself`);
    }
  }

  for (const entry of config.workspaces) {
    if (!packageByPath.has(entry.path)) {
      errors.push(`Ownership entry references unknown workspace: ${entry.path}`);
    }
  }

  const duplicateEntries = findDuplicates(config.workspaces.map((entry) => entry.path));
  for (const path of duplicateEntries) {
    errors.push(`Workspace has multiple ownership entries: ${path}`);
  }

  const result = {
    schemaVersion: config.schemaVersion,
    ok: errors.length === 0,
    sourceBearingWorkspaces: sourceBearing.length,
    selfOwned: config.workspaces.filter((entry) => entry.mode === 'self').length,
    aggregated: config.workspaces.filter((entry) => entry.mode === 'aggregated').length,
    alternatives: config.workspaces.filter((entry) => entry.mode === 'alternative').length,
    errors,
  };
  if (!result.ok && options.throwOnError !== false) {
    throw new Error(
      `Test ownership audit failed:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }
  return result;
}

function validateConfig(config) {
  if (config?.schemaVersion !== 'neko.test-ownership.v1') {
    throw new Error('quality/test-ownership.json has an unknown schemaVersion');
  }
  if (!Array.isArray(config.workspaces)) {
    throw new Error('quality/test-ownership.json workspaces must be an array');
  }
  for (const [index, entry] of config.workspaces.entries()) {
    const allowed = new Set([
      'path',
      'owner',
      'mode',
      'sourceScope',
      'testScope',
      'rationale',
      'validationAlternative',
      'closingCondition',
    ]);
    const unknown = Object.keys(entry).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      throw new Error(`workspaces[${index}] contains unknown fields: ${unknown.join(', ')}`);
    }
    if (!['self', 'aggregated', 'alternative'].includes(entry.mode)) {
      throw new Error(`workspaces[${index}].mode is invalid`);
    }
    for (const field of ['path', 'sourceScope', 'testScope']) {
      if (typeof entry[field] !== 'string' || entry[field].length === 0) {
        throw new Error(`workspaces[${index}].${field} must be a string`);
      }
    }
  }
}

async function discoverPackages(packagesRoot, root) {
  const packageJsonPaths = await findPackageJsonFiles(packagesRoot, 0);
  return Promise.all(
    packageJsonPaths.map(async (packageJsonPath) => {
      const workspaceRoot = dirname(packageJsonPath);
      const sourceRoot = join(workspaceRoot, 'src');
      return {
        path: normalizePath(relative(root, workspaceRoot)),
        packageJson: JSON.parse(await readFile(packageJsonPath, 'utf8')),
        sourceFiles: await findSourceFiles(sourceRoot).catch(() => []),
      };
    }),
  );
}

async function findPackageJsonFiles(root, depth) {
  if (depth > 4) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'out') continue;
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name === 'package.json') files.push(path);
    else if (entry.isDirectory()) files.push(...(await findPackageJsonFiles(path, depth + 1)));
  }
  return files;
}

async function findSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await findSourceFiles(path)));
    else if (
      entry.isFile() &&
      /\.[cm]?[jt]sx?$/u.test(entry.name) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name)
    )
      files.push(path);
  }
  return files;
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

async function main() {
  const result = await auditTestOwnership();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
