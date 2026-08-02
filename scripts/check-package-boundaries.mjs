#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const exceptionPath = 'quality/ledgers/package-boundary-exceptions.json';
const dependencySections = ['dependencies', 'optionalDependencies', 'peerDependencies'];

export function inspectPackageManifestBoundary(entry, familySize = 1) {
  const findings = [];
  const exports = entry.manifest.exports;
  if (exports && typeof exports === 'object' && !Array.isArray(exports)) {
    for (const [key, target] of Object.entries(exports)) {
      if (key.includes('*') || JSON.stringify(target).includes('*')) {
        findings.push(
          finding(
            'wildcard-export',
            `${entry.path}/package.json`,
            key,
            'Package exports must enumerate explicit public entries.',
          ),
        );
      }
    }
  }

  const expectedPath = expectedPackagePath(entry.manifest.name);
  if (expectedPath && expectedPath !== entry.path) {
    findings.push(
      finding(
        'package-directory-identity',
        `${entry.path}/package.json`,
        `${entry.manifest.name} -> ${expectedPath}`,
        'Package name and first-level directory identity must correspond.',
      ),
    );
  }
  if (!entry.manifest.name.startsWith('@neko')) {
    findings.push(
      finding(
        'package-name-policy',
        `${entry.path}/package.json`,
        entry.manifest.name,
        'Workspace package names must use the @neko infrastructure or @neko-<domain> family scope.',
      ),
    );
  }
  if (
    familySize > 1 &&
    !entry.manifest.name.startsWith(`@neko-${entry.family}/`) &&
    !['shared', 'ui', 'host', 'media'].includes(entry.family)
  ) {
    findings.push(
      finding(
        'package-family-identity',
        `${entry.path}/package.json`,
        `${entry.family}:${entry.manifest.name}`,
        'Multi-package domain families must use @neko-<domain>/<role> identities.',
      ),
    );
  }
  return findings;
}

export function reconcileBoundaryExceptions(findings, ledger) {
  const observed = new Map(findings.map((entry) => [fingerprint(entry), entry]));
  const approved = new Map((ledger.exceptions ?? []).map((entry) => [fingerprint(entry), entry]));
  return {
    unapproved: findings.filter((entry) => !approved.has(fingerprint(entry))),
    staleExceptions: (ledger.exceptions ?? []).filter((entry) => !observed.has(fingerprint(entry))),
  };
}

export function inspectApplicationResponsibility({ path: entryPath, responsibility }) {
  return responsibility === 'business-owner'
    ? [
        finding(
          'business-owner-in-app',
          entryPath,
          responsibility,
          'Application roots may contain boundaries, adapters, composition, and product shell only.',
        ),
      ]
    : [];
}

export function inspectCanonicalPathFixture({ path: entryPath, legacyFallbackReturnsSuccess }) {
  return legacyFallbackReturnsSuccess
    ? [
        finding(
          'legacy-fallback-success',
          entryPath,
          'legacy-success',
          'Replaced paths must be deleted, poisoned, or fail-closed.',
        ),
      ]
    : [];
}

export async function inspectPackageBoundaries(root = repositoryRoot) {
  const catalog = JSON.parse(await readFile(path.join(root, 'quality/package-roles.json'), 'utf8'));
  const packageEntries = await readPackageEntries(root, catalog);
  const familySizes = new Map();
  for (const entry of catalog.packages) {
    familySizes.set(entry.family, (familySizes.get(entry.family) ?? 0) + 1);
  }
  const findings = packageEntries.flatMap((entry) =>
    inspectPackageManifestBoundary(entry, familySizes.get(entry.family) ?? 1),
  );
  const workspaceByName = [...packageEntries].sort(
    (left, right) => right.manifest.name.length - left.manifest.name.length,
  );

  for (const sourcePackage of packageEntries) {
    const sourceRoot = path.join(root, sourcePackage.path, 'src');
    for (const file of await findFiles(sourceRoot, isProductionSource)) {
      const source = await readFile(file, 'utf8');
      const relativeFile = repositoryPath(root, file);
      for (const specifier of extractImportSpecifiers(source)) {
        const target = workspaceByName.find(
          (candidate) =>
            specifier === candidate.manifest.name ||
            specifier.startsWith(`${candidate.manifest.name}/`),
        );
        if (target) {
          if (
            target.path !== sourcePackage.path &&
            !declaresDependency(sourcePackage.manifest, target.manifest.name)
          ) {
            findings.push(
              finding(
                'undeclared-workspace-dependency',
                relativeFile,
                target.manifest.name,
                'Production workspace imports must be declared in the consumer manifest.',
              ),
            );
          }
          const subpath =
            specifier === target.manifest.name
              ? '.'
              : `.${specifier.slice(target.manifest.name.length)}`;
          if (!isExportedSubpath(target.manifest.exports, subpath)) {
            findings.push(
              finding(
                'unexported-package-import',
                relativeFile,
                specifier,
                'Consumers must use an explicitly exported package entry.',
              ),
            );
          }
        }

        const privateTarget = resolvePrivateSourceImport(root, file, specifier);
        if (privateTarget && !privateTarget.startsWith(`${sourcePackage.path}/src/`)) {
          findings.push(
            finding(
              'private-source-import',
              relativeFile,
              specifier,
              'Consumers must not import another workspace package src/* implementation.',
            ),
          );
        }
      }
    }
  }

  const appEntry = await readApplicationEntry(root);
  if (appEntry) {
    const sourceRoot = path.join(root, appEntry.path, 'src');
    for (const file of await findFiles(sourceRoot, isProductionSource)) {
      const source = await readFile(file, 'utf8');
      const relativeFile = repositoryPath(root, file);
      for (const specifier of extractImportSpecifiers(source)) {
        const target = workspaceByName.find(
          (candidate) =>
            specifier === candidate.manifest.name ||
            specifier.startsWith(`${candidate.manifest.name}/`),
        );
        if (target && !declaresDependency(appEntry.manifest, target.manifest.name)) {
          findings.push(
            finding(
              'undeclared-workspace-dependency',
              relativeFile,
              target.manifest.name,
              'Production workspace imports must be declared in the consumer manifest.',
            ),
          );
        }
        if (target) {
          const subpath =
            specifier === target.manifest.name
              ? '.'
              : `.${specifier.slice(target.manifest.name.length)}`;
          if (!isExportedSubpath(target.manifest.exports, subpath)) {
            findings.push(
              finding(
                'unexported-package-import',
                relativeFile,
                specifier,
                'Consumers must use an explicitly exported package entry.',
              ),
            );
          }
        }
        const privateTarget = resolvePrivateSourceImport(root, file, specifier);
        if (privateTarget) {
          findings.push(
            finding(
              'private-source-import',
              relativeFile,
              specifier,
              'Applications must not import workspace package src/* implementation.',
            ),
          );
        }
      }
    }
  }

  const configFiles = await findConfigurationFiles(root);
  for (const file of configFiles) {
    const source = await readFile(file, 'utf8');
    const relativeFile = repositoryPath(root, file);
    for (const target of extractConfigurationSourceTargets(file, source)) {
      const resolved = resolveConfigurationTarget(file, target);
      const packageSource = resolved && packageSourcePath(root, resolved);
      const owningPackage = packageOwnerPath(root, file);
      const targetPackage = packageSource?.replace(/\/src\/$/u, '');
      if (packageSource && targetPackage !== owningPackage) {
        findings.push(
          finding(
            'source-alias-bypass',
            relativeFile,
            packageSource,
            'TypeScript/Vite/Vitest aliases must resolve declared package exports, not src/*.',
          ),
        );
      }
    }
  }

  const deduplicated = [
    ...new Map(findings.map((entry) => [fingerprint(entry), entry])).values(),
  ].sort(compareFinding);
  const ledger = await readExceptionLedger(root);
  const reconciliation = reconcileBoundaryExceptions(deduplicated, ledger);
  const ledgerFindings = validateExceptionLedger(ledger);
  return {
    status:
      reconciliation.unapproved.length === 0 &&
      reconciliation.staleExceptions.length === 0 &&
      ledgerFindings.length === 0
        ? 'passed'
        : 'failed',
    checkedPackages: packageEntries.length,
    observedFindings: deduplicated,
    unapproved: reconciliation.unapproved,
    staleExceptions: reconciliation.staleExceptions,
    ledgerFindings,
  };
}

function validateExceptionLedger(ledger) {
  const findings = [];
  if (ledger.version !== 1) findings.push('exception ledger version must equal 1');
  if (!Array.isArray(ledger.exceptions)) {
    findings.push('exception ledger exceptions must be an array');
    return findings;
  }
  const seen = new Set();
  for (const [index, entry] of ledger.exceptions.entries()) {
    const label = `exceptions[${index}]`;
    const expectedKeys = ['owner', 'path', 'removalTask', 'rule', 'subject'];
    const keys = Object.keys(entry).sort();
    if (keys.join('\0') !== expectedKeys.sort().join('\0')) {
      findings.push(`${label} must contain exactly ${expectedKeys.join(', ')}`);
    }
    for (const key of expectedKeys) {
      if (typeof entry[key] !== 'string' || entry[key].length === 0) {
        findings.push(`${label}.${key} must be a non-empty string`);
      }
    }
    const key = fingerprint(entry);
    if (seen.has(key)) findings.push(`${label} duplicates ${key}`);
    seen.add(key);
  }
  return findings;
}

async function readPackageEntries(root, catalog) {
  return Promise.all(
    catalog.packages.map(async (catalogEntry) => ({
      ...catalogEntry,
      manifest: JSON.parse(
        await readFile(path.join(root, catalogEntry.path, 'package.json'), 'utf8'),
      ),
    })),
  );
}

async function readApplicationEntry(root) {
  const appPath = 'apps/neko-desktop';
  try {
    return {
      path: appPath,
      manifest: JSON.parse(await readFile(path.join(root, appPath, 'package.json'), 'utf8')),
    };
  } catch {
    return undefined;
  }
}

async function readExceptionLedger(root) {
  try {
    return JSON.parse(await readFile(path.join(root, exceptionPath), 'utf8'));
  } catch {
    return { version: 1, exceptions: [] };
  }
}

function expectedPackagePath(name) {
  const scoped = /^@([^/]+)\/(.+)$/u.exec(name);
  if (scoped) return `packages/${scoped[1]}-${scoped[2]}`;
  if (/^[a-z0-9][a-z0-9-]*$/u.test(name)) return `packages/${name}`;
  return undefined;
}

function declaresDependency(manifest, dependency) {
  return dependencySections.some((section) => Object.hasOwn(manifest[section] ?? {}, dependency));
}

function isExportedSubpath(exports, subpath) {
  if (!exports) return false;
  if (typeof exports === 'string' || Array.isArray(exports)) return subpath === '.';
  if (Object.hasOwn(exports, subpath)) return true;
  return Object.keys(exports).some((key) => {
    if (!key.includes('*')) return false;
    const pattern = new RegExp(`^${escapeRegExp(key).replace('\\*', '.+')}$`, 'u');
    return pattern.test(subpath);
  });
}

function resolvePrivateSourceImport(root, sourceFile, specifier) {
  if (specifier.startsWith('.')) {
    const resolved = path.resolve(path.dirname(sourceFile), specifier);
    return packageSourcePath(root, resolved);
  }
  const match = /(?:^|\/)packages\/([^/]+)\/src(?:\/|$)/u.exec(specifier);
  return match ? `packages/${match[1]}/src/` : undefined;
}

function packageSourcePath(root, target) {
  const relative = repositoryPath(root, target);
  const match = /^packages\/([^/]+)\/src(?:\/|$)/u.exec(relative);
  return match ? `packages/${match[1]}/src/` : undefined;
}

function packageOwnerPath(root, file) {
  const relative = repositoryPath(root, file);
  const match = /^(packages\/[^/]+|apps\/[^/]+)(?:\/|$)/u.exec(relative);
  return match?.[1];
}

async function findConfigurationFiles(root) {
  const files = [];
  for (const directory of ['apps', 'packages']) {
    files.push(
      ...(await findFiles(path.join(root, directory), (file) =>
        /\/(?:tsconfig[^/]*\.json|vitest[^/]*\.[cm]?[jt]s|vite[^/]*\.[cm]?[jt]s)$/u.test(
          file.replaceAll('\\', '/'),
        ),
      )),
    );
  }
  return files;
}

function extractConfigurationSourceTargets(file, source) {
  if (path.basename(file).startsWith('tsconfig')) {
    const config = ts.parseConfigFileTextToJson(file, source).config ?? {};
    return Object.values(config.compilerOptions?.paths ?? {}).flatMap((targets) =>
      Array.isArray(targets)
        ? targets.filter((target) => typeof target === 'string' && target.includes('/src'))
        : [],
    );
  }
  return [...source.matchAll(/\b(?:path\.)?resolve\(([^)]*)\)/gu)].flatMap((match) =>
    [...match[1].matchAll(/['"]([^'"]*\/src(?:\/[^'"]*)?)['"]/gu)].map(
      (targetMatch) => targetMatch[1],
    ),
  );
}

function resolveConfigurationTarget(file, target) {
  if (target.startsWith('.')) return path.resolve(path.dirname(file), target.replace(/\/\*$/u, ''));
  const packagesIndex = target.indexOf('packages/');
  if (packagesIndex >= 0) {
    return path.resolve(repositoryRoot, target.slice(packagesIndex).replace(/\/\*$/u, ''));
  }
  return undefined;
}

function extractImportSpecifiers(source) {
  const sourceFile = ts.createSourceFile(
    'boundary-source.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const specifiers = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

async function findFiles(root, predicate) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (['node_modules', 'dist', 'coverage', '.vite', 'reports'].includes(entry.name)) continue;
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await findFiles(entryPath, predicate)));
    else if (entry.isFile() && predicate(entryPath)) files.push(entryPath);
  }
  return files;
}

function isProductionSource(file) {
  return (
    /\.[cm]?[jt]sx?$/u.test(file) &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file) &&
    !file.includes(`${path.sep}__tests__${path.sep}`)
  );
}

function finding(rule, entryPath, subject, message) {
  return { rule, path: entryPath, subject, message };
}

function fingerprint(entry) {
  return `${entry.rule}\0${entry.path}\0${entry.subject}`;
}

function compareFinding(left, right) {
  return fingerprint(left).localeCompare(fingerprint(right));
}

function repositoryPath(root, file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inspectPackageBoundaries();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
