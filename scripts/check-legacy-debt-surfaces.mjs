#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

const repoRoot = process.cwd();
const terms = ['legacy', 'fallback', 'deprecated', 'compat', 'shim', 'upgrade'];
const requiredSemanticClasses = [
  'delete-now',
  'migrate-now',
  'migration-only',
  'current-bridge',
  'runtime-resilience',
  'boundary-canonicalizer',
  'presentation-default',
  'domain-status',
  'external-contract',
  'generated-source',
  'test-only',
  'false-positive-word',
];
const failingProductionSemanticClasses = new Set([
  'current-bridge',
  'delete-now',
  'migrate-now',
  'migration-only',
  'needs-review',
]);
const excludedDirectories = new Set([
  '.git',
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
const report = buildReport(matches, files);

if (args.has('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHumanReport(report);
}
process.exitCode = report.qualityGate.status === 'failed' ? 1 : 0;

function printHelp() {
  console.log(`Usage: node scripts/check-legacy-debt-surfaces.mjs [--json] [--self-test]

Scans TypeScript sources for legacy, fallback, deprecated, compatibility, and shim cleanup surfaces.

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

function buildReport(allMatches, sourceFiles) {
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
    qualityGate: buildQualityGate(nonTestMatches),
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

function buildQualityGate(nonTestMatches) {
  const governedMatches = nonTestMatches;
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

  return {
    scope: 'all-production',
    excludedAgentOccurrences: 0,
    status: failingMatches.length === 0 ? 'passed' : 'failed',
    failingProductionSemanticClasses: [...failingProductionSemanticClasses].sort(),
    blockingOccurrences: failingMatches.length,
    classes,
  };
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
  if (term === 'upgrade' && containsAny(lowerLine, ['knowledge upgrade', '知识升级'])) {
    return 'false-positive-word';
  }
  if (
    containsAny(lowerFile, ['vitest.config.ts']) &&
    containsAny(lowerLine, ['deprecated task-manager'])
  ) {
    return 'false-positive-word';
  }
  if (isExternalContractSurface(lowerFile, lowerLine, term)) {
    return 'external-contract';
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
    term === 'upgrade' &&
    lowerFile === 'packages/assets/domain/src/contracts/asset/manifest.ts' &&
    lowerLine.includes('upgradeto')
  ) {
    return true;
  }
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

function isExternalContractSurface(lowerFile, lowerLine, term) {
  if (term === 'shim') {
    return (
      lowerFile === 'apps/neko-desktop/vite.renderer.config.ts' &&
      lowerLine.includes('use-sync-external-store/shim/with-selector.js')
    );
  }
  if (term !== 'compat') return false;
  return (
    lowerFile === 'packages/generation/src/media/adapters/openai-compat-media-adapter.ts' ||
    (lowerFile === 'packages/generation/src/media/index.ts' &&
      containsAny(lowerLine, ['openaicompat', 'openai-compat', 'openai-compatible'])) ||
    (lowerFile === 'packages/agent/runtime/src/pi/capability-tool-bridge.ts' &&
      lowerLine.includes('openai_compatible_tool_name'))
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
      'asset/market.ts',
      'canvas-layered.ts',
      'canvas-playback.ts',
      'creative-entity-asset-composition.ts',
      'types/skill.ts',
      'tool-planning.ts',
      'fieldbinding.ts',
      'node-workspace-storage-inspection.ts',
      'node-workspace-resource-cache-binding.ts',
      'project-authoring/index.ts',
      'packages/local-metadata/src/storage.ts',
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
  return (
    file.startsWith('packages/neko-agent/') ||
    file.startsWith('packages/agent/runtime/') ||
    file.startsWith('packages/agent/contracts/') ||
    file.startsWith('packages/agent/webview/') ||
    file.startsWith('packages/ai/sdk/')
  );
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
  console.log('Canonical-path debt surface scan');
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
}

function printScope(label, scope) {
  console.log(
    `${label}: ${scope.occurrences} occurrences in ${scope.filesWithMatches}/${scope.filesScanned} files`,
  );
  console.log(`  ${formatTermCounts(scope.termCounts)}`);
}

function printSemanticClassSummary(classes) {
  console.log('Semantic classes (non-test source)');
  for (const semanticClass of [...requiredSemanticClasses, 'needs-review']) {
    const row = classes[semanticClass];
    console.log(
      `- ${semanticClass}: ${row.occurrences} occurrences, ${row.files} files ` +
        `(${formatTermCounts(row.termCounts)})`,
    );
  }
}

function printHotspots(title, rows, limit) {
  console.log(title);
  for (const row of rows.slice(0, limit)) {
    console.log(`- ${row.key}: ${row.occurrences} ` + `(${formatTermCounts(row.termCounts)})`);
  }
}

function formatTermCounts(termCounts) {
  return terms.map((term) => `${term}=${termCounts[term] ?? 0}`).join(', ');
}

function runSelfTest() {
  const cases = [
    {
      value: classifySurface(
        'packages/example/src/generated/output.ts',
        'const legacyValue = input;',
        'legacy',
      ),
      expected: 'generated-source',
    },
    {
      value: classifySurface(
        'packages/example/src/view.tsx',
        'return <Suspense fallback={null} />;',
        'fallback',
      ),
      expected: 'presentation-default',
    },
    {
      value: classifySurface(
        'packages/example/src/runtime.ts',
        'const legacyReader = createReader();',
        'legacy',
      ),
      expected: 'migrate-now',
    },
    {
      value: buildQualityGate([
        {
          file: 'packages/example/src/runtime.ts',
          packageName: '@neko/example',
          lineNumber: 1,
          term: 'legacy',
          text: 'const legacyReader = createReader();',
          isTest: false,
          semanticClass: 'migrate-now',
        },
      ]).status,
      expected: 'failed',
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
