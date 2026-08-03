#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const configurationPath = 'quality/package-product-status.json';

export function collectRuntimeModuleSpecifiers(source, fileName = 'module.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(fileName),
  );
  const specifiers = [];

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (isRuntimeImport(node.importClause)) specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (!node.isTypeOnly && isRuntimeExport(node.exportClause)) {
        specifiers.push(node.moduleSpecifier.text);
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference;
      if (
        !node.isTypeOnly &&
        ts.isExternalModuleReference(reference) &&
        reference.expression &&
        ts.isStringLiteral(reference.expression)
      ) {
        specifiers.push(reference.expression.text);
      }
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const argument = node.arguments[0];
      if (
        argument &&
        ts.isStringLiteral(argument) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        specifiers.push(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...new Set(specifiers)];
}

export function computeReachableModules({ entries, modules, declaredEdges = [] }) {
  const queue = [];
  const reachable = new Set();
  const parent = new Map();
  const declaredBySource = new Map();
  for (const edge of declaredEdges) {
    const edges = declaredBySource.get(edge.source) ?? [];
    edges.push(edge);
    declaredBySource.set(edge.source, edges);
  }

  for (const entry of entries) {
    if (!modules.has(entry))
      throw new Error(`Production entry is missing from module graph: ${entry}`);
    if (!reachable.has(entry)) {
      reachable.add(entry);
      queue.push(entry);
    }
  }

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) continue;
    const outgoing = [
      ...(modules.get(current) ?? []),
      ...(declaredBySource.get(current) ?? []).map((edge) => ({
        target: edge.target,
        specifier: edge.targetPackage,
        evidence: 'declared-dynamic',
      })),
    ];
    for (const edge of outgoing) {
      if (reachable.has(edge.target)) continue;
      reachable.add(edge.target);
      parent.set(edge.target, { source: current, ...edge });
      queue.push(edge.target);
    }
  }

  return { reachable, parent };
}

export function compareProductStatuses({ catalog, reachablePackages, packagePaths }) {
  const findings = [];
  for (const entry of catalog.packages) {
    if (entry.productStatus === 'content-only') continue;
    const reachable = reachablePackages.has(entry.name);
    if (reachable && entry.productStatus !== 'active-product') {
      findings.push(
        `${entry.name} is production-reachable but declares ${entry.productStatus}: ${formatPath(packagePaths.get(entry.name))}`,
      );
    }
    if (!reachable && entry.productStatus === 'active-product') {
      findings.push(
        `${entry.name} declares active-product but has no value-import path from a supported application entry`,
      );
    }
  }
  return findings;
}

export async function inspectPackageProductStatus(root = repositoryRoot) {
  const [configuration, catalog] = await Promise.all([
    readJson(path.join(root, configurationPath)),
    readJson(path.join(root, 'quality/package-roles.json')),
  ]);
  const configurationFindings = validateProductStatusConfiguration(configuration, {
    now: Date.now(),
    pathExists: (relative) => existsSync(path.join(root, relative)),
  });
  if (configurationFindings.length > 0) return failedResult(configurationFindings);

  const packages = await readWorkspacePackages(root, catalog);
  const migrationOnly = new Set(configuration.migrationOnlyModules);
  const sourceFiles = await discoverSourceFiles(root, catalog, migrationOnly);
  const moduleGraph = new Map();
  const unresolvedWorkspaceImports = [];

  for (const relativeFile of sourceFiles) {
    const source = await readFile(path.join(root, relativeFile), 'utf8');
    const edges = [];
    for (const specifier of collectRuntimeModuleSpecifiers(source, relativeFile)) {
      const target = await resolveModule(root, relativeFile, specifier, packages, migrationOnly);
      if (target) {
        edges.push({ target, specifier, evidence: 'source' });
      } else if (findWorkspacePackage(specifier, packages)) {
        unresolvedWorkspaceImports.push(`${relativeFile} -> ${specifier}`);
      }
    }
    moduleGraph.set(relativeFile, edges);
  }

  if (unresolvedWorkspaceImports.length > 0) {
    return failedResult(
      unresolvedWorkspaceImports.map(
        (edge) => `Cannot resolve production workspace import: ${edge}`,
      ),
    );
  }

  const declaredEdges = [];
  for (const edge of configuration.dynamicEdges) {
    const targetPackage = packages.find((entry) => entry.name === edge.targetPackage);
    const target = targetPackage && (await resolvePackageExport(root, targetPackage, '.'));
    if (!target)
      return failedResult([`Cannot resolve declared dynamic edge: ${edge.targetPackage}`]);
    declaredEdges.push({ ...edge, target });
  }

  const graph = computeReachableModules({
    entries: configuration.applicationEntries,
    modules: moduleGraph,
    declaredEdges,
  });
  const reachablePackages = new Set();
  const packagePaths = new Map();
  for (const file of graph.reachable) {
    const owner = packages.find(
      (entry) => file === entry.path || file.startsWith(`${entry.path}/`),
    );
    if (!owner) continue;
    reachablePackages.add(owner.name);
    if (!packagePaths.has(owner.name)) packagePaths.set(owner.name, tracePath(file, graph.parent));
  }

  const findings = compareProductStatuses({ catalog, reachablePackages, packagePaths });
  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    configuration: configurationPath,
    applicationEntries: configuration.applicationEntries,
    checkedModules: moduleGraph.size,
    reachablePackages: [...reachablePackages].sort(),
    findings,
  };
}

function isRuntimeImport(importClause) {
  if (!importClause) return true;
  if (importClause.isTypeOnly) return false;
  if (importClause.name) return true;
  const bindings = importClause.namedBindings;
  if (!bindings || ts.isNamespaceImport(bindings)) return true;
  return bindings.elements.some((element) => !element.isTypeOnly);
}

function isRuntimeExport(exportClause) {
  if (!exportClause || !ts.isNamedExports(exportClause)) return true;
  return exportClause.elements.some((element) => !element.isTypeOnly);
}

function scriptKind(fileName) {
  if (/\.tsx$/u.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/u.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/u.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function validateProductStatusConfiguration(
  configuration,
  { now = Date.now(), pathExists = () => true } = {},
) {
  const findings = [];
  validateExactKeys(
    'configuration',
    configuration,
    ['applicationEntries', 'dynamicEdges', 'migrationOnlyModules', 'version'],
    findings,
  );
  if (configuration.version !== 1) findings.push('configuration.version must equal 1');
  validatePathArray('applicationEntries', configuration.applicationEntries, findings);
  validatePathArray('migrationOnlyModules', configuration.migrationOnlyModules, findings);
  if (!Array.isArray(configuration.dynamicEdges)) {
    findings.push('dynamicEdges must be an array');
  } else {
    for (const [index, edge] of configuration.dynamicEdges.entries()) {
      const label = `dynamicEdges[${index}]`;
      validateExactKeys(
        label,
        edge,
        [
          'expiresOn',
          'kind',
          'owner',
          'reason',
          'reviewCondition',
          'source',
          'targetPackage',
          'validationPath',
        ],
        findings,
      );
      for (const key of [
        'owner',
        'reason',
        'reviewCondition',
        'source',
        'targetPackage',
        'validationPath',
      ]) {
        if (typeof edge?.[key] !== 'string' || edge[key].length === 0) {
          findings.push(`${label}.${key} must be a non-empty string`);
        }
      }
      if (edge?.kind !== 'non-literal-runtime-import') {
        findings.push(`${label}.kind must equal non-literal-runtime-import`);
      }
      if (typeof edge?.expiresOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(edge.expiresOn)) {
        findings.push(`${label}.expiresOn must be an ISO date`);
      } else if (Date.parse(`${edge.expiresOn}T23:59:59Z`) < now) {
        findings.push(`${label}.expiresOn has expired: ${edge.expiresOn}`);
      }
      if (typeof edge?.source === 'string' && !pathExists(edge.source)) {
        findings.push(`${label}.source does not exist: ${edge.source}`);
      }
      if (typeof edge?.validationPath === 'string' && !pathExists(edge.validationPath)) {
        findings.push(`${label}.validationPath does not exist: ${edge.validationPath}`);
      }
    }
  }
  return findings;
}

function validateExactKeys(label, value, keys, findings) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    findings.push(`${label} must be an object`);
    return;
  }
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  for (const key of actual)
    if (!expected.includes(key)) findings.push(`${label} has unknown field: ${key}`);
  for (const key of expected)
    if (!actual.includes(key)) findings.push(`${label} is missing field: ${key}`);
}

function validatePathArray(label, value, findings) {
  if (!Array.isArray(value)) {
    findings.push(`${label} must be an array`);
    return;
  }
  if (new Set(value).size !== value.length) findings.push(`${label} must not contain duplicates`);
  for (const entry of value) {
    if (typeof entry !== 'string' || path.isAbsolute(entry) || entry.includes('..')) {
      findings.push(`${label} contains a non-portable repository path: ${String(entry)}`);
    }
  }
}

async function discoverSourceFiles(root, catalog, migrationOnly) {
  const roots = ['apps/neko-desktop/src', ...catalog.packages.map((entry) => `${entry.path}/src`)];
  const files = [];
  for (const sourceRoot of roots) {
    for (const file of await walkFiles(path.join(root, sourceRoot))) {
      const relative = repositoryPath(root, file);
      if (migrationOnly.has(relative) || !isSourceFile(relative)) continue;
      files.push(relative);
    }
  }
  return files.sort();
}

async function walkFiles(directory) {
  if (!(await isDirectory(directory))) return [];
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(target)));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

function isSourceFile(file) {
  return (
    sourceExtensions.some((extension) => file.endsWith(extension)) &&
    !/(^|\/)(__tests__|fixtures|functional)(\/|$)/u.test(file) &&
    !/\.(test|spec)\.[cm]?[jt]sx?$/u.test(file) &&
    !/\.d\.ts$/u.test(file)
  );
}

async function readWorkspacePackages(root, catalog) {
  const packages = [];
  for (const entry of catalog.packages) {
    const manifest = await readJson(path.join(root, entry.path, 'package.json'));
    packages.push({ ...entry, manifest });
  }
  return packages.sort((left, right) => right.name.length - left.name.length);
}

async function resolveModule(root, fromFile, specifier, packages, migrationOnly) {
  let candidate;
  if (specifier.startsWith('.')) {
    candidate = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  } else {
    const workspacePackage = findWorkspacePackage(specifier, packages);
    if (!workspacePackage) return undefined;
    const subpath =
      specifier === workspacePackage.name
        ? '.'
        : `.${specifier.slice(workspacePackage.name.length)}`;
    candidate = await resolvePackageExport(root, workspacePackage, subpath);
  }
  if (!candidate) return undefined;
  const resolved = await resolveSourceCandidate(root, candidate);
  return resolved && !migrationOnly.has(resolved) ? resolved : undefined;
}

function findWorkspacePackage(specifier, packages) {
  return packages.find(
    (entry) => specifier === entry.name || specifier.startsWith(`${entry.name}/`),
  );
}

async function resolvePackageExport(root, workspacePackage, subpath) {
  const exports = workspacePackage.manifest.exports;
  const target = typeof exports === 'string' && subpath === '.' ? exports : exports?.[subpath];
  const selected = selectExportTarget(target);
  if (!selected || !selected.startsWith('./')) return undefined;
  return path.posix.join(workspacePackage.path, selected.slice(2));
}

function selectExportTarget(target) {
  if (typeof target === 'string') return target;
  if (!target || typeof target !== 'object' || Array.isArray(target)) return undefined;
  for (const condition of ['import', 'node', 'browser', 'default']) {
    const selected = selectExportTarget(target[condition]);
    if (selected) return selected;
  }
  return undefined;
}

async function resolveSourceCandidate(root, candidate) {
  const exact = path.join(root, candidate);
  if (await isFile(exact)) return repositoryPath(root, exact);
  for (const extension of sourceExtensions) {
    const withExtension = `${exact}${extension}`;
    if (await isFile(withExtension)) return repositoryPath(root, withExtension);
  }
  for (const extension of sourceExtensions) {
    const index = path.join(exact, `index${extension}`);
    if (await isFile(index)) return repositoryPath(root, index);
  }
  return undefined;
}

function tracePath(target, parent) {
  const pathEntries = [target];
  let current = target;
  while (parent.has(current)) {
    const edge = parent.get(current);
    pathEntries.push(`${edge.source} --${edge.specifier}--> ${current}`);
    current = edge.source;
  }
  return pathEntries.reverse();
}

function formatPath(entries) {
  return entries?.join(' | ') ?? 'path unavailable';
}

function repositoryPath(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(target) {
  try {
    return (await stat(target)).isFile();
  } catch {
    return false;
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function failedResult(findings) {
  return { status: 'failed', configuration: configurationPath, findings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inspectPackageProductStatus();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
