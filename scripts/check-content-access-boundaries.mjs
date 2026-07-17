#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const repoRoot = process.cwd();

const checkedRoots = [
  'packages/neko-types/src',
  'packages/neko-agent/packages/extension/src',
  'packages/neko-canvas/packages/extension/src',
  'packages/neko-cut/packages/extension/src',
  'packages/neko-preview/packages/extension/src',
  'packages/neko-assets/src',
  'packages/neko-tools/packages/extension/src',
];

const featurePackageRoots = [
  'packages/neko-agent/packages/extension/src',
  'packages/neko-canvas/packages/extension/src',
  'packages/neko-cut/packages/extension/src',
  'packages/neko-preview/packages/extension/src',
  'packages/neko-assets/src',
  'packages/neko-tools/packages/extension/src',
];

const blockedSymbols = [
  'HostContentAccessService',
  'HostContentIngestService',
  'VSCodeResourceCacheService',
  'ResourceCacheContentAccessProvider',
  'SourceFileContentAccessProvider',
  'DocumentEntryContentAccessProvider',
  'ExportStagingContentIngestProvider',
  'GeneratedOutputContentIngestProvider',
  'createDefaultLocalResourceAccessService',
];

const durableGeneratedCachePathPatterns = ['.neko/.cache/generated', '.neko/.cache/resources'];

const generatedCacheDiagnosticTestMarkers = [
  'rejects promoted generated outputs in cache scope',
  'generated-cache-source-not-durable',
  'ingest-cache-output',
];

const allowedFiles = new Set(['packages/neko-agent/packages/extension/src/__mocks__/vscode.ts']);

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  runCheck();
}

function runCheck() {
  const findings = [];
  let checkedFiles = 0;

  for (const root of checkedRoots) {
    for (const file of walk(resolve(repoRoot, root))) {
      const rel = normalizePath(relative(repoRoot, file));
      checkedFiles += 1;
      findings.push(...findViolations(rel, readFileSync(file, 'utf8')));
    }
  }

  const result = {
    status: findings.length > 0 ? 'failed' : 'passed',
    checkedFiles,
    blockedSymbols,
    findings,
  };

  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (findings.length > 0) {
    process.stderr.write(output);
    process.exit(1);
  }
  process.stdout.write(output);
}

function runSelfTest() {
  const cases = [
    {
      name: 'feature package direct shared cache service fails',
      file: 'packages/neko-canvas/packages/extension/src/editor/example.ts',
      content: "import { VSCodeResourceCacheService } from '@neko/shared/vscode/extension';\n",
      expectedSymbols: ['VSCodeResourceCacheService'],
    },
    {
      name: 'feature package shared runtime factory passes',
      file: 'packages/neko-canvas/packages/extension/src/editor/example.ts',
      content: "import { createHostContentAccessRuntime } from '@neko/shared/vscode/extension';\n",
      expectedSymbols: [],
    },
    {
      name: 'test file direct service mention passes',
      file: 'packages/neko-canvas/packages/extension/src/__tests__/protocol.test.ts',
      content: "expect(source).not.toContain('VSCodeResourceCacheService');\n",
      expectedSymbols: [],
    },
    {
      name: 'durable generated cache path fails',
      file: 'packages/neko-agent/packages/extension/src/generated.ts',
      content:
        "const asset = { kind: 'generated-asset', path: '.neko/.cache/generated/shot.png', promoted: true };\n",
      expectedSymbols: ['.neko/.cache/generated'],
    },
    {
      name: 'diagnostic generated cache test passes',
      file: 'packages/neko-types/src/types/__tests__/content-access.test.ts',
      content:
        "it('rejects promoted generated outputs in cache scope', () => { expect(code).toBe('ingest-cache-output'); const path = '.neko/.cache/generated/shot.png'; });\n",
      expectedSymbols: [],
    },
  ];

  const failures = [];
  for (const testCase of cases) {
    const findings = findViolations(testCase.file, testCase.content);
    const actualSymbols = findings.map((finding) => finding.symbol).sort();
    const expectedSymbols = [...testCase.expectedSymbols].sort();
    if (JSON.stringify(actualSymbols) !== JSON.stringify(expectedSymbols)) {
      failures.push({
        name: testCase.name,
        expectedSymbols,
        actualSymbols,
        findings,
      });
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`${JSON.stringify({ status: 'failed', failures }, null, 2)}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify({ status: 'passed', cases: cases.length }, null, 2)}\n`);
}

function findViolations(file, content) {
  const findings = [];
  if (!isTestFile(file) && isFeaturePackageFile(file)) {
    for (const symbol of blockedSymbols) {
      const index = content.indexOf(symbol);
      if (index < 0) continue;
      findings.push({
        ruleId: 'feature-packages-use-shared-content-runtime-factory',
        file,
        symbol,
        line: lineForIndex(content, index),
        message:
          'Feature packages must use createHostContentAccessRuntime and domain providers/adapters instead of directly assembling shared cache/content/projection services.',
      });
    }
  }
  findings.push(...findDurableGeneratedCachePathViolations(file, content));
  return findings;
}

function isFeaturePackageFile(file) {
  return featurePackageRoots.some((root) => file.startsWith(`${root}/`));
}

function findDurableGeneratedCachePathViolations(file, content) {
  if (isAllowedGeneratedCacheDiagnosticTest(file, content)) {
    return [];
  }
  const findings = [];
  for (const symbol of durableGeneratedCachePathPatterns) {
    let start = 0;
    while (start < content.length) {
      const index = content.indexOf(symbol, start);
      if (index < 0) break;
      start = index + symbol.length;
      const window = content.slice(Math.max(0, index - 400), Math.min(content.length, index + 400));
      if (!looksLikeDurableGeneratedIdentity(window)) continue;
      findings.push({
        ruleId: 'generated-assets-must-not-use-cache-paths-as-durable-identity',
        file,
        symbol,
        line: lineForIndex(content, index),
        message:
          'Generated assets retained by users must use promoted asset/generated refs outside .neko/.cache; cache paths are only allowed in migration or diagnostic tests.',
      });
    }
  }
  return findings;
}

function isAllowedGeneratedCacheDiagnosticTest(file, content) {
  if (!isTestFile(file)) return false;
  return generatedCacheDiagnosticTestMarkers.some((marker) => content.includes(marker));
}

function looksLikeDurableGeneratedIdentity(content) {
  return (
    /promoted\s*:\s*true/.test(content) ||
    /generatedAsset\s*[:=]/.test(content) ||
    /generatedMediaRefs\s*[:=]/.test(content) ||
    /generated-assets\//.test(content) ||
    /ContentGeneratedAssetSourceRef/.test(content)
  );
}

function* walk(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const abs = resolve(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(abs);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.[cm]?[tj]sx?$/.test(entry.name)) continue;
    if (statSync(abs).size > 2_000_000) continue;
    yield abs;
  }
}

function isTestFile(file) {
  return /(?:^|\/)__tests__\//.test(file) || /\.(?:test|spec)\.[cm]?[tj]sx?$/.test(file);
}

function lineForIndex(content, index) {
  return content.slice(0, index).split('\n').length;
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}
