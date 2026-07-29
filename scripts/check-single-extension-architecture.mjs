#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const ignoredDirectories = new Set([
  '.git',
  '.tmp',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'reports',
  'target',
]);
const failures = [];

const workspace = readFileSync(join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8');
if (!/^packages:\s*\n  - apps\/\*\s*\n  - packages\/\*\s*$/mu.test(workspace)) {
  failures.push('pnpm-workspace.yaml must discover only apps/* and packages/*.');
}

for (const packageJson of findFiles(join(repositoryRoot, 'packages'), 'package.json')) {
  const path = toRepoPath(packageJson);
  if (path.split('/').length !== 3) {
    failures.push(`Nested workspace manifest is forbidden: ${path}`);
  }
}

const vscodeManifestOwners = [];
for (const packageJson of [
  ...findFiles(join(repositoryRoot, 'apps'), 'package.json'),
  ...findFiles(join(repositoryRoot, 'packages'), 'package.json'),
]) {
  const manifest = JSON.parse(readFileSync(packageJson, 'utf8'));
  if (manifest.engines?.vscode || manifest.main?.includes('extension')) {
    vscodeManifestOwners.push(toRepoPath(packageJson));
  }
}
if (
  vscodeManifestOwners.length !== 1 ||
  vscodeManifestOwners[0] !== 'apps/neko-vscode/package.json'
) {
  failures.push(
    `Expected one VS Code manifest owner; found ${vscodeManifestOwners.join(', ') || '<none>'}.`,
  );
}

const forbiddenSourcePatterns = [
  ['embedded feature registry', /\bEmbeddedFeatureRegistry\b/u],
  ['scoped ExtensionContext factory', /\bcreateScopedExtensionContext\b/u],
  ['internal extension discovery', /\bresolveNekoExtension\b/u],
  ['optional Agent capability registration', /\bregisterOptionalAgentCapabilityProvider\b/u],
  [
    'internal Extension API lookup',
    /vscode\.extensions\.getExtension\(\s*['"]neko\.neko-(?:agent|assets|canvas|cut|preview|tools)['"]/u,
  ],
];
for (const file of findSourceFiles(join(repositoryRoot, 'apps', 'neko-vscode', 'src'))) {
  if (isTestPath(file)) continue;
  const source = readFileSync(file, 'utf8');
  for (const [label, pattern] of forbiddenSourcePatterns) {
    if (pattern.test(source)) failures.push(`${label} is forbidden: ${toRepoPath(file)}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Single-extension architecture verified: ${vscodeManifestOwners[0]}, flat workspace graph.\n`,
  );
}

function findFiles(root, fileName) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...findFiles(path, fileName));
    else if (entry.isFile() && entry.name === fileName) files.push(path);
  }
  return files;
}

function findSourceFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...findSourceFiles(path));
    else if (entry.isFile() && /\.(?:ts|tsx|mjs)$/u.test(entry.name)) files.push(path);
  }
  return files;
}

function isTestPath(path) {
  return /(?:^|[/\\])__tests__(?:[/\\])|(?:\.test|\.spec)\.[^.]+$/u.test(path);
}

function toRepoPath(path) {
  return relative(repositoryRoot, path).split('\\').join('/');
}
