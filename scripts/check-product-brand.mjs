#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const canonicalProductName = 'OpenNeko';
const scannedExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.md',
  '.mjs',
  '.mts',
  '.proto',
  '.rs',
  '.sh',
  '.snap',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const excludedDirectoryNames = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'outputs',
  'reports',
  'target',
]);
const excludedPathPrefixes = [
  'openspec/changes/archive/',
  'openspec/changes/rename-product-to-openneko/',
];

const retiredBrandRules = [
  rule(['Neko', ' Suite'], canonicalProductName),
  rule(['Neko', ' for VSCode'], `${canonicalProductName} for VSCode`),
  rule(['Neko', ' Home'], `${canonicalProductName} Home`),
  rule(['Neko', ' TUI'], `${canonicalProductName} TUI`),
  rule(['Neko', ' AI Assistant'], `${canonicalProductName} AI Assistant`),
  rule(['Neko', ' AI'], `${canonicalProductName} AI`),
];

export function findProductBrandViolations(file, content) {
  const findings = [];
  const lines = content.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    const lineFindings = [];
    for (const brandRule of retiredBrandRules) {
      brandRule.pattern.lastIndex = 0;
      let match;
      while ((match = brandRule.pattern.exec(line)) !== null) {
        lineFindings.push({
          file: normalizePath(file),
          line: index + 1,
          column: match.index + 1,
          retired: brandRule.retired,
          replacement: brandRule.replacement,
        });
      }
    }
    lineFindings.sort(
      (left, right) => left.column - right.column || right.retired.length - left.retired.length,
    );
    let coveredUntil = 0;
    for (const finding of lineFindings) {
      const start = finding.column - 1;
      if (start < coveredUntil) continue;
      findings.push(finding);
      coveredUntil = start + finding.retired.length;
    }
  }
  return findings;
}

export function runProductBrandCheck(root = process.cwd()) {
  const findings = [];
  let checkedFiles = 0;
  for (const file of discoverScannedFiles(root)) {
    checkedFiles += 1;
    const relativeFile = normalizePath(relative(root, file));
    findings.push(...findProductBrandViolations(relativeFile, readFileSync(file, 'utf8')));
  }
  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    checkedFiles,
    findings,
  };
}

function rule(parts, replacement) {
  const retired = parts.join('');
  return {
    retired,
    replacement,
    pattern: new RegExp(`(?<!Open)${escapeRegExp(retired)}`, 'gu'),
  };
}

function* discoverScannedFiles(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && scannedExtensions.has(extname(entry.name))) {
      yield resolve(root, entry.name);
    }
  }
  for (const sourceRoot of [
    '.github',
    '.vscode',
    'apps',
    'docs',
    'openspec',
    'packages',
    'quality',
    'scripts',
  ]) {
    const absoluteRoot = resolve(root, sourceRoot);
    if (!existsSync(absoluteRoot)) continue;
    yield* walk(root, absoluteRoot);
  }
}

function* walk(root, directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relativePath = normalizePath(relative(root, path));
    if (entry.isDirectory()) {
      if (excludedDirectoryNames.has(entry.name) || isExcludedPath(relativePath)) continue;
      yield* walk(root, path);
      continue;
    }
    if (
      entry.isFile() &&
      scannedExtensions.has(extname(entry.name)) &&
      !isExcludedPath(relativePath)
    ) {
      yield path;
    }
  }
}

function isExcludedPath(path) {
  const normalizedPath = normalizePath(path);
  return excludedPathPrefixes.some((prefix) => normalizedPath.startsWith(prefix));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function printResult(result) {
  if (result.status === 'passed') {
    console.log(`Product brand validation: passed (${result.checkedFiles} files checked)`);
    return;
  }
  console.error('Product brand validation: failed');
  for (const finding of result.findings) {
    console.error(
      `- ${finding.file}:${finding.line}:${finding.column} uses "${finding.retired}"; use "${finding.replacement}".`,
    );
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryPath === fileURLToPath(import.meta.url)) {
  const result = runProductBrandCheck();
  printResult(result);
  if (result.status === 'failed') process.exitCode = 1;
}
