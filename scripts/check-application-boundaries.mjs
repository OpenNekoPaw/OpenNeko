#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = process.cwd();
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const removedFeaturePackagePaths = [
  'packages/neko-audio',
  'packages/neko-auth',
  'packages/neko-dashboard',
  'packages/neko-live',
  'packages/neko-market',
  'packages/neko-model',
  'packages/neko-puppet',
  'packages/neko-sketch',
  'packages/neko-story',
];
const removedProductContractRules = [
  {
    file: 'packages/neko-agent/packages/agent-types/src/extension-command-contract.ts',
    tokens: ['NEKO_PUPPET_EXTENSION_ID'],
  },
  {
    file: 'packages/neko-agent/packages/agent-types/src/external-processor.ts',
    tokens: ["'market'", 'registerMarketExternalProcessorPackages'],
  },
  {
    file: 'packages/neko-agent/packages/agent/src/provider/provider-card-runtime.ts',
    tokens: ["layer: 'market'", 'marketRegistration', 'readonly market:'],
  },
  {
    file: 'packages/neko-client/src/index.ts',
    tokens: ['PuppetCommandAck', 'PuppetCommandEnvelope'],
  },
  {
    file: 'packages/neko-tools/package.json',
    tokens: [
      'neko-audio-file',
      'neko-sketch-file',
      'neko-puppet-file',
      'neko-model-file',
      '".nka"',
      '".nks"',
      '".nkp"',
      '".inp"',
      '".nkm"',
    ],
  },
  {
    file: 'packages/neko-tools/themes/neko-file-icon-theme.json',
    tokens: [
      '_neko_sketch',
      '_neko_puppet',
      '_neko_model',
      '_neko_story',
      '"nka"',
      '"nks"',
      '"nkp"',
      '"inp"',
      '"nkm"',
      '"fountain"',
      '"nekostory"',
    ],
  },
  {
    file: 'packages/neko-types/src/types/index.ts',
    tokens: [
      "'./live-compositor'",
      '"./live-compositor"',
      "'./model-agent-api'",
      '"./model-agent-api"',
      "'./model-ai-preview-scene-modes'",
      '"./model-ai-preview-scene-modes"',
      "'./scene'",
      '"./scene"',
      "'../generated/scene.engine'",
      '"../generated/scene.engine"',
    ],
  },
  {
    file: 'packages/neko-types/src/types/creative-entity-asset-composition.ts',
    tokens: [
      "export type AssetRefScheme = 'project' | 'market'",
      "export type RepresentationTarget = 'story'",
      "canvas: ['portrait', 'reference', 'puppet-bone'",
    ],
  },
  {
    file: 'packages/neko-engine/packages/host-cli/src/runner.rs',
    tokens: ['NkaLoader', 'run_nka_mix_export'],
  },
  {
    file: 'packages/neko-types/src/types/extension-api.ts',
    tokens: [
      'NekoAudioAPI',
      'NekoModelAPI',
      'NekoPuppetAPI',
      'NekoSketchAPI',
      "'neko.neko-auth'",
      "'neko.neko-model'",
      "'neko.neko-puppet'",
      "'neko.neko-sketch'",
      "'neko.neko-story'",
    ],
  },
  {
    file: 'packages/neko-types/src/types/tool-names.ts',
    tokens: [
      'TOOL_NAMES_AUDIO',
      'TOOL_NAMES_MODEL',
      'TOOL_NAMES_PUPPET',
      'TOOL_NAMES_SKETCH',
      'TOOL_NAMES_STORY',
    ],
  },
  {
    file: 'quality/coverage-baseline.json',
    tokens: [
      'dashboardWorkItemSource',
      'packages/neko-entity/src/dashboard/',
      '"owner": "packages/neko-live',
      '"owner": "packages/neko-market',
      '"owner": "packages/neko-model',
      '"owner": "packages/neko-puppet',
      '"owner": "packages/neko-sketch',
      '"owner": "packages/neko-story',
    ],
  },
  {
    file: '.dependency-cruiser.cjs',
    tokens: [
      'packages/neko-auth/packages/core',
      'packages/neko-market',
      'packages/neko-model',
      'packages/neko-audio',
      'packages/neko-live',
    ],
  },
  {
    file: 'packages/neko-engine/README.md',
    tokens: ['runtime-scene', 'runtime-puppet', 'runtime-device', 'runtime-ml'],
  },
  {
    file: 'packages/neko-engine/ARCHITECTURE.md',
    tokens: ['runtime-scene', 'runtime-puppet', 'runtime-device', 'runtime-ml'],
  },
];
const removedProductContractFiles = [
  'packages/neko-types/src/types/live-compositor.ts',
  'packages/neko-types/src/types/__tests__/live-compositor-contract.test.ts',
  'packages/neko-types/src/types/__fixtures__/live-compositor-scene-v1.json',
  'packages/neko-types/src/types/model-agent-api.ts',
  'packages/neko-types/src/types/model-ai-preview-scene-modes.ts',
  'packages/neko-types/src/types/__tests__/model-agent-api-contract.test.ts',
  'packages/neko-types/src/types/__tests__/model-ai-preview-scene-modes-contract.test.ts',
  'packages/neko-types/src/types/__tests__/puppet-agent-tool-contract.test.ts',
  'packages/neko-types/src/types/__fixtures__/model-ai-preview-scene-modes-v1.json',
  'packages/neko-proto/scene.proto',
  'packages/neko-types/src/generated/scene.engine.ts',
  'packages/neko-types/src/generated/__tests__/scene-contract.test.ts',
  'packages/neko-types/src/generated/__fixtures__/scene-character-v0.json',
  'packages/neko-types/src/generated/__fixtures__/scene-contract-v1.json',
  'packages/neko-types/src/types/scene.ts',
  'packages/neko-types/src/types/viewport-protocol.ts',
  'packages/neko-types/src/types/audioProject.ts',
  'packages/neko-types/src/types/audioProtocol.ts',
  'packages/neko-types/src/types/auth.ts',
  'packages/neko-types/src/types/puppet.ts',
  'packages/neko-types/src/types/sketch.ts',
  'packages/neko-types/src/types/model-project.ts',
  'packages/neko-types/src/types/asset/market.ts',
  'packages/neko-types/src/nka/index.ts',
  'packages/neko-types/src/nks/index.ts',
  'packages/neko-types/src/vscode/extension/templates/glb-template.ts',
  'packages/neko-engine/packages/host-cli/src/nka_loader.rs',
  'packages/neko-entity/src/providers/story.ts',
  'packages/neko-ui/src/viewport/index.ts',
  'packages/neko-assets/src/market/VoicePackInstallTarget.ts',
  'packages/neko-preview/packages/extension/src/providers/model/modelPreviewProtocol.ts',
  'packages/neko-tools/themes/icons/file-model.svg',
  'packages/neko-tools/themes/icons/file-puppet.svg',
  'packages/neko-tools/themes/icons/file-sketch.svg',
  'packages/neko-tools/themes/icons/file-story.svg',
];

export function findApplicationBoundaryViolations(file, content) {
  const normalizedFile = normalizePath(file);
  const findings = [];
  const imports = collectStaticModuleSpecifiers(content);

  for (const specifier of imports) {
    if (specifier === '@neko/cli' || specifier.startsWith('@neko/cli/')) {
      findings.push({
        ruleId: 'retired-tui-package-import-must-not-exist',
        file: normalizedFile,
        specifier,
        message: 'OpenNeko TUI source is owned by apps/neko-tui; @neko/cli is retired.',
      });
    }

    if (normalizedFile.startsWith('packages/') && reachesApplication(specifier)) {
      findings.push({
        ruleId: 'packages-must-not-depend-on-applications',
        file: normalizedFile,
        specifier,
        message: 'Reusable packages must not import application composition roots.',
      });
    }

    if (!normalizedFile.startsWith('apps/')) continue;
    if (reachesPackageByRelativePath(specifier)) {
      findings.push({
        ruleId: 'applications-use-public-package-entries',
        file: normalizedFile,
        specifier,
        message:
          'Applications must use package exports instead of relative imports into packages/.',
      });
    }
    if (isInternalPackageSpecifier(specifier)) {
      findings.push({
        ruleId: 'applications-must-not-import-feature-internals',
        file: normalizedFile,
        specifier,
        message:
          'Applications must consume documented public package entries, not src/internal paths.',
      });
    }
    if (reachesAnotherApplication(normalizedFile, specifier)) {
      findings.push({
        ruleId: 'applications-must-not-import-other-applications',
        file: normalizedFile,
        specifier,
        message:
          'Application composition roots must communicate through shared contracts, not imports.',
      });
    }
  }

  return findings;
}

export function runApplicationBoundaryCheck(root = repoRoot) {
  const findings = [];
  let checkedFiles = 0;
  for (const sourceRoot of ['apps', 'packages']) {
    const absoluteRoot = resolve(root, sourceRoot);
    if (!existsSync(absoluteRoot)) continue;
    for (const file of walk(absoluteRoot)) {
      checkedFiles += 1;
      const relativeFile = normalizePath(relative(root, file));
      findings.push(...findApplicationBoundaryViolations(relativeFile, readFileSync(file, 'utf8')));
    }
  }
  findings.push(...findRetiredProductSurfaceViolations(discoverProductSurfaces(root)));
  return { status: findings.length === 0 ? 'passed' : 'failed', checkedFiles, findings };
}

export function findRetiredProductSurfaceViolations(snapshot) {
  const findings = [];
  if (snapshot.directories.includes('packages/neko-desktop')) {
    findings.push({
      ruleId: 'retired-desktop-package-must-not-exist',
      file: 'packages/neko-desktop',
      message: 'The retired Desktop product package must not be restored.',
    });
  }
  if (snapshot.directories.includes('packages/neko-suite')) {
    findings.push({
      ruleId: 'retired-vscode-product-package-must-not-exist',
      file: 'packages/neko-suite',
      message: 'The OpenNeko for VSCode product must be owned only by apps/neko-vscode.',
    });
  }
  if (snapshot.directories.includes('packages/neko-agent/packages/cli-tui')) {
    findings.push({
      ruleId: 'retired-tui-package-must-not-exist',
      file: 'packages/neko-agent/packages/cli-tui',
      message: 'The complete OpenNeko TUI host composition must be owned by apps/neko-tui.',
    });
  }
  if (snapshot.files?.includes('packages/neko-agent/neko')) {
    findings.push({
      ruleId: 'retired-agent-package-executable-must-not-exist',
      file: 'packages/neko-agent/neko',
      message: 'The TUI executable must be built only by apps/neko-tui.',
    });
  }
  for (const manifest of snapshot.retiredTuiDependencies ?? []) {
    findings.push({
      ruleId: 'retired-tui-package-dependency-must-not-exist',
      file: manifest,
      specifier: '@neko/cli',
      message: 'Workspace manifests must depend on public Agent/runtime owners, not @neko/cli.',
    });
  }
  if (snapshot.directories.includes('apps/neko-studio')) {
    findings.push({
      ruleId: 'studio-must-not-be-productized',
      file: 'apps/neko-studio',
      message: 'A Studio product requires a separate accepted OpenSpec change.',
    });
  }
  for (const script of snapshot.rootScripts) {
    if (/(?:^|:)desktop(?::|$)/u.test(script)) {
      findings.push({
        ruleId: 'retired-desktop-script-must-not-exist',
        file: 'package.json',
        specifier: script,
        message: 'Root scripts must not expose the retired Desktop product.',
      });
    }
  }
  for (const scenario of snapshot.functionalScenarios) {
    if (scenario.startsWith('desktop/')) {
      findings.push({
        ruleId: 'retired-desktop-scenario-must-not-exist',
        file: `scripts/webview-functional/scenarios/${scenario}`,
        message: 'Functional scenarios must not retain the retired Desktop product owner.',
      });
    }
  }
  for (const directory of snapshot.removedFeaturePackages ?? []) {
    findings.push({
      ruleId: 'removed-feature-package-must-not-exist',
      file: directory,
      message: 'A package outside the retained OpenNeko product set must not be restored.',
    });
  }
  for (const violation of snapshot.removedProductContracts ?? []) {
    findings.push({
      ruleId: 'removed-product-contract-must-not-return',
      file: violation.file,
      specifier: violation.token,
      message:
        'A deleted product contract, manifest association, or stale ownership entry returned.',
    });
  }
  return findings;
}

function discoverProductSurfaces(root) {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const scenarioRoot = resolve(root, 'scripts/webview-functional/scenarios');
  return {
    directories: [
      'packages/neko-desktop',
      'packages/neko-suite',
      'packages/neko-agent/packages/cli-tui',
      'apps/neko-studio',
    ].filter((path) => existsSync(resolve(root, path))),
    files: ['packages/neko-agent/neko'].filter((path) => existsSync(resolve(root, path))),
    retiredTuiDependencies: findDependencyManifests(root, '@neko/cli'),
    rootScripts: Object.keys(packageJson.scripts ?? {}),
    functionalScenarios: existsSync(scenarioRoot)
      ? [...walkScenarioFiles(scenarioRoot)].map((path) =>
          normalizePath(relative(scenarioRoot, path)),
        )
      : [],
    removedFeaturePackages: removedFeaturePackagePaths.filter((path) =>
      existsSync(resolve(root, path)),
    ),
    removedProductContracts: discoverRemovedProductContracts(root),
  };
}

function discoverRemovedProductContracts(root) {
  const violations = [];
  for (const rule of removedProductContractRules) {
    const absolutePath = resolve(root, rule.file);
    if (!existsSync(absolutePath)) continue;
    const content = readFileSync(absolutePath, 'utf8');
    for (const token of rule.tokens) {
      if (content.includes(token)) violations.push({ file: rule.file, token });
    }
  }
  for (const file of removedProductContractFiles) {
    if (existsSync(resolve(root, file))) violations.push({ file, token: '<file-exists>' });
  }
  return violations;
}

function findDependencyManifests(root, dependencyName) {
  const manifests = [];
  for (const sourceRoot of ['apps', 'packages']) {
    const absoluteRoot = resolve(root, sourceRoot);
    if (!existsSync(absoluteRoot)) continue;
    for (const manifestPath of walkPackageManifests(absoluteRoot)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const dependencyMaps = [
        manifest.dependencies,
        manifest.devDependencies,
        manifest.optionalDependencies,
        manifest.peerDependencies,
      ];
      if (dependencyMaps.some((dependencies) => dependencies?.[dependencyName])) {
        manifests.push(normalizePath(relative(root, manifestPath)));
      }
    }
  }
  return manifests.sort();
}

function* walkPackageManifests(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage')
      continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkPackageManifests(path);
    } else if (entry.isFile() && entry.name === 'package.json') {
      yield path;
    }
  }
}

function* walkScenarioFiles(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkScenarioFiles(path);
    } else if (entry.isFile() && entry.name.endsWith('.scenario.json')) {
      yield path;
    }
  }
}

function collectStaticModuleSpecifiers(content) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/gu,
    /\bexport\s+(?:type\s+)?[^'";]+?\s+from\s+["']([^"']+)["']/gu,
    /\bimport\(\s*["']([^"']+)["']\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) specifiers.push(specifier);
    }
  }
  return specifiers;
}

function reachesApplication(specifier) {
  return /(?:^|\/)apps\/(?:neko-[^/]+)(?:\/|$)/u.test(specifier);
}

function reachesPackageByRelativePath(specifier) {
  return specifier.startsWith('.') && /(?:^|\/)packages\//u.test(specifier);
}

function isInternalPackageSpecifier(specifier) {
  if (!specifier.startsWith('@neko') && !specifier.startsWith('neko-')) return false;
  return /(?:^|\/)src(?:\/|$)|(?:^|\/)internal(?:\/|$)|\/packages\/[^/]+\/(?:src|internal)(?:\/|$)/u.test(
    specifier,
  );
}

function reachesAnotherApplication(file, specifier) {
  if (!specifier.startsWith('.')) return false;
  const [, currentApp] = file.split('/');
  const match = specifier.match(/(?:^|\/)apps\/(neko-[^/]+)(?:\/|$)/u);
  return Boolean(match?.[1] && match[1] !== currentApp);
}

function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage')
      continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
      continue;
    }
    if (sourceExtensions.has(extensionOf(entry.name))) yield path;
  }
}

function extensionOf(file) {
  const index = file.lastIndexOf('.');
  return index < 0 ? '' : file.slice(index);
}

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function runSelfTest() {
  const cases = [
    {
      name: 'application public package import passes',
      file: 'apps/neko-vscode/src/main.ts',
      content: "import { createHost } from '@neko/host';\n",
      expected: [],
    },
    {
      name: 'application relative package import fails',
      file: 'apps/neko-vscode/src/main.ts',
      content: "import { x } from '../../../packages/neko-agent/src/x';\n",
      expected: ['applications-use-public-package-entries'],
    },
    {
      name: 'application internal package import fails',
      file: 'apps/neko-vscode/src/main.ts',
      content: "import { x } from '@neko-agent/webview/src/internal';\n",
      expected: ['applications-must-not-import-feature-internals'],
    },
    {
      name: 'package application import fails',
      file: 'packages/neko-host/src/index.ts',
      content: "export { start } from '../../../apps/neko-vscode/src/main';\n",
      expected: ['packages-must-not-depend-on-applications'],
    },
    {
      name: 'application cross import fails',
      file: 'apps/neko-vscode/src/main.ts',
      content: "import { start } from '../../apps/neko-tui/src/main';\n",
      expected: ['applications-must-not-import-other-applications'],
    },
    {
      name: 'retired tui package import fails',
      file: 'apps/neko-tui/src/main.ts',
      content: "import { run } from '@neko/cli/terminal';\n",
      expected: ['retired-tui-package-import-must-not-exist'],
    },
  ];
  const failures = [];
  for (const testCase of cases) {
    const actual = findApplicationBoundaryViolations(testCase.file, testCase.content).map(
      (finding) => finding.ruleId,
    );
    if (JSON.stringify(actual) !== JSON.stringify(testCase.expected)) {
      failures.push({ name: testCase.name, expected: testCase.expected, actual });
    }
  }
  const retiredProductFindings = findRetiredProductSurfaceViolations({
    directories: [
      'packages/neko-desktop',
      'packages/neko-suite',
      'packages/neko-agent/packages/cli-tui',
      'apps/neko-studio',
    ],
    files: ['packages/neko-agent/neko'],
    retiredTuiDependencies: ['apps/legacy/package.json'],
    rootScripts: ['build:desktop', 'test'],
    functionalScenarios: ['desktop/startup.p0.scenario.json', 'home/startup.p0.scenario.json'],
    removedFeaturePackages: ['packages/neko-model'],
    removedProductContracts: [
      {
        file: 'packages/neko-client/src/index.ts',
        token: 'PuppetCommandEnvelope',
      },
    ],
  }).map((finding) => finding.ruleId);
  const expectedRetiredProductFindings = [
    'retired-desktop-package-must-not-exist',
    'retired-vscode-product-package-must-not-exist',
    'retired-tui-package-must-not-exist',
    'retired-agent-package-executable-must-not-exist',
    'retired-tui-package-dependency-must-not-exist',
    'studio-must-not-be-productized',
    'retired-desktop-script-must-not-exist',
    'retired-desktop-scenario-must-not-exist',
    'removed-feature-package-must-not-exist',
    'removed-product-contract-must-not-return',
  ];
  if (JSON.stringify(retiredProductFindings) !== JSON.stringify(expectedRetiredProductFindings)) {
    failures.push({
      name: 'retired product surfaces fail',
      expected: expectedRetiredProductFindings,
      actual: retiredProductFindings,
    });
  }
  return { status: failures.length === 0 ? 'passed' : 'failed', cases: cases.length + 1, failures };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = process.argv.includes('--self-test')
    ? runSelfTest()
    : runApplicationBoundaryCheck();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
