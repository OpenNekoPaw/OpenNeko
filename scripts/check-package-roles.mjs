#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = 'quality/package-roles.json';
const allowedRoles = new Set([
  'contracts',
  'domain',
  'application',
  'runtime',
  'node',
  'webview',
  'infrastructure',
  'testing',
  'content-only',
]);
const allowedRuntimes = new Set(['host-neutral', 'node', 'browser', 'test', 'content']);
const allowedProductStatuses = new Set([
  'active-product',
  'retained-kernel',
  'inactive-prototype',
  'content-only',
]);
const allowedArchitectureStates = new Set(['converged', 'drift']);
const rootKeys = ['packages'];
const packageKeys = [
  'architectureState',
  'family',
  'name',
  'path',
  'productStatus',
  'roles',
  'runtimes',
];

export function validatePackageRoleCatalog(catalog, workspacePackages) {
  const findings = [];

  validateExactKeys('catalog', catalog, rootKeys, findings);
  if (!Array.isArray(catalog.packages)) {
    findings.push('catalog.packages must be an array');
    return findings;
  }

  const workspaceByPath = new Map(workspacePackages.map((entry) => [entry.path, entry]));
  const catalogByPath = new Map();
  const names = new Set();

  for (const workspace of workspacePackages) {
    if (workspace.path.split('/').length !== 2) continue;
    if (!workspacePackages.some((entry) => entry.path.startsWith(`${workspace.path}/`))) continue;
    findings.push(
      `${workspace.path}: family root workspace must not coexist with nested role packages`,
    );
  }

  for (const [index, entry] of catalog.packages.entries()) {
    const label = `catalog.packages[${index}]`;
    validateExactKeys(label, entry, packageKeys, findings);
    if (typeof entry.path !== 'string' || !/^packages\/[^/]+(?:\/[^/]+)?$/u.test(entry.path)) {
      findings.push(`${label}.path must identify a packages/* or packages/*/* workspace`);
      continue;
    }
    validateCanonicalPackageIdentity(label, entry, findings);
    if (catalogByPath.has(entry.path)) findings.push(`duplicate catalog path: ${entry.path}`);
    catalogByPath.set(entry.path, entry);

    if (typeof entry.name !== 'string' || entry.name.length === 0) {
      findings.push(`${entry.path}.name must be a non-empty package identity`);
    } else if (names.has(entry.name)) {
      findings.push(`duplicate package identity: ${entry.name}`);
    } else {
      names.add(entry.name);
    }
    if (typeof entry.family !== 'string' || !/^[a-z][a-z0-9-]*$/u.test(entry.family)) {
      findings.push(`${entry.path}.family must be a lowercase slug`);
    }
    validateEnumArray(`${entry.path}.roles`, entry.roles, allowedRoles, findings);
    validateEnumArray(`${entry.path}.runtimes`, entry.runtimes, allowedRuntimes, findings);
    if (!allowedProductStatuses.has(entry.productStatus)) {
      findings.push(`${entry.path}.productStatus is unknown: ${String(entry.productStatus)}`);
    }
    if (!allowedArchitectureStates.has(entry.architectureState)) {
      findings.push(
        `${entry.path}.architectureState is unknown: ${String(entry.architectureState)}`,
      );
    }

    if (entry.roles?.includes('webview') && !entry.runtimes?.includes('browser')) {
      findings.push(`${entry.path}: webview role requires browser runtime`);
    }
    if (entry.roles?.includes('node') && !entry.runtimes?.includes('node')) {
      findings.push(`${entry.path}: node role requires node runtime`);
    }
    const contentOnly = entry.roles?.includes('content-only');
    if (contentOnly !== (entry.productStatus === 'content-only')) {
      findings.push(
        `${entry.path}: content-only role and product status must be declared together`,
      );
    }

    const workspace = workspaceByPath.get(entry.path);
    if (!workspace) {
      findings.push(`catalog entry has no workspace package: ${entry.path}`);
    } else if (workspace.name !== entry.name) {
      findings.push(
        `${entry.path}: catalog name ${entry.name} does not match manifest name ${workspace.name}`,
      );
    }
  }

  for (const workspace of workspacePackages) {
    if (!catalogByPath.has(workspace.path)) {
      findings.push(`workspace package is missing from role catalog: ${workspace.path}`);
    }
  }

  return findings;
}

export async function inspectPackageRoles(root = repositoryRoot) {
  const [catalog, workspacePackages] = await Promise.all([
    readJson(path.join(root, catalogPath)),
    discoverWorkspacePackages(root),
  ]);
  const findings = validatePackageRoleCatalog(catalog, workspacePackages);
  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    catalog: catalogPath,
    checkedPackages: workspacePackages.length,
    findings,
  };
}

async function discoverWorkspacePackages(root) {
  const packagesRoot = path.join(root, 'packages');
  const packages = [];
  const familyEntries = await readdir(packagesRoot, { withFileTypes: true });
  for (const familyEntry of familyEntries) {
    if (!familyEntry.isDirectory()) continue;
    const familyRoot = path.join(packagesRoot, familyEntry.name);
    const familyManifestPath = path.join(familyRoot, 'package.json');
    if (await isFile(familyManifestPath)) {
      const manifest = await readJson(familyManifestPath);
      packages.push({ path: `packages/${familyEntry.name}`, name: manifest.name });
    }
    const roleEntries = await readdir(familyRoot, { withFileTypes: true });
    for (const roleEntry of roleEntries) {
      if (!roleEntry.isDirectory()) continue;
      const manifestPath = path.join(familyRoot, roleEntry.name, 'package.json');
      if (!(await isFile(manifestPath))) continue;
      const manifest = await readJson(manifestPath);
      packages.push({
        path: `packages/${familyEntry.name}/${roleEntry.name}`,
        name: manifest.name,
      });
    }
  }
  return packages.sort((left, right) => left.path.localeCompare(right.path));
}

function validateCanonicalPackageIdentity(label, entry, findings) {
  if (entry.path.startsWith('packages/neko-')) {
    findings.push(`${label}.path must not use the redundant packages/neko-* prefix`);
  }
  const segments = entry.path.split('/');
  if (
    segments.length === 2 &&
    /-(?:contracts|domain|application|runtime|node|webview|infrastructure|testing|dsh-plugin)$/u.test(
      segments[1] ?? '',
    )
  ) {
    findings.push(
      `${label}.path must nest role packages under packages/<family>/<role> instead of using a flat sibling`,
    );
  }
  if (typeof entry.name !== 'string' || !entry.name.startsWith('@neko/')) {
    findings.push(`${label}.name must use the single @neko/* scope`);
    return;
  }
  const expectedName =
    segments.length === 3 ? `@neko/${segments[1]}-${segments[2]}` : `@neko/${segments[1]}`;
  if (entry.name !== expectedName) {
    findings.push(
      `${label} path/name mismatch: ${entry.path} must declare ${expectedName}, found ${entry.name}`,
    );
  }
}

function validateExactKeys(label, value, expectedKeys, findings) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    findings.push(`${label} must be an object`);
    return;
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  for (const key of actual) {
    if (!expected.includes(key)) findings.push(`${label} has unknown field: ${key}`);
  }
  for (const key of expected) {
    if (!actual.includes(key)) findings.push(`${label} is missing field: ${key}`);
  }
}

function validateEnumArray(label, value, allowed, findings) {
  if (!Array.isArray(value) || value.length === 0) {
    findings.push(`${label} must be a non-empty array`);
    return;
  }
  if (new Set(value).size !== value.length) findings.push(`${label} must not contain duplicates`);
  for (const item of value) {
    if (!allowed.has(item)) findings.push(`${label} contains unknown value: ${String(item)}`);
  }
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inspectPackageRoles();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
