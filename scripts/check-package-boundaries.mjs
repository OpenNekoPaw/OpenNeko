#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const dependencySections = ['dependencies', 'optionalDependencies', 'peerDependencies'];
const manifestDependencySections = [...dependencySections, 'devDependencies'];

export function inspectPackageManifestBoundary(entry) {
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

  const expectedName = expectedPackageName(entry.path);
  if (expectedName && expectedName !== entry.manifest.name) {
    findings.push(
      finding(
        'package-directory-identity',
        `${entry.path}/package.json`,
        `${entry.path} -> ${entry.manifest.name}`,
        `Canonical package path must declare ${expectedName}.`,
      ),
    );
  }
  if (!entry.manifest.name.startsWith('@neko/')) {
    findings.push(
      finding(
        'package-name-policy',
        `${entry.path}/package.json`,
        entry.manifest.name,
        'Workspace package names must use the single @neko/* scope.',
      ),
    );
  }
  if (entry.path.startsWith('packages/neko-')) {
    findings.push(
      finding(
        'package-path-policy',
        `${entry.path}/package.json`,
        entry.path,
        'Workspace package paths must not repeat the neko- prefix.',
      ),
    );
  }
  for (const section of manifestDependencySections) {
    for (const dependency of Object.keys(entry.manifest[section] ?? {})) {
      if (/^@neko-[a-z0-9-]+\//u.test(dependency)) {
        findings.push(
          finding(
            'noncanonical-package-identity',
            `${entry.path}/package.json`,
            dependency,
            'Workspace dependencies must not use a legacy multi-scope package identity.',
          ),
        );
      }
    }
  }
  return findings;
}

export function inspectNonCanonicalPackageNaming({ path: entryPath, source }) {
  const findings = [];
  for (const match of source.matchAll(/@neko-[a-z0-9-]+\/[a-z0-9._/-]+/gu)) {
    findings.push(
      finding(
        'noncanonical-package-identity',
        entryPath,
        match[0],
        'Executable source and current configuration must use the single @neko/* scope.',
      ),
    );
  }
  for (const match of source.matchAll(/packages\/neko-[a-z0-9-*]+/gu)) {
    findings.push(
      finding(
        'noncanonical-package-path',
        entryPath,
        match[0],
        'Executable source and current configuration must use canonical package roots.',
      ),
    );
  }
  return findings;
}

export async function inspectPackageBoundaries(root = repositoryRoot) {
  const catalog = JSON.parse(await readFile(path.join(root, 'quality/package-roles.json'), 'utf8'));
  const packageEntries = await readPackageEntries(root, catalog);
  const findings = packageEntries.flatMap((entry) => inspectPackageManifestBoundary(entry));
  const applications = (await readdir(path.join(root, 'apps'), { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(path.join(root, 'apps', entry.name, 'package.json')),
    )
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(applications) !== JSON.stringify(['neko-desktop'])) {
    findings.push(
      finding(
        'application-root',
        'apps',
        applications.join(', '),
        'The application composition root is apps/neko-desktop.',
      ),
    );
  }
  const workspaceByName = [...packageEntries].sort(
    (left, right) => right.manifest.name.length - left.manifest.name.length,
  );

  for (const sourcePackage of packageEntries) {
    const sourceRoot = path.join(root, sourcePackage.path, 'src');
    for (const file of await findFiles(sourceRoot, isProductionSource)) {
      const source = await readFile(file, 'utf8');
      const relativeFile = repositoryPath(root, file);
      findings.push(...inspectNonCanonicalPackageNaming({ path: relativeFile, source }));
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
  findings.push(
    ...inspectNonCanonicalPackageNaming({
      path: `${appEntry.path}/package.json`,
      source: JSON.stringify(appEntry.manifest),
    }),
  );
  const sourceRoot = path.join(root, appEntry.path, 'src');
  for (const file of await findFiles(sourceRoot, isProductionSource)) {
    const source = await readFile(file, 'utf8');
    const relativeFile = repositoryPath(root, file);
    findings.push(...inspectNonCanonicalPackageNaming({ path: relativeFile, source }));
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

  const configFiles = await findConfigurationFiles(root);
  for (const file of configFiles) {
    const source = await readFile(file, 'utf8');
    const relativeFile = repositoryPath(root, file);
    findings.push(...inspectNonCanonicalPackageNaming({ path: relativeFile, source }));
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

  for (const file of await findNamingConfigurationFiles(root)) {
    const source = await readFile(file, 'utf8');
    findings.push(
      ...inspectNonCanonicalPackageNaming({ path: repositoryPath(root, file), source }),
    );
  }

  const deduplicated = [
    ...new Map(findings.map((entry) => [fingerprint(entry), entry])).values(),
  ].sort(compareFinding);
  return {
    status: deduplicated.length === 0 ? 'passed' : 'failed',
    checkedPackages: packageEntries.length,
    findings: deduplicated,
  };
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
  return {
    path: appPath,
    manifest: JSON.parse(await readFile(path.join(root, appPath, 'package.json'), 'utf8')),
  };
}

function expectedPackageName(packagePath) {
  const segments = packagePath.split('/');
  if (segments.length === 2) return `@neko/${segments[1]}`;
  if (segments.length === 3) return `@neko/${segments[1]}-${segments[2]}`;
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
  const match = /(?:^|\/)(packages\/[^/]+(?:\/[^/]+)?\/src)(?:\/|$)/u.exec(specifier);
  return match ? `${match[1]}/` : undefined;
}

function packageSourcePath(root, target) {
  const relative = repositoryPath(root, target);
  const match = /^(packages\/[^/]+(?:\/[^/]+)?\/src)(?:\/|$)/u.exec(relative);
  return match ? `${match[1]}/` : undefined;
}

function packageOwnerPath(root, file) {
  const relative = repositoryPath(root, file);
  const appMatch = /^(apps\/[^/]+)(?:\/|$)/u.exec(relative);
  if (appMatch) return appMatch[1];
  const segments = relative.split('/');
  if (segments[0] !== 'packages') return undefined;
  const sourceIndex = segments.indexOf('src');
  if (sourceIndex !== 2 && sourceIndex !== 3) return undefined;
  return segments.slice(0, sourceIndex).join('/');
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

async function findNamingConfigurationFiles(root) {
  const rootFiles = [
    '.dependency-cruiser.cjs',
    'eslint.config.mjs',
    'knip.config.ts',
    'package.json',
    'pnpm-workspace.yaml',
    'tsconfig.json',
  ].map((file) => path.join(root, file));
  return [
    ...rootFiles.filter((file) => existsSync(file)),
    ...(await findFiles(path.join(root, '.github', 'workflows'), (file) => /\.ya?ml$/u.test(file))),
  ];
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

export function extractImportSpecifiers(source) {
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
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      specifiers.push(node.arguments[0].text);
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
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
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
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
