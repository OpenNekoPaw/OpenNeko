#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const allowancePath = 'quality/internal-versioning-external-allowances.json';
const domainAllowancePath = 'quality/internal-versioning-domain-allowances.json';
const correctnessAllowancePath = 'quality/internal-versioning-correctness-allowances.json';
// These audit artifacts must name forbidden markers in order to classify them.
const exactExcludedFiles = new Set([
  allowancePath,
  domainAllowancePath,
  correctnessAllowancePath,
  'scripts/check-no-internal-versioning.mjs',
  'scripts/check-no-internal-versioning.test.mjs',
]);
const generatedDirectoryNames = new Set([
  '.git',
  '.dsh-development-runtime',
  '.dsh-runtime-stage',
  '.neko',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'reports',
  'target',
]);
const sourceExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);
const migrationPattern = /(?:compatibility|legacy|migrat(?:e|ed|es|ing|ion|ions|or|ors))/iu;
const versionFieldPattern = /^(?:[a-z0-9]+_)*version$/iu;
const camelVersionFieldPattern = /^(?:Version|version|[A-Za-z][A-Za-z0-9]*Version)$/u;
const dataGenerationAliasPattern = /(?:^|_)(?:epoch|generation|revision)$/iu;
const camelDataGenerationAliasPattern =
  /^(?:epoch|generation|revision|[a-z][A-Za-z0-9]*(?:Epoch|Generation|Revision))$/u;
const numericIdentifierPattern = /(?:^|[_-])v\d+(?:$|[_-])|[A-Za-z0-9]V\d+$/u;
const numericPathPattern = /(?:^|[./:_-])v\d+(?:$|[./:_-])/iu;
const tableGenerationIdentifierPattern =
  /^(?:m\d+_?(?:Schema|Tables?)|schemaGeneration|table(?:Generation|Version))$/iu;
const tableGenerationPathPattern = /(?:^|[./:_-])m\d+[_-](?:schema|tables?)(?:$|[./:_-])/iu;
const tableGenerationSqlPattern =
  /\bPRAGMA\s+user_version\b|\b(?:CREATE|ALTER|DROP)\s+TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?\s+[A-Za-z_][A-Za-z0-9_]*_v\d+\b/iu;
const automaticRepairPattern = /(?:^|-)(?:auto|automatic)-(?:repair|rebuild)(?:-|$)/u;
const parallelDataPathPattern =
  /(?:^|-)dual-(?:read|write)(?:-|$)|(?:^|-)(?:cache|projection|raw)-or-(?:cache|projection|raw|source)(?:-|$)/u;
const alternateSuccessPathPattern =
  /(?:^|-)fallback-(?:adapter|handler|provider|reader|renderer|source|writer)(?:-|$)|(?:^|-)(?:default|wildcard)-handler(?:-|$)|(?:^|-)fallback-to-active(?:-|$)|(?:^|-)implicit-(?:project|session|success|workspace)(?:-|$)|(?:^|-)try-next-(?:adapter|handler|provider|reader|renderer|source|writer)(?:-|$)/u;

export function isGeneratedDirectoryName(name) {
  return generatedDirectoryNames.has(name);
}

export function scanSources(sources) {
  const findings = [];
  for (const source of sources) {
    const pathFinding = classifyPath(source.path);
    if (pathFinding) {
      findings.push(
        createFinding(source.path, pathFinding.category, pathFinding.token, 1, source.path, 0),
      );
    }
    findings.push(...scanSource(source));
  }
  return assignStableIds(findings);
}

export function validateAllowanceRegistry(registry, findings) {
  return validateRegistry(registry, findings, [
    'externalOwner',
    'isolationRule',
    'normativeSource',
  ]);
}

export function validateDomainAllowanceRegistry(registry, findings) {
  return validateRegistry(registry, findings, [
    'businessRequirement',
    'domainOwner',
    'isolationRule',
    'userWorkflow',
  ]);
}

export function validateCorrectnessAllowanceRegistry(registry, findings) {
  return validateRegistry(registry, findings, [
    'consumer',
    'correctnessInvariant',
    'isolationRule',
    'owner',
    'removalCondition',
    'versionFreeAnalysis',
  ]);
}

function validateRegistry(registry, findings, evidenceKeys) {
  if (!isRecord(registry) || !Array.isArray(registry.allowances)) {
    return ['Allowance registry must be an object with an allowances array.'];
  }
  const errors = [];
  if (Object.keys(registry).some((key) => key !== 'allowances')) {
    errors.push('Allowance registry contains unsupported top-level fields.');
  }
  const occurrenceKeys = ['category', 'id', 'path', 'token'];
  const requiredKeys = [...occurrenceKeys, ...evidenceKeys].sort();
  const groupKeys = ['occurrences', ...evidenceKeys].sort();
  const occurrences = [];
  for (const [index, group] of registry.allowances.entries()) {
    if (
      !isRecord(group) ||
      JSON.stringify(Object.keys(group).sort()) !== JSON.stringify(groupKeys) ||
      !Array.isArray(group.occurrences) ||
      group.occurrences.length === 0
    ) {
      errors.push(
        `allowances[${index}] must contain exactly ${groupKeys.join(', ')} with non-empty occurrences.`,
      );
      continue;
    }
    const { occurrences: entries, ...evidence } = group;
    for (const [entryIndex, entry] of entries.entries()) {
      if (
        !isRecord(entry) ||
        JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify([...occurrenceKeys].sort())
      ) {
        errors.push(
          `allowances[${index}].occurrences[${entryIndex}] must contain exactly ${occurrenceKeys.join(', ')}.`,
        );
        continue;
      }
      occurrences.push({
        label: `allowances[${index}].occurrences[${entryIndex}]`,
        allowance: { ...evidence, ...entry },
      });
    }
  }
  const findingById = new Map(findings.map((finding) => [finding.id, finding]));
  const ids = new Set();
  for (const { label, allowance } of occurrences) {
    if (
      !isRecord(allowance) ||
      JSON.stringify(Object.keys(allowance).sort()) !== JSON.stringify(requiredKeys)
    ) {
      errors.push(`${label} must contain exactly ${requiredKeys.join(', ')}.`);
      continue;
    }
    for (const key of requiredKeys) {
      if (typeof allowance[key] !== 'string' || allowance[key].trim().length === 0) {
        errors.push(`${label}.${key} must be a non-empty string.`);
      }
    }
    if (
      evidenceKeys.includes('normativeSource') &&
      !/^https:\/\//u.test(allowance.normativeSource)
    ) {
      errors.push(`${label}.normativeSource must be an HTTPS normative source.`);
    }
    if (
      evidenceKeys.includes('domainOwner') &&
      !/^@neko\/[a-z0-9-]+$/u.test(allowance.domainOwner)
    ) {
      errors.push(`${label}.domainOwner must identify an owning @neko package.`);
    }
    if (ids.has(allowance.id)) errors.push(`${label}.id duplicates ${allowance.id}.`);
    ids.add(allowance.id);
    const finding = findingById.get(allowance.id);
    if (!finding) {
      errors.push(`${label} is stale; ${allowance.id} does not identify a current occurrence.`);
      continue;
    }
    for (const key of ['path', 'category', 'token']) {
      if (allowance[key] !== finding[key])
        errors.push(`${label}.${key} does not match the exact current occurrence.`);
    }
  }
  return errors;
}

export function buildAuditReport({
  findings,
  allowanceRegistry,
  domainAllowanceRegistry = { allowances: [] },
  correctnessAllowanceRegistry = { allowances: [] },
}) {
  const errors = [
    ...validateAllowanceRegistry(allowanceRegistry, findings),
    ...validateDomainAllowanceRegistry(domainAllowanceRegistry, findings),
    ...validateCorrectnessAllowanceRegistry(correctnessAllowanceRegistry, findings),
  ];
  const registries = [allowanceRegistry, domainAllowanceRegistry, correctnessAllowanceRegistry];
  const allowedIds = new Set(
    registries.flatMap((registry) =>
      Array.isArray(registry?.allowances)
        ? registry.allowances.flatMap((group) =>
            Array.isArray(group?.occurrences) ? group.occurrences.map((entry) => entry?.id) : [],
          )
        : [],
    ),
  );
  const violations = findings.filter((finding) => !allowedIds.has(finding.id));
  return {
    status: errors.length === 0 && violations.length === 0 ? 'passed' : 'failed',
    violations,
    errors,
  };
}

function scanSource(source) {
  const sourceFile = ts.createSourceFile(
    source.path,
    source.content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(source.path),
  );
  const lines = source.content.split(/\r?\n/u);
  const findings = [];
  let occurrence = 0;

  function visit(node) {
    const manifestVersion =
      (source.path === 'package.json' || source.path.endsWith('/package.json')) &&
      node.parent !== undefined &&
      ts.isPropertyAssignment(node.parent) &&
      node.parent.name === node &&
      node.getText(sourceFile).replace(/["']/gu, '') === 'version' &&
      ts.isObjectLiteralExpression(node.parent.parent) &&
      ts.isExpressionStatement(node.parent.parent.parent);
    const value = manifestVersion ? undefined : tokenValue(node);
    const classification =
      value && classifyToken(value.token, value.isStringLiteral, value.counterLike);
    if (classification) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const context = normalizeContext(lines[line - 1] ?? '');
      findings.push(
        createFinding(
          source.path,
          classification.category,
          classification.token,
          line,
          context,
          occurrence,
        ),
      );
      occurrence += 1;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

function tokenValue(node) {
  if (ts.isIdentifier(node)) {
    return isAuditedIdentifier(node)
      ? {
          token: node.text,
          isStringLiteral: false,
          counterLike: isCounterLikeDeclaration(node),
        }
      : undefined;
  }
  if (ts.isStringLiteralLike(node)) {
    return isAuditedStringLiteral(node)
      ? { token: node.text, isStringLiteral: true, counterLike: false }
      : undefined;
  }
  if (
    node.kind === ts.SyntaxKind.TemplateHead ||
    node.kind === ts.SyntaxKind.TemplateMiddle ||
    node.kind === ts.SyntaxKind.TemplateTail
  ) {
    return { token: node.text, isStringLiteral: true, counterLike: false };
  }
  return undefined;
}

function isAuditedIdentifier(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isEnumMember(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isImportClause(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isExportSpecifier(parent) ||
      ts.isPropertyAssignment(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  return ts.isShorthandPropertyAssignment(parent) && parent.name === node;
}

function isAuditedStringLiteral(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isEnumMember(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  if (
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isExternalModuleReference(parent)
  ) {
    return true;
  }
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
  if (numericPathPattern.test(node.text)) return true;
  if (tableGenerationSqlPattern.test(node.text)) return true;
  return migrationPattern.test(node.text) && /^[A-Za-z0-9_./:@-]+$/u.test(node.text);
}

function isCounterLikeDeclaration(node) {
  const parent = node.parent;
  if (!parent) return false;
  if ('type' in parent && parent.type?.kind === ts.SyntaxKind.NumberKeyword) return true;
  if ('initializer' in parent && parent.initializer) {
    return (
      ts.isNumericLiteral(parent.initializer) ||
      ts.isPrefixUnaryExpression(parent.initializer) ||
      ts.isBinaryExpression(parent.initializer)
    );
  }
  return false;
}

function scriptKind(path) {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (path.endsWith('.json')) return ts.ScriptKind.JSON;
  if (/\.[cm]?js$/u.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isExternalHttpUrl(value) {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === 'http:' || url.protocol === 'https:';
}

function classifyToken(token, isStringLiteral, counterLike = false) {
  if (
    tableGenerationIdentifierPattern.test(token) ||
    tableGenerationPathPattern.test(token) ||
    tableGenerationSqlPattern.test(token)
  ) {
    return { category: 'versioned-table-generation', token };
  }
  if (versionFieldPattern.test(token) || camelVersionFieldPattern.test(token)) {
    return { category: 'internal-version-field', token };
  }
  const dataGenerationAlias =
    dataGenerationAliasPattern.test(token) || camelDataGenerationAliasPattern.test(token);
  const generationAlias = /generation$/iu.test(token);
  if (dataGenerationAlias && (!generationAlias || counterLike)) {
    return { category: 'data-generation-alias', token };
  }
  const migrationMatch = token.match(migrationPattern)?.[0];
  if (migrationMatch) {
    return { category: 'product-migration-or-compatibility', token: migrationMatch };
  }
  const multiPathClassification = classifyMultiPathMarker(token, isStringLiteral);
  if (multiPathClassification) return multiPathClassification;
  const numericPathMatch = isStringLiteral ? token.match(numericPathPattern)?.[0] : undefined;
  if (numericPathMatch && !isExternalHttpUrl(token)) {
    return { category: 'versioned-path-or-key', token: numericPathMatch };
  }
  const numericIdentifierMatch = token.match(numericIdentifierPattern)?.[0];
  if (numericIdentifierMatch) {
    return { category: 'versioned-identifier', token: numericIdentifierMatch };
  }
  return undefined;
}

function classifyPath(path) {
  const tableGenerationMatch = path.match(tableGenerationPathPattern)?.[0];
  if (tableGenerationMatch) {
    return { category: 'versioned-table-generation-path', token: tableGenerationMatch };
  }
  const migrationMatch = path.match(migrationPattern)?.[0];
  if (migrationMatch) {
    return { category: 'product-migration-or-compatibility-path', token: migrationMatch };
  }
  const multiPathClassification = classifyMultiPathMarker(path);
  if (multiPathClassification) {
    return {
      category: `${multiPathClassification.category}-path`,
      token: multiPathClassification.token,
    };
  }
  const numericPathMatch = path.match(numericPathPattern)?.[0];
  if (numericPathMatch && !isExternalHttpUrl(token)) {
    return { category: 'versioned-file-or-directory', token: numericPathMatch };
  }
  return undefined;
}

function classifyMultiPathMarker(token, requireExact = false) {
  const normalized = token
    .replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .replace(/[^a-z0-9]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();
  const automaticRepairMatch = normalized.match(automaticRepairPattern)?.[0];
  if (automaticRepairMatch) {
    const marker = automaticRepairMatch.replace(/^-+|-+$/gu, '');
    if (requireExact && normalized !== marker) return undefined;
    return { category: 'automatic-repair-or-rebuild', token: marker };
  }
  const parallelDataPathMatch = normalized.match(parallelDataPathPattern)?.[0];
  if (parallelDataPathMatch) {
    const marker = parallelDataPathMatch.replace(/^-+|-+$/gu, '');
    if (requireExact && normalized !== marker) return undefined;
    return { category: 'parallel-data-path', token: marker };
  }
  const alternateSuccessPathMatch = normalized.match(alternateSuccessPathPattern)?.[0];
  if (alternateSuccessPathMatch) {
    const marker = alternateSuccessPathMatch.replace(/^-+|-+$/gu, '');
    if (requireExact && normalized !== marker) return undefined;
    return { category: 'alternate-success-path', token: marker };
  }
  return undefined;
}

function createFinding(path, category, token, line, context, occurrence) {
  return { path, category, token, line, context, occurrence };
}

function assignStableIds(findings) {
  const duplicateCounts = new Map();
  return findings.sort(compareFindings).map(({ occurrence: _occurrence, ...finding }) => {
    const base = [finding.path, finding.category, finding.token, finding.context].join('\0');
    const duplicate = duplicateCounts.get(base) ?? 0;
    duplicateCounts.set(base, duplicate + 1);
    const id = createHash('sha256').update(`${base}\0${duplicate}`).digest('hex').slice(0, 20);
    return { id, ...finding };
  });
}

function compareFindings(left, right) {
  return (
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.occurrence - right.occurrence ||
    left.category.localeCompare(right.category) ||
    left.token.localeCompare(right.token)
  );
}

function normalizeContext(line) {
  const normalized = line.trim().replace(/\s+/gu, ' ');
  return normalized.length <= 320 ? normalized : `${normalized.slice(0, 317)}...`;
}

function discoverSources(root) {
  const files = [];
  walk(root, files);
  return files
    .map((path) => toRepositoryPath(root, path))
    .filter((path) => !exactExcludedFiles.has(path))
    .sort()
    .map((path) => ({ path, content: readFileSync(resolve(root, path), 'utf8') }));
}

function walk(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (isGeneratedDirectoryName(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path, files);
    } else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }
}

function toRepositoryPath(root, path) {
  return relative(root, path).split(sep).join('/');
}

function readJson(root, path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) throw new Error(`Required audit file is missing: ${path}`);
  return JSON.parse(readFileSync(absolute, 'utf8'));
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function main() {
  const args = process.argv.slice(2);
  for (const argument of args) {
    if (argument !== '--json') throw new Error(`Unknown audit argument: ${argument}`);
  }
  const report = buildAuditReport({
    findings: scanSources(discoverSources(repositoryRoot)),
    allowanceRegistry: readJson(repositoryRoot, allowancePath),
    domainAllowanceRegistry: readJson(repositoryRoot, domainAllowancePath),
    correctnessAllowanceRegistry: readJson(repositoryRoot, correctnessAllowancePath),
  });
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      `Internal contract audit ${report.status}: ${report.violations.length} unapproved occurrence(s).\n`,
    );
    for (const error of report.errors) process.stderr.write(`ERROR ${error}\n`);
    for (const finding of report.violations) {
      process.stderr.write(
        `${finding.path}:${finding.line} [${finding.category}] ${JSON.stringify(finding.token)} (${finding.id})\n`,
      );
    }
  }
  process.exitCode = report.status === 'failed' ? 1 : 0;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
