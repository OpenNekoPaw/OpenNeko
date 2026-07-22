#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

const repoRoot = process.cwd();
const ledgerPath = 'quality/ledgers/code-debt-surface-ledger.json';

const terms = ['legacy', 'fallback', 'deprecated'];
const requiredSemanticClasses = [
  'delete-now',
  'migrate-now',
  'migration-only',
  'current-bridge',
  'runtime-resilience',
  'boundary-canonicalizer',
  'presentation-default',
  'domain-status',
  'generated-source',
  'test-only',
  'false-positive-word',
];
const allowedSemanticClasses = new Set([...requiredSemanticClasses, 'needs-review']);
const failingProductionSemanticClasses = new Set(['delete-now', 'migrate-now', 'needs-review']);
const retiredAssetCatalogBoundaryPathPatterns = [
  'packages/neko-agent/packages/extension/src/services/projectMentionSearch.ts',
  'packages/neko-types/src/local-metadata/node-workspace-storage-inspection.ts',
  'packages/neko-types/src/types/asset/workspace-linked-media-library.ts',
  'packages/neko-types/src/types/content-locator.ts',
];
const retiredAssetCatalogRules = [
  { id: 'catalog-type', pattern: /\b(?:AssetEntity|AssetVariant|AssetFile|AssetSource)\b/g },
  { id: 'catalog-api', pattern: /\b(?:ListAssets|GetAsset|ImportAsset)\b/g },
  { id: 'asset-uri', pattern: /project:\/\/assets\//g },
  { id: 'catalog-file', pattern: /neko\/assets\/library\.json/g },
  { id: 'search-partition', pattern: /['"]asset-library['"]/g },
  { id: 'picker-mode', pattern: /['"]asset-picker['"]/g },
];
const allowedStatuses = new Set(['active', 'planned', 'removed']);
const allowedActions = new Set([
  'delete',
  'migrate',
  'preserve',
  'rename',
  'defer',
  'model-entrypoint',
  'review',
]);
const requiredLedgerEntryFields = [
  'id',
  'package',
  'surface',
  'semanticClass',
  'action',
  'status',
  'owner',
  'replacement',
  'removeCondition',
  'validation',
];

const excludedDirectories = new Set([
  '.git',
  '.turbo',
  '.vscode-test',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'reports',
  'target',
]);
const includedExtensions = new Set(['.ts', '.tsx']);
const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  printHelp();
  process.exit(0);
}

if (args.has('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const packageRoots = collectPackageRoots();
const files = walkSourceFiles(repoRoot);
const matches = scanFiles(files);
const retiredAssetCatalogMatches = scanRetiredAssetCatalog(files);
const report = buildReport(matches, files, retiredAssetCatalogMatches);

if (args.has('--validate-ledger')) {
  const result = validateLedger(report);
  if (args.has('--json')) {
    console.log(JSON.stringify({ report, validation: result }, null, 2));
  } else {
    printValidation(result);
  }
  process.exitCode = result.errors.length > 0 || report.qualityGate.status === 'failed' ? 1 : 0;
} else {
  if (args.has('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }
  process.exitCode = report.qualityGate.status === 'failed' ? 1 : 0;
}

function printHelp() {
  console.log(`Usage: node scripts/check-legacy-debt-surfaces.mjs [--json] [--validate-ledger] [--self-test]

Scans TypeScript sources for legacy/fallback/deprecated cleanup surfaces.

Scopes:
  allSource      *.ts and *.tsx files, excluding generated build output directories
  nonTestSource  allSource minus __tests__, *.test.*, and *.spec.* files

Excluded directories:
  ${[...excludedDirectories].sort().join(', ')}
`);
}

function collectPackageRoots() {
  const roots = [];
  const packagesDir = resolve(repoRoot, 'packages');
  if (existsSync(packagesDir)) {
    for (const packageJsonPath of walkPackageJsonFiles(packagesDir)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        roots.push({
          dir: dirname(packageJsonPath),
          relDir: toRepoPath(dirname(packageJsonPath)),
          name: typeof pkg.name === 'string' ? pkg.name : toRepoPath(dirname(packageJsonPath)),
        });
      } catch {
        roots.push({
          dir: dirname(packageJsonPath),
          relDir: toRepoPath(dirname(packageJsonPath)),
          name: toRepoPath(dirname(packageJsonPath)),
        });
      }
    }
  }
  roots.sort((a, b) => b.relDir.length - a.relDir.length);
  return roots;
}

function walkPackageJsonFiles(root) {
  const results = [];
  for (const entry of safeReadDir(root)) {
    if (excludedDirectories.has(entry.name)) {
      continue;
    }
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkPackageJsonFiles(absolute));
    } else if (entry.isFile() && entry.name === 'package.json') {
      results.push(absolute);
    }
  }
  return results;
}

function walkSourceFiles(root) {
  const results = [];
  for (const entry of safeReadDir(root)) {
    if (excludedDirectories.has(entry.name)) {
      continue;
    }
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSourceFiles(absolute));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (includedExtensions.has(extname(entry.name))) {
      results.push(absolute);
    }
  }
  return results.sort((a, b) => toRepoPath(a).localeCompare(toRepoPath(b)));
}

function safeReadDir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function scanFiles(sourceFiles) {
  const results = [];
  const termPattern = new RegExp(terms.join('|'), 'gi');

  for (const file of sourceFiles) {
    const relPath = toRepoPath(file);
    let content = '';
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      termPattern.lastIndex = 0;
      let match = termPattern.exec(line);
      while (match !== null) {
        const term = match[0].toLowerCase();
        results.push({
          file: relPath,
          packageName: getPackageName(file),
          lineNumber: index + 1,
          term,
          text: line.trim(),
          isTest: isTestPath(relPath),
          semanticClass: classifySurface(relPath, line, term),
        });
        match = termPattern.exec(line);
      }
    }
  }

  return results;
}

function buildReport(allMatches, sourceFiles, catalogMatches) {
  const allFiles = sourceFiles.map(toRepoPath);
  const nonTestFiles = allFiles.filter((file) => !isTestPath(file));
  const nonTestMatches = allMatches.filter((match) => !match.isTest);

  return {
    generatedAt: new Date().toISOString(),
    scanner: {
      command: 'node scripts/check-legacy-debt-surfaces.mjs',
      terms,
      includedExtensions: [...includedExtensions].sort(),
      excludedDirectories: [...excludedDirectories].sort(),
      nonTestExclusions: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
      ],
      ledgerPath,
    },
    scopes: {
      allSource: summarizeScope(allMatches, allFiles),
      nonTestSource: summarizeScope(nonTestMatches, nonTestFiles),
    },
    semanticClasses: {
      allSource: summarizeSemanticClasses(allMatches),
      nonTestSource: summarizeSemanticClasses(nonTestMatches),
      nonAgentSource: summarizeSemanticClasses(
        nonTestMatches.filter((match) => !isAgentGovernedPath(match.file)),
      ),
    },
    retiredAssetCatalog: summarizeRetiredAssetCatalog(catalogMatches),
    qualityGate: buildQualityGate(nonTestMatches, catalogMatches),
    hotspots: {
      packages: topRows(
        groupMatches(nonTestMatches, (match) => match.packageName),
        20,
      ),
      files: topRows(
        groupMatches(nonTestMatches, (match) => match.file),
        40,
      ),
    },
    examples: representativeExamples(nonTestMatches, 30),
    needsReview: nonTestMatches
      .filter((match) => match.semanticClass === 'needs-review')
      .map(formatExample),
    cleanupCandidates: cleanupCandidates(nonTestMatches),
  };
}

function buildQualityGate(nonTestMatches, catalogMatches = []) {
  const governedMatches = nonTestMatches.filter((match) => !isAgentGovernedPath(match.file));
  const failingMatches = governedMatches.filter((match) =>
    failingProductionSemanticClasses.has(match.semanticClass),
  );
  const classes = {};
  for (const semanticClass of failingProductionSemanticClasses) {
    const matches = failingMatches.filter((match) => match.semanticClass === semanticClass);
    classes[semanticClass] = {
      occurrences: matches.length,
      files: new Set(matches.map((match) => match.file)).size,
      examples: matches.slice(0, 50).map(formatExample),
    };
  }

  const catalogViolations = catalogMatches.filter((match) => match.allowlist === undefined);

  return {
    scope: 'non-agent',
    excludedAgentOccurrences: nonTestMatches.length - governedMatches.length,
    status:
      failingMatches.length === 0 && catalogViolations.length === 0 ? 'passed' : 'failed',
    failingProductionSemanticClasses: [...failingProductionSemanticClasses].sort(),
    blockingOccurrences: failingMatches.length + catalogViolations.length,
    classes,
    retiredAssetCatalogViolations: {
      occurrences: catalogViolations.length,
      files: new Set(catalogViolations.map((match) => match.file)).size,
      examples: catalogViolations.slice(0, 50),
    },
  };
}

function scanRetiredAssetCatalog(sourceFiles) {
  const results = [];
  for (const file of sourceFiles) {
    const relPath = toRepoPath(file);
    let content = '';
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      for (const rule of retiredAssetCatalogRules) {
        rule.pattern.lastIndex = 0;
        let match = rule.pattern.exec(line);
        while (match !== null) {
          const allowlist = retiredAssetCatalogAllowlist(relPath);
          results.push({
            file: relPath,
            line: index + 1,
            rule: rule.id,
            text: line.trim(),
            ...(allowlist ? { allowlist } : {}),
          });
          match = rule.pattern.exec(line);
        }
      }
    }
  }
  return results;
}

function summarizeRetiredAssetCatalog(matches) {
  const violations = matches.filter((match) => match.allowlist === undefined);
  return {
    rules: retiredAssetCatalogRules.map((rule) => rule.id),
    allowlists: {
      migrationOnly: [],
      boundaryRejection: retiredAssetCatalogBoundaryPathPatterns,
      tests: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    },
    matches: matches.length,
    allowedMatches: matches.length - violations.length,
    violations,
  };
}

function retiredAssetCatalogAllowlist(file) {
  if (isTestPath(file)) return 'test-or-poison-fixture';
  if (retiredAssetCatalogBoundaryPathPatterns.some((pattern) => matchesGlob(file, pattern))) {
    return 'boundary-rejection';
  }
  return undefined;
}

function summarizeScope(scopeMatches, scopeFiles) {
  return {
    filesScanned: scopeFiles.length,
    filesWithMatches: new Set(scopeMatches.map((match) => match.file)).size,
    occurrences: scopeMatches.length,
    termCounts: countTerms(scopeMatches),
  };
}

function summarizeSemanticClasses(scopeMatches) {
  const classes = {};
  for (const semanticClass of [...requiredSemanticClasses, 'needs-review']) {
    classes[semanticClass] = {
      occurrences: 0,
      termCounts: emptyTermCounts(),
      files: 0,
      examples: [],
    };
  }

  const filesByClass = new Map();
  for (const match of scopeMatches) {
    const bucket = classes[match.semanticClass] ?? classes['needs-review'];
    bucket.occurrences += 1;
    bucket.termCounts[match.term] += 1;
    if (!filesByClass.has(match.semanticClass)) {
      filesByClass.set(match.semanticClass, new Set());
    }
    filesByClass.get(match.semanticClass).add(match.file);
    if (bucket.examples.length < 5) {
      bucket.examples.push(formatExample(match));
    }
  }

  for (const [semanticClass, files] of filesByClass.entries()) {
    classes[semanticClass].files = files.size;
  }

  return classes;
}

function groupMatches(scopeMatches, keyFn) {
  const groups = new Map();
  for (const match of scopeMatches) {
    const key = keyFn(match);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        occurrences: 0,
        termCounts: emptyTermCounts(),
        files: new Set(),
        semanticClasses: new Map(),
        examples: [],
      });
    }
    const group = groups.get(key);
    group.occurrences += 1;
    group.termCounts[match.term] += 1;
    group.files.add(match.file);
    group.semanticClasses.set(
      match.semanticClass,
      (group.semanticClasses.get(match.semanticClass) ?? 0) + 1,
    );
    if (group.examples.length < 3) {
      group.examples.push(formatExample(match));
    }
  }

  return [...groups.values()].map((group) => ({
    key: group.key,
    occurrences: group.occurrences,
    termCounts: group.termCounts,
    files: group.files.size,
    semanticClasses: Object.fromEntries(
      [...group.semanticClasses.entries()].sort((a, b) => b[1] - a[1]),
    ),
    examples: group.examples,
  }));
}

function topRows(rows, limit) {
  return rows
    .sort((a, b) => b.occurrences - a.occurrences || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function representativeExamples(scopeMatches, limit) {
  const examples = [];
  const seen = new Set();
  for (const match of scopeMatches) {
    const key = `${match.semanticClass}:${match.term}:${match.file}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    examples.push(formatExample(match));
    if (examples.length >= limit) {
      break;
    }
  }
  return examples;
}

function cleanupCandidates(scopeMatches) {
  const byFile = groupMatches(
    scopeMatches.filter((match) =>
      [
        'delete-now',
        'migrate-now',
        'boundary-canonicalizer',
        'presentation-default',
        'needs-review',
      ].includes(match.semanticClass),
    ),
    (match) => match.file,
  );
  return topRows(byFile, 30);
}

function countTerms(scopeMatches) {
  const counts = emptyTermCounts();
  for (const match of scopeMatches) {
    counts[match.term] += 1;
  }
  return counts;
}

function emptyTermCounts() {
  return Object.fromEntries(terms.map((term) => [term, 0]));
}

function formatExample(match) {
  return {
    file: match.file,
    line: match.lineNumber,
    term: match.term,
    semanticClass: match.semanticClass,
    text: match.text.length > 220 ? `${match.text.slice(0, 217)}...` : match.text,
  };
}

function classifySurface(file, line, term) {
  const lowerFile = file.toLowerCase();
  const lowerLine = line.toLowerCase();

  if (isTestPath(file)) {
    return 'test-only';
  }
  if (isGeneratedPath(file)) {
    return 'generated-source';
  }
  if (containsAny(lowerLine, ['false positive', 'knip', 'dynamic import']) && term !== 'fallback') {
    return 'false-positive-word';
  }
  if (
    containsAny(lowerFile, ['vitest.config.ts']) &&
    containsAny(lowerLine, ['deprecated task-manager'])
  ) {
    return 'false-positive-word';
  }
  if (isExplicitRejectionDiagnostic(lowerLine)) {
    return 'boundary-canonicalizer';
  }
  if (isDomainDeprecatedSurface(lowerFile, lowerLine, term)) {
    return 'domain-status';
  }
  if (term === 'fallback' && isDomainFallbackSurface(lowerFile, lowerLine)) {
    return 'domain-status';
  }
  if (isDeleteNowSurface(lowerFile, lowerLine)) {
    return 'delete-now';
  }
  if (isCurrentBridgeSurface(lowerFile, lowerLine)) {
    return 'current-bridge';
  }
  if (isBoundaryCanonicalizerSurface(lowerFile, lowerLine)) {
    return 'boundary-canonicalizer';
  }
  if (term === 'fallback' && isRuntimeResilienceSurface(lowerFile, lowerLine)) {
    return 'runtime-resilience';
  }
  if (term === 'fallback' && isBoundaryCanonicalizerSurface(lowerFile, lowerLine)) {
    return 'boundary-canonicalizer';
  }
  if (term === 'fallback' && isPresentationDefaultSurface(lowerFile, lowerLine)) {
    return 'presentation-default';
  }
  if (isMigrateNowSurface(lowerLine, term)) {
    return 'migrate-now';
  }

  return 'needs-review';
}

function isGeneratedPath(file) {
  return (
    file.includes('/generated/') ||
    file.endsWith('.engine.ts') ||
    file.includes('/proto/') ||
    file.includes('/__generated__/')
  );
}

function isDomainDeprecatedSurface(lowerFile, lowerLine, term) {
  if (
    term === 'fallback' &&
    (containsAny(lowerFile, ['representationresolver.ts', 'creative-entity-composition.ts']) ||
      containsAny(lowerLine, [
        'default_representation_fallbacks',
        'representationresolver',
        'representationresolveroptions',
        'resolvedkind',
        'fallbackorder',
        'createfallbackresolvedassetref',
      ]))
  ) {
    return true;
  }
  if (term !== 'deprecated') {
    return false;
  }
  return (
    containsAny(lowerFile, [
      '/market',
      '/entity',
      '/dashboard',
      'dashboard',
      'neko-entity',
      'creativeentityservice.ts',
      'execution-persona.ts',
    ]) ||
    containsAny(lowerLine, [
      'deprecated status',
      "status: 'deprecated'",
      '"deprecated"',
      "'deprecated'",
      'deprecated:',
    ])
  );
}

function isDomainFallbackSurface(lowerFile, lowerLine) {
  return (
    (containsAny(lowerFile, ['types/asset/classifier.ts']) &&
      containsAny(lowerLine, ["source?: 'llm' | 'fallback'", "source: 'fallback'"])) ||
    (containsAny(lowerFile, ['types/narrative-production-binding.ts']) &&
      containsAny(lowerLine, ["'fallback'", 'narrative_production_binding_roles']))
  );
}

function isDeleteNowSurface(lowerFile, lowerLine) {
  return (
    containsAny(lowerLine, [
      'delete-now',
      'dead code',
      'unused file',
      'remove this shim',
      're-export shim',
    ]) || lowerFile.endsWith('/components/content/index.ts')
  );
}

function isCurrentBridgeSurface(lowerFile, lowerLine) {
  return (
    containsAny(lowerFile, ['legacy-trace.ts']) ||
    containsAny(lowerFile, ['/bridge/', 'bridge.ts', 'adapter.ts', 'capabilityprovider.ts']) ||
    containsAny(lowerFile, [
      'ai-sdk/src/types.ts',
      'toolbootstrap.ts',
      'media-task-executor.ts',
      'stage-guardian.ts',
      'components/index.ts',
      'h264streamclient.ts',
    ]) ||
    containsAny(lowerFile, ['semanticcoveragetool.ts']) ||
    containsAny(lowerLine, [
      'bridge',
      'adapter',
      'compatibility adapter',
      'legacy bridge',
      'legacy adapter',
      'legacy trace',
      'legacytrace',
      'agentlegacycreationtrace',
      'legacy-trace',
      'provider resolver',
      'codec override',
      '@neko/shared/components',
      'legacycentralizedtoolregistrationmetadata',
      'legacy_centralized_tool_registration_metadata',
      'centralized tool registration',
    ])
  );
}

function isBoundaryCanonicalizerSurface(lowerFile, lowerLine) {
  return (
    containsAny(lowerFile, [
      'migrator',
      'migration.ts',
      'local-metadata-binding.ts',
      'normalization',
      'normalizer',
      'resource-cache-provider',
      'projectresolver.ts',
      'character-registry.ts',
      'types/canvas.ts',
      'canvaseditorprovider.ts',
      'engine/types.ts',
      'project-cache-search.ts',
      'reference-resolution.ts',
      'asset/market.ts',
      'canvas-layered.ts',
      'canvas-playback.ts',
      'creative-entity-asset-composition.ts',
      'types/skill.ts',
      'tool-planning.ts',
      'fieldbinding.ts',
      'canvas-semantic-storyboard.ts',
      'node-workspace-storage-inspection.ts',
      'node-workspace-resource-cache-binding.ts',
      'project-authoring/index.ts',
      'types/storage.ts',
      'local-metadata/migration-planner.ts',
      'nkc/validator.ts',
      'canvas-workspace-board.ts',
      'canvasdurableresourceidentity.ts',
      'content-access-runtime.ts',
      'resource-cache-service.ts',
      'types/media-quality.ts',
    ]) ||
    containsAny(lowerLine, [
      'allowfallback',
      'canonical',
      'canonicalize',
      'compat',
      'compatibility',
      'convert',
      'fallbackderived',
      'generatedasset',
      'generatedvideoasset',
      'legacy field',
      'migrat',
      'normalize',
      'old format',
      'older canvas files',
      'structured fallback sources',
      'allowedfallbacks',
      'fallback message',
      'fallback?:',
    ])
  );
}

function isRuntimeResilienceSurface(lowerFile, lowerLine) {
  return (
    containsAny(lowerFile, [
      'engineclient',
      'socket',
      'service',
      'provider',
      'runtime',
      'renderer',
      'reader',
      'summarizer',
      'conversation-compressor',
      'message-classifier',
      'experiment/',
      'presets.ts',
      'types.ts',
      'plan-parser',
      'stage-planner',
      'tier-resolver',
      'agent-session',
      'media-routing-manager',
      'media-file-downloader',
      'audiostreamclient',
      'fmp4streamclient',
      'market-client',
      'install-manager',
      'assetvariantdiffmessagehandler',
      'streamingcontroller',
      'credential-resolver',
      'core/config.ts',
      'platform-bootstrap.ts',
      'canvasgenerationhost.ts',
      'auth',
      'audiotempo.ts',
      'storyboardplanner',
      'subpackage-guard',
      'character-evidence.ts',
    ]) ||
    containsAny(lowerLine, [
      'catch',
      'cancel',
      'codec',
      'download',
      'error',
      'fail',
      'fallbackpolicy',
      'fallback-non-authoritative',
      'fallbackurl',
      'file',
      'generic fallback',
      'gpu',
      'hold-last-frame',
      'media',
      'missing',
      'model',
      'network',
      'native',
      'not available',
      'not found',
      'permission',
      'provider',
      'retry',
      'task-type hint',
      'sharp',
      'timeout',
      'unavailable',
      'wasm',
    ])
  );
}

function isPresentationDefaultSurface(lowerFile, lowerLine) {
  return (
    containsAny(lowerFile, ['error-boundary']) ||
    containsAny(lowerFile, ['webview', 'component', 'presenter', 'view', 'i18n']) ||
    containsAny(lowerFile, ['nodetypedescriptor.ts', 'types/animation.ts']) ||
    containsAny(lowerFile, [
      'types/generation.ts',
      'sketch-psd-blend-mode.ts',
      'storyboardexecutionsummary.ts',
      'number-input.tsx',
      'tabs.tsx',
      'markdown/highlighter.ts',
    ]) ||
    containsAny(lowerLine, [
      'className',
      'color',
      'default',
      'dimension',
      'display',
      'empty',
      'fallbacklabel',
      'fallbackvalue',
      'height',
      'label',
      'placeholder',
      'render',
      'text',
      'title',
      'terminal',
      'unicode',
      'unknown',
      'width',
    ])
  );
}

function isMigrateNowSurface(lowerLine, term) {
  if (term === 'deprecated') {
    return true;
  }
  return containsAny(lowerLine, ['alias', 'compat', 'legacy', 'migrat', 'old', '@deprecated']);
}

function isExplicitRejectionDiagnostic(lowerLine) {
  return containsAny(lowerLine, [
    'fallback is forbidden',
    'legacy-version',
    'legacy activation lifecycle is intentionally absent',
    'legacy code renderer tokens; removed',
    'legacy media path request',
    'legacy-perception-model-override-rejected',
    'path-only legacy requests are rejected',
    'legacy resourcecache manifest paths are retired',
  ]);
}

function containsAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function isTestPath(file) {
  return (
    file.includes('/__tests__/') ||
    file.includes('/__mocks__/') ||
    /\.(test|spec)\.tsx?$/.test(basename(file))
  );
}

function isAgentGovernedPath(file) {
  return file.startsWith('packages/neko-agent/') || file.startsWith('apps/neko-tui/');
}

function getPackageName(file) {
  const relFile = toRepoPath(file);
  for (const root of packageRoots) {
    if (relFile === root.relDir || relFile.startsWith(`${root.relDir}/`)) {
      return root.name;
    }
  }
  return 'repo-root';
}

function validateLedger(report) {
  const errors = [];
  const warnings = [];
  const absoluteLedgerPath = resolve(repoRoot, ledgerPath);

  if (!existsSync(absoluteLedgerPath)) {
    return {
      ledgerPath,
      errors: [`Missing cleanup ledger: ${ledgerPath}`],
      warnings,
      checkedEntries: 0,
    };
  }

  let ledger;
  try {
    ledger = JSON.parse(readFileSync(absoluteLedgerPath, 'utf8'));
  } catch (error) {
    return {
      ledgerPath,
      errors: [
        `Invalid JSON in ${ledgerPath}: ${error instanceof Error ? error.message : String(error)}`,
      ],
      warnings,
      checkedEntries: 0,
    };
  }

  validateLedgerRoot(ledger, errors);
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const entriesById = new Map();

  for (const entry of entries) {
    validateLedgerEntry(entry, errors, warnings);
    if (typeof entry?.id === 'string') {
      if (entriesById.has(entry.id)) {
        errors.push(`Duplicate ledger entry id: ${entry.id}`);
      }
      entriesById.set(entry.id, entry);
    }
  }

  validateRequiredCoverage(ledger, entriesById, report, errors, warnings);
  validateRemovedStalePatterns(entries, errors);
  addCoverageWarnings(report, entries, warnings);
  validateQualityGate(report, errors);

  return {
    ledgerPath,
    errors,
    warnings,
    checkedEntries: entries.length,
  };
}

function validateQualityGate(report, errors) {
  if (report.qualityGate.status !== 'failed') {
    return;
  }

  const summary = Object.entries(report.qualityGate.classes)
    .filter(([, row]) => row.occurrences > 0)
    .map(([semanticClass, row]) => `${semanticClass}=${row.occurrences}`)
    .join(', ');
  const catalogViolations = report.qualityGate.retiredAssetCatalogViolations.occurrences;
  errors.push(
    `Production unresolved legacy/fallback debt remains: ${summary || 'none'}; ` +
      `retired-asset-catalog=${catalogViolations}. ` +
      'Resolve, rename, or ledger-classify these surfaces before the gate can pass.',
  );
}

function validateLedgerRoot(ledger, errors) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    errors.push('Ledger root must be a JSON object.');
    return;
  }
  if (ledger.schemaVersion !== 1) {
    errors.push('Ledger schemaVersion must be 1.');
  }
  if (ledger.scope !== 'non-agent') {
    errors.push('Ledger scope must be "non-agent".');
  }
  if (
    !ledger.semanticClasses ||
    typeof ledger.semanticClasses !== 'object' ||
    Array.isArray(ledger.semanticClasses)
  ) {
    errors.push('Ledger semanticClasses must be an object.');
  } else {
    for (const semanticClass of requiredSemanticClasses) {
      if (!ledger.semanticClasses[semanticClass]) {
        errors.push(`Ledger semanticClasses is missing ${semanticClass}.`);
      }
    }
  }
  if (!Array.isArray(ledger.entries)) {
    errors.push('Ledger entries must be an array.');
  }
}

function validateLedgerEntry(entry, errors, warnings) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    errors.push('Ledger entry must be an object.');
    return;
  }

  const id = typeof entry.id === 'string' ? entry.id : '<missing-id>';
  for (const field of requiredLedgerEntryFields) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
      errors.push(`${id}: missing required field ${field}.`);
    }
  }

  if (!allowedSemanticClasses.has(entry.semanticClass)) {
    errors.push(`${id}: invalid semanticClass ${String(entry.semanticClass)}.`);
  }
  if (!allowedStatuses.has(entry.status)) {
    errors.push(`${id}: invalid status ${String(entry.status)}.`);
  }
  if (!allowedActions.has(entry.action)) {
    errors.push(`${id}: invalid action ${String(entry.action)}.`);
  }
  if (typeof entry.package === 'string' && entry.package.includes('neko-agent')) {
    errors.push(`${id}: non-Agent ledger must not own Agent package entries.`);
  }

  if (!Array.isArray(entry.paths) || entry.paths.length === 0) {
    errors.push(`${id}: paths must be a non-empty array.`);
  }

  if (
    !entry.validation ||
    !Array.isArray(entry.validation.commands) ||
    entry.validation.commands.length === 0
  ) {
    errors.push(`${id}: validation.commands must be a non-empty array.`);
  }

  if (entry.status === 'active' && entry.semanticClass !== 'runtime-resilience') {
    if (typeof entry.removeCondition !== 'string' || entry.removeCondition.trim().length < 8) {
      errors.push(`${id}: active non-resilience entry must have a specific removeCondition.`);
    }
  }

  for (const path of Array.isArray(entry.paths) ? entry.paths : []) {
    if (typeof path !== 'string') {
      errors.push(`${id}: every path must be a string.`);
      continue;
    }
    if (path.startsWith('packages/neko-agent/')) {
      errors.push(
        `${id}: Agent path belongs in agent-code-debt-lcd-register.json, not ${ledgerPath}.`,
      );
    }
    if (entry.status !== 'removed' && !path.includes('*') && !existsSync(resolve(repoRoot, path))) {
      warnings.push(`${id}: path does not currently exist: ${path}`);
    }
  }
}

function validateRequiredCoverage(ledger, entriesById, report, errors, warnings) {
  const requiredCoverage = Array.isArray(ledger.requiredCoverage) ? ledger.requiredCoverage : [];
  const nonTestFiles = new Set(collectFilesWithTermMatches(false));

  for (const coverage of requiredCoverage) {
    const id = coverage?.id ?? '<missing-coverage-id>';
    const entry = entriesById.get(coverage?.ledgerEntryId);
    if (!entry) {
      errors.push(
        `${id}: requiredCoverage references missing ledger entry ${String(coverage?.ledgerEntryId)}.`,
      );
      continue;
    }
    if (entry.status === 'removed' && coverage.allowRemovedEntry !== true) {
      errors.push(`${id}: requiredCoverage cannot point at removed ledger entry ${entry.id}.`);
    }
    if (typeof coverage.pathPattern !== 'string') {
      errors.push(`${id}: requiredCoverage.pathPattern must be a string.`);
      continue;
    }

    const matchedFiles = [...nonTestFiles].filter((file) =>
      matchesGlob(file, coverage.pathPattern),
    );
    if (
      coverage.requiredWhileMatched !== false &&
      matchedFiles.length === 0 &&
      !(entry.status === 'removed' && coverage.allowRemovedEntry === true)
    ) {
      warnings.push(
        `${id}: required coverage pattern currently has no matches: ${coverage.pathPattern}`,
      );
    }

    const entryPaths = Array.isArray(entry.paths) ? entry.paths : [];
    const covered = entryPaths.some(
      (path) => matchesGlob(coverage.pathPattern, path) || matchesGlob(path, coverage.pathPattern),
    );
    if (!covered) {
      errors.push(
        `${id}: ledger entry ${entry.id} does not list coverage path ${coverage.pathPattern}.`,
      );
    }
  }
}

function validateRemovedStalePatterns(entries, errors) {
  for (const entry of entries) {
    if (entry?.status !== 'removed') {
      continue;
    }
    for (const stalePattern of Array.isArray(entry.stalePatterns) ? entry.stalePatterns : []) {
      const pattern = stalePattern?.pattern;
      const paths = stalePattern?.paths;
      if (typeof pattern !== 'string' || !Array.isArray(paths) || paths.length === 0) {
        errors.push(`${entry.id}: removed entries with stalePatterns need pattern and paths.`);
        continue;
      }
      const regex = new RegExp(pattern, 'i');
      for (const pathPattern of paths) {
        for (const file of walkSourceFiles(repoRoot)) {
          const relFile = toRepoPath(file);
          if (!matchesGlob(relFile, pathPattern)) {
            continue;
          }
          const content = readFileSync(file, 'utf8');
          if (regex.test(content)) {
            errors.push(`${entry.id}: stale pattern ${pattern} still appears in ${relFile}.`);
          }
        }
      }
    }
  }
}

function collectFilesWithTermMatches(includeTests) {
  const matchedFiles = [];
  const termPattern = new RegExp(terms.join('|'), 'i');
  for (const file of walkSourceFiles(repoRoot)) {
    const relFile = toRepoPath(file);
    if (!includeTests && isTestPath(relFile)) {
      continue;
    }
    const content = readFileSync(file, 'utf8');
    if (termPattern.test(content)) {
      matchedFiles.push(relFile);
    }
  }
  return matchedFiles;
}

function addCoverageWarnings(report, entries, warnings) {
  const coveredPatterns = entries.flatMap((entry) =>
    Array.isArray(entry.paths) ? entry.paths : [],
  );
  for (const row of report.cleanupCandidates.slice(0, 12)) {
    if (isAgentGovernedPath(row.key)) {
      continue;
    }
    const covered = coveredPatterns.some((pattern) => matchesGlob(row.key, pattern));
    if (!covered && row.occurrences >= 10) {
      warnings.push(
        `High-volume cleanup candidate lacks ledger path coverage: ${row.key} (${row.occurrences})`,
      );
    }
  }
}

function matchesGlob(value, glob) {
  if (glob === value) {
    return true;
  }
  const regex = globToRegExp(glob);
  return regex.test(value);
}

function globToRegExp(glob) {
  let pattern = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === '*') {
      if (next === '*') {
        const afterDoubleStar = glob[index + 2];
        if (afterDoubleStar === '/') {
          pattern += '(?:.*/)?';
          index += 2;
        } else {
          pattern += '.*';
          index += 1;
        }
      } else {
        pattern += '[^/]*';
      }
      continue;
    }
    if ('\\^$+?.()|{}[]'.includes(char)) {
      pattern += `\\${char}`;
    } else {
      pattern += char;
    }
  }
  return new RegExp(`^${pattern}$`);
}

function printHumanReport(report) {
  console.log('Legacy debt surface scan');
  console.log('');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Terms: ${report.scanner.terms.join(', ')}`);
  console.log(`Extensions: ${report.scanner.includedExtensions.join(', ')}`);
  console.log(`Excluded directories: ${report.scanner.excludedDirectories.join(', ')}`);
  console.log(`Non-test exclusions: ${report.scanner.nonTestExclusions.join(', ')}`);
  console.log('');
  printScope('All source', report.scopes.allSource);
  printScope('Non-test source', report.scopes.nonTestSource);
  console.log('');
  printSemanticClassSummary(report.semanticClasses.nonTestSource);
  console.log('');
  printQualityGate(report.qualityGate);
  console.log(
    `Retired Asset catalog audit: ${report.retiredAssetCatalog.violations.length} violation(s), ` +
      `${report.retiredAssetCatalog.allowedMatches} allowlisted migration/rejection/test match(es)`,
  );
  console.log('');
  printHotspots('Top package hotspots', report.hotspots.packages, 12);
  console.log('');
  printHotspots('Top file hotspots', report.hotspots.files, 20);
  console.log('');
  console.log('Representative examples');
  for (const example of report.examples.slice(0, 12)) {
    console.log(
      `- ${example.file}:${example.line} [${example.semanticClass}/${example.term}] ${example.text}`,
    );
  }
}

function printQualityGate(qualityGate) {
  console.log(
    `Quality gate: ${qualityGate.status} ` +
      `(scope=${qualityGate.scope}; blocking=${qualityGate.blockingOccurrences}; ` +
      `excludedAgent=${qualityGate.excludedAgentOccurrences}; ` +
      `classes=${qualityGate.failingProductionSemanticClasses.join(', ')})`,
  );
  for (const [semanticClass, row] of Object.entries(qualityGate.classes)) {
    if (row.occurrences === 0) {
      continue;
    }
    console.log(`- ${semanticClass}: ${row.occurrences} occurrences in ${row.files} files`);
    for (const example of row.examples.slice(0, 3)) {
      console.log(`  ${example.file}:${example.line} ${example.text}`);
    }
  }
  const catalog = qualityGate.retiredAssetCatalogViolations;
  if (catalog.occurrences > 0) {
    console.log(`- retired-asset-catalog: ${catalog.occurrences} occurrences in ${catalog.files} files`);
    for (const example of catalog.examples.slice(0, 8)) {
      console.log(`  ${example.file}:${example.line} [${example.rule}] ${example.text}`);
    }
  }
}

function printScope(label, scope) {
  console.log(
    `${label}: ${scope.occurrences} occurrences in ${scope.filesWithMatches}/${scope.filesScanned} files`,
  );
  console.log(
    `  legacy=${scope.termCounts.legacy}, fallback=${scope.termCounts.fallback}, deprecated=${scope.termCounts.deprecated}`,
  );
}

function printSemanticClassSummary(classes) {
  console.log('Semantic classes (non-test source)');
  for (const semanticClass of [...requiredSemanticClasses, 'needs-review']) {
    const row = classes[semanticClass];
    console.log(
      `- ${semanticClass}: ${row.occurrences} occurrences, ${row.files} files ` +
        `(legacy=${row.termCounts.legacy}, fallback=${row.termCounts.fallback}, deprecated=${row.termCounts.deprecated})`,
    );
  }
}

function printHotspots(title, rows, limit) {
  console.log(title);
  for (const row of rows.slice(0, limit)) {
    console.log(
      `- ${row.key}: ${row.occurrences} ` +
        `(legacy=${row.termCounts.legacy}, fallback=${row.termCounts.fallback}, deprecated=${row.termCounts.deprecated})`,
    );
  }
}

function printValidation(result) {
  console.log(`Cleanup ledger validation: ${result.errors.length === 0 ? 'passed' : 'failed'}`);
  console.log(`Ledger: ${result.ledgerPath}`);
  console.log(`Entries checked: ${result.checkedEntries}`);
  if (result.errors.length > 0) {
    console.log('');
    console.log('Errors');
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
  }
  if (result.warnings.length > 0) {
    console.log('');
    console.log('Warnings');
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

function runSelfTest() {
  const cases = [
    {
      value: classifySurface(
        'packages/neko-types/src/generated/timeline.engine.ts',
        'legacy field',
        'legacy',
      ),
      expected: 'generated-source',
    },
    {
      value: classifySurface(
        'packages/neko-market/packages/core/src/status.ts',
        "status: 'deprecated'",
        'deprecated',
      ),
      expected: 'domain-status',
    },
    {
      value: classifySurface(
        'packages/neko-preview/packages/webview/src/Viewer.tsx',
        'const fallbackLabel = "Open";',
        'fallback',
      ),
      expected: 'presentation-default',
    },
    {
      value: classifySurface(
        'packages/neko-ui/src/error-boundary/index.tsx',
        'return this.props.fallback(fallbackProps);',
        'fallback',
      ),
      expected: 'presentation-default',
    },
    {
      value: classifySurface(
        'packages/neko-types/src/types/asset/classifier.ts',
        "source?: 'llm' | 'fallback';",
        'fallback',
      ),
      expected: 'domain-status',
    },
    {
      value: classifySurface(
        'packages/neko-types/src/types/narrative-production-binding.ts',
        "'fallback',",
        'fallback',
      ),
      expected: 'domain-status',
    },
    {
      value: classifySurface(
        'packages/neko-agent/packages/agent/src/skill/legacy-skill-migration.ts',
        "const LEGACY_MANIFEST_FILE = 'manifest.json';",
        'legacy',
      ),
      expected: 'boundary-canonicalizer',
    },
    {
      value: classifySurface(
        'apps/neko-tui/src/tui/host/tui-local-metadata-binding.ts',
        'legacyProxyRoot: storageLayout.project.local.cache.proxies,',
        'legacy',
      ),
      expected: 'boundary-canonicalizer',
    },
    {
      value: classifySurface(
        'packages/neko-client/src/EngineClient.ts',
        'fallback to cpu when gpu fails',
        'fallback',
      ),
      expected: 'runtime-resilience',
    },
    {
      value: classifySurface(
        'knip.config.ts',
        "'@img/sharp-wasm32', // Sharp WASM fallback",
        'fallback',
      ),
      expected: 'runtime-resilience',
    },
    {
      value: buildQualityGate([
        {
          file: 'packages/neko-client/src/EngineClient.ts',
          packageName: '@neko/client',
          lineNumber: 1,
          term: 'fallback',
          text: 'fallback to cpu when gpu fails',
          isTest: false,
          semanticClass: 'runtime-resilience',
        },
      ]).status,
      expected: 'passed',
    },
    {
      value: buildQualityGate([
        {
          file: 'packages/neko-types/src/project-file-io/save-session.ts',
          packageName: '@neko/shared',
          lineNumber: 1,
          term: 'fallback',
          text: 'readonly fallbackMessage: string;',
          isTest: false,
          semanticClass: 'needs-review',
        },
      ]).status,
      expected: 'failed',
    },
    {
      value: buildQualityGate([
        {
          file: 'packages/neko-agent/packages/agent/src/runtime.ts',
          packageName: '@neko/agent',
          lineNumber: 1,
          term: 'legacy',
          text: 'legacy runtime alias',
          isTest: false,
          semanticClass: 'migrate-now',
        },
      ]).status,
      expected: 'passed',
    },
    {
      value: classifySurface(
        'packages/neko-host/src/application.ts',
        'active-workspace fallback is forbidden.',
        'fallback',
      ),
      expected: 'boundary-canonicalizer',
    },
    {
      value: classifySurface(
        'packages/neko-canvas/packages/webview/src/components/content/creatorPresentation.ts',
        'referenceMedia: semanticRow.referenceMedia || summarizeLegacyReferenceMedia(data),',
        'legacy',
      ),
      expected: 'migrate-now',
    },
    {
      value: retiredAssetCatalogAllowlist('packages/neko-types/src/types/content-locator.ts'),
      expected: 'boundary-rejection',
    },
    {
      value: retiredAssetCatalogAllowlist(
        'packages/neko-canvas/packages/extension/src/runtime.ts',
      ),
      expected: undefined,
    },
    {
      value: matchesGlob(
        'packages/neko-types/src/types/storyboard-table.ts',
        'packages/neko-types/src/types/*.ts',
      ),
      expected: true,
    },
  ];

  const failures = cases.filter((testCase) => testCase.value !== testCase.expected);
  if (failures.length > 0) {
    console.error('Self-test failed');
    for (const failure of failures) {
      console.error(`Expected ${String(failure.expected)}, received ${String(failure.value)}`);
    }
    process.exit(1);
  }
  console.log(`Self-test passed (${cases.length} cases)`);
}

function toRepoPath(path) {
  return relative(repoRoot, path).split(sep).join('/');
}
