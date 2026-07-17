#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_THRESHOLDS = Object.freeze({
  lines: 30,
  branches: 20,
  functions: 25,
  statements: 30,
});

export async function collectCoverageBaseline(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const ownership =
    options.ownership ??
    JSON.parse(await readFile(join(root, 'quality/test-ownership.json'), 'utf8'));
  if (ownership.schemaVersion !== 'neko.test-ownership.v1') {
    throw new Error('quality/test-ownership.json has an unknown schemaVersion');
  }
  const owners = [
    ...new Set(
      ownership.workspaces
        .filter((entry) => entry.mode !== 'alternative')
        .map((entry) => entry.owner),
    ),
  ].sort();
  const results = [];
  for (const owner of owners) {
    const summaryPath = join(root, owner, 'coverage/coverage-summary.json');
    let summary;
    try {
      summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    } catch (error) {
      throw new Error(`Coverage summary is missing or invalid for ${owner}: ${summaryPath}`, {
        cause: error,
      });
    }
    results.push(projectOwnerCoverage(root, owner, summary));
  }
  return {
    schemaVersion: 'neko.coverage-baseline.v1',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    command: 'pnpm test:coverage',
    defaultThresholds: DEFAULT_THRESHOLDS,
    ownerCount: results.length,
    ownersBelowDefault: results.filter((entry) => entry.belowDefault.length > 0).length,
    zeroCoveredSourceFileCount: results.reduce(
      (count, entry) => count + entry.zeroCoveredSourceFiles.length,
      0,
    ),
    owners: results,
  };
}

function projectOwnerCoverage(root, owner, summary) {
  const total = requireCoverageTotal(summary, owner);
  const metrics = Object.fromEntries(
    Object.keys(DEFAULT_THRESHOLDS).map((metric) => [metric, total[metric].pct]),
  );
  const belowDefault = Object.entries(DEFAULT_THRESHOLDS)
    .filter(([metric, threshold]) => metrics[metric] < threshold)
    .map(([metric]) => metric);
  const zeroCoveredSourceFiles = Object.entries(summary)
    .filter(([path, coverage]) => {
      return path !== 'total' && coverage?.lines?.total > 0 && coverage.lines.covered === 0;
    })
    .map(([path]) => normalizeSourcePath(root, path))
    .sort();
  return {
    owner,
    metrics,
    belowDefault,
    zeroCoveredSourceFiles,
    closingCondition:
      belowDefault.length === 0 && zeroCoveredSourceFiles.length === 0
        ? null
        : 'Add package-owned tests for uncovered production paths and raise the owner threshold without reducing coverage include.',
  };
}

function requireCoverageTotal(summary, owner) {
  if (!summary?.total) {
    throw new Error(`Coverage summary for ${owner} has no total record`);
  }
  for (const metric of Object.keys(DEFAULT_THRESHOLDS)) {
    if (typeof summary.total[metric]?.pct !== 'number') {
      throw new Error(`Coverage summary for ${owner} has no numeric total.${metric}.pct`);
    }
  }
  return summary.total;
}

function normalizeSourcePath(root, path) {
  const absolutePath = isAbsolute(path) ? path : resolve(root, path);
  const relativePath = relative(root, absolutePath);
  if (relativePath.startsWith('..')) {
    throw new Error(`Coverage source path escapes repository root: ${path}`);
  }
  return relativePath.replaceAll('\\', '/');
}

async function main() {
  const outputIndex = process.argv.indexOf('--output');
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && (!outputPath || outputPath.startsWith('--'))) {
    throw new Error('--output requires a repository-relative path');
  }
  const baseline = await collectCoverageBaseline();
  const content = `${JSON.stringify(baseline, null, 2)}\n`;
  if (!outputPath) {
    process.stdout.write(content);
    return;
  }
  const absoluteOutput = resolve(repoRoot, outputPath);
  const relativeOutput = relative(repoRoot, absoluteOutput);
  if (relativeOutput.startsWith('..')) {
    throw new Error(`Coverage baseline output escapes repository root: ${outputPath}`);
  }
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, content, 'utf8');
  process.stdout.write(`${relativeOutput.replaceAll('\\', '/')}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
