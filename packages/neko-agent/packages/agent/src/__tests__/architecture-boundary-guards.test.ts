import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const workspaceRoot = resolve(repoRoot, '../..');
const agentSrc = join(repoRoot, 'packages/agent/src');
const packageRoot = join(repoRoot, 'packages');
const webviewSrc = join(packageRoot, 'webview/src');
const extensionSrc = join(packageRoot, 'extension/src');
const platformSrc = join(packageRoot, 'platform/src');
const tuiSrc = join(workspaceRoot, 'apps/neko-tui/src/tui');
const agentTypesSrc = join(packageRoot, 'agent-types/src');
const testUtilsSrc = join(repoRoot, 'test-utils/src');

function hasQuotedIdentity(source: string, identity: string): boolean {
  const escaped = identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`['"\`]${escaped}['"\`]`).test(source);
}

describe('agent architecture boundary guards', () => {
  it('keeps the replaced Platform chat stack physically absent', () => {
    for (const removedPath of [
      'service/service.ts',
      'service/shared-service-adapter.ts',
      'provider/provider-registry.ts',
    ]) {
      expect(existsSync(join(platformSrc, removedPath))).toBe(false);
    }
    for (const removedDirectory of ['llm', 'perception']) {
      const directory = join(platformSrc, removedDirectory);
      expect(existsSync(directory) ? listFiles(directory) : []).toEqual([]);
    }

    const productionSource = stripTypeScriptComments(
      readSourceFiles(platformSrc, (file) => !isTestFile(file)),
    );
    for (const removedSymbol of [
      'GenericAdapter',
      'AdapterRegistry',
      'ProviderRegistry',
      'createStreamCollector',
      'toSharedService',
    ]) {
      expect(productionSource).not.toMatch(new RegExp(`\\b${removedSymbol}\\b`, 'u'));
    }

    const manifest = JSON.parse(
      readFileSync(join(packageRoot, 'platform/package.json'), 'utf-8'),
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(manifest.dependencies ?? {}).filter((name) => name.startsWith('@ai-sdk/')))
      .toEqual([]);
  });

  it('keeps retired experiment command, exports, markers, and runtime branches absent', () => {
    expect(existsSync(join(agentSrc, 'experiment'))).toBe(false);

    const agentProductionSource = stripTypeScriptComments(
      readSourceFiles(agentSrc, (file) => !isTestFile(file)),
    );
    for (const retiredSymbol of [
      'ExperimentRunner',
      'AblationToggles',
      'AblationMarkerHook',
      'applyAblationToggles',
      'extractAblationMarker',
      '__ablation',
    ]) {
      expect(agentProductionSource).not.toContain(retiredSymbol);
    }

    const agentRoot = readFileSync(join(agentSrc, 'index.ts'), 'utf-8');
    expect(agentRoot).not.toMatch(/from ['"]\.\/experiment/u);

    const cliProductionSource = stripTypeScriptComments(
      readSourceFiles(tuiSrc, (file) => !isTestFile(file)),
    );
    expect(cliProductionSource).not.toMatch(/\.command\(['"]experiment['"]\)/u);
    expect(cliProductionSource).not.toMatch(/core\/experiment/u);
  });

  it('keeps retired JSON and Memento metadata stores out of public and Host runtime paths', () => {
    const forbiddenRuntimeSymbols = [
      'ConversationIndexStore',
      'FileConversationStorage',
      'createFileConversationStorage',
      'createFileConversationPersistenceRuntime',
      'StateTaskStorage',
      'FileTaskStorage',
      'WorkspaceVisibleAgentTaskStorage',
      'createStateTaskStorage',
      'createFileTaskStorage',
      'createFileWorkspaceVisibleAgentTaskStorage',
      'StateTaskRecoveryStorage',
      'FileTaskRecoveryStorage',
      'createStateTaskRecoveryStorage',
      'createFileRecoveryStorage',
    ] as const;
    const publicBarrels = [
      join(agentSrc, 'index.ts'),
      join(agentSrc, 'session/index.ts'),
      join(agentSrc, 'task/index.ts'),
    ];
    const hostRuntimeSources = [...listFiles(extensionSrc), ...listFiles(tuiSrc)].filter(
      (file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file),
    );
    const testUtilitySources = listFiles(testUtilsSrc).filter(
      (file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file),
    );
    const symbolViolations = [...publicBarrels, ...hostRuntimeSources].flatMap((file) => {
      const source = stripTypeScriptComments(readFileSync(file, 'utf-8'));
      return forbiddenRuntimeSymbols
        .filter((symbol) => new RegExp(`\\b${symbol}\\b`, 'u').test(source))
        .map((symbol) => `${relative(repoRoot, file)} exposes retired ${symbol}`);
    });
    const pathViolations = [...hostRuntimeSources, ...testUtilitySources].flatMap((file) => {
      const source = stripTypeScriptComments(readFileSync(file, 'utf-8'));
      return ['tasks.json']
        .filter((legacyPath) => source.includes(legacyPath))
        .map((legacyPath) => `${relative(repoRoot, file)} uses retired runtime path ${legacyPath}`);
    });

    const retiredTaskIdentities = [
      'neko.agent.tasks',
      'neko.agent.taskRecovery',
      'taskStateMigrationBackup',
      'migrate-tasks',
      'reviewLegacyTaskMigration',
      'LegacyAgentTaskStateMigration',
      'task-storage-migration',
      'sqlite-task-state-migration',
    ] as const;
    const productionSources = [
      ...listFiles(agentSrc),
      ...listFiles(extensionSrc),
      ...listFiles(tuiSrc),
      ...listFiles(agentTypesSrc),
      ...testUtilitySources,
    ].filter((file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file));
    const identityViolations = [...productionSources, join(repoRoot, 'package.json')].flatMap(
      (file) => {
        const source = stripTypeScriptComments(readFileSync(file, 'utf-8'));
        return retiredTaskIdentities
          .filter((identity) => source.includes(identity))
          .map((identity) => `${relative(repoRoot, file)} retains ${identity}`);
      },
    );

    expect(existsSync(join(agentSrc, 'task/task-storage-migration.ts'))).toBe(false);
    expect(existsSync(join(agentSrc, 'task/sqlite-task-state-migration.ts'))).toBe(false);

    expect([...symbolViolations, ...pathViolations, ...identityViolations]).toEqual([]);
  });

  it('does not retain the removed Agent Platform Market product path', () => {
    expect(existsSync(join(packageRoot, 'platform/src/market'))).toBe(false);
  });

  it('keeps Webview from importing runtime, platform, ai-sdk, or vscode modules', () => {
    const source = readSourceFiles(webviewSrc, (file) => !isTestFile(file));

    expect(source).not.toMatch(/from\s+['"](?:@neko\/agent|@neko-agent\/agent)(?:\/[^'"]*)?['"]/);
    expect(source).not.toMatch(
      /from\s+['"](?:@neko\/platform|@neko-agent\/platform)(?:\/[^'"]*)?['"]/,
    );
    expect(source).not.toMatch(/from\s+['"]@neko\/ai-sdk(?:\/[^'"]*)?['"]/);
    expect(source).not.toMatch(/from\s+['"]vscode['"]/);
    expect(source).not.toMatch(/require\(['"]vscode['"]\)/);
  });

  it('keeps the Webview production Markdown path on @neko/markdown without legacy parser dependencies', () => {
    const packageManifest = JSON.parse(
      readFileSync(join(packageRoot, 'webview/package.json'), 'utf-8'),
    ) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    const dependencyNames = Object.keys(packageManifest.dependencies ?? {});
    const forbiddenDependencies = [
      'devlop',
      'hast-util-to-jsx-runtime',
      'html-url-attributes',
      'mdast-util-gfm',
      'micromark-extension-gfm',
      'react-markdown',
      'remark-gfm',
      'remark-parse',
      'remark-rehype',
      'unified',
      'vfile',
    ];
    const productionSource = readSourceFiles(webviewSrc, (file) => !isTestFile(file));

    expect(dependencyNames.filter((name) => forbiddenDependencies.includes(name))).toEqual([]);
    expect(productionSource).not.toMatch(
      /(?:from\s+|import\()['"](?:react-markdown|remark-gfm|remark-parse|remark-rehype|unified)['"]/,
    );
  });

  it('keeps Webview projection code from generating durable entity memory contributions', () => {
    const sourceFiles = listFiles(webviewSrc)
      .filter(
        (file) =>
          (file.endsWith('.ts') || file.endsWith('.tsx')) &&
          !isTestFile(file) &&
          !relative(webviewSrc, file).includes('__tests__/'),
      )
      .map((file) => ({
        file,
        source: readFileSync(file, 'utf-8'),
      }));

    const violations = sourceFiles.flatMap(({ file, source }) => {
      const relativePath = relative(repoRoot, file);
      const patterns = [
        /inferEntityMemoryContribution/i,
        /\bconst\s+DEFAULT_CONFIDENCE\s*=/,
        /character-analysis-row-not-entity/,
        /\bsourcePackage\s*:\s*['"][^'"]+['"]/,
        /\breviewPolicy\s*:\s*['"][^'"]+['"]/,
        /\bEntityMemoryContribution\s*=\s*\{/,
      ];
      return patterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps runtime collaborators independent from VSCode, React, Webview, and Extension modules', () => {
    const sourceFiles = listFiles(join(agentSrc, 'runtime'))
      .filter((file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));

    const forbiddenImportPatterns = [
      /from\s+['"]vscode['"]/,
      /require\(['"]vscode['"]\)/,
      /from\s+['"]react['"]/,
      /from\s+['"][^'"]*webview[^'"]*['"]/i,
      /from\s+['"][^'"]*extension[^'"]*['"]/i,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenImportPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps runtime root limited to documented runtime owners', () => {
    const allowedRuntimeRootFiles = new Set([
      'agent-entry-intent-runtime.ts',
      'agent-observation-recorder.ts',
      'agent-state-runtime.ts',
      'backfill-coordinator.ts',
      'config-bridge-runtime.ts',
      'conversation-route-runtime.ts',
      'conversation-tab-runtime.ts',
      'document-module-diagnostics.ts',
      'index.ts',
      'persisted-child-run-ownership.ts',
      'plugin-transfer-runtime.ts',
      'resource-cache-runtime.ts',
      'subagent-event-runtime.ts',
      'tool-result-backfill.ts',
      'types.ts',
    ]);
    const runtimeRootFiles = readdirSync(join(agentSrc, 'runtime'), { withFileTypes: true })
      .filter(
        (entry) => entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')),
      )
      .map((entry) => entry.name)
      .filter((name) => !allowedRuntimeRootFiles.has(name));

    expect(runtimeRootFiles).toEqual([]);
  });

  it('keeps the replaced Agent kernel physically absent', () => {
    const retiredPaths = [
      'executor',
      'session/agent-session.ts',
      'session/agent-session-initializer.ts',
      'runtime/runner',
      'runtime/session/agent-runtime-manager.ts',
      'runtime/session/agent-runtime-pool.ts',
      'runtime/session/agent-runtime-session-controller.ts',
      'runtime/session/agent-session-factory.ts',
      'runtime/turn/agent-turn-runtime.ts',
      'runtime/turn/agent-turn-assembly.ts',
    ];
    for (const retiredPath of retiredPaths) {
      const absolutePath = join(agentSrc, retiredPath);
      if (!existsSync(absolutePath)) continue;
      const productionFiles = statSync(absolutePath).isDirectory()
        ? listFiles(absolutePath).filter((file) => /\.(?:ts|tsx)$/.test(file) && !isTestFile(file))
        : [absolutePath];
      expect(productionFiles, retiredPath).toEqual([]);
    }

    const productionSource = stripTypeScriptComments(
      readSourceFiles(agentSrc, (file) => !isTestFile(file)),
    );
    for (const retiredSymbol of [
      'AgentExecutor',
      'createReActLoopRunner',
      'AgentSessionRunner',
      'AgentRunnerPort',
      'AgentRuntimePool',
    ]) {
      expect(productionSource).not.toContain(retiredSymbol);
    }
  });

  it('keeps runtime subdirectories narrow and documented', () => {
    const allowedRuntimeSubdirectories = new Set([
      '__tests__',
      'capability',
      'operation-adapters',
      'projection',
      'runner',
      'session',
      'stream',
      'turn',
    ]);
    const runtimeSubdirectories = readdirSync(join(agentSrc, 'runtime'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !allowedRuntimeSubdirectories.has(name));

    expect(runtimeSubdirectories).toEqual([]);

    const readme = readFileSync(join(agentSrc, 'runtime/README.md'), 'utf-8');
    for (const name of ['session/', 'turn/', 'capability/', 'stream/', 'projection/']) {
      expect(readme).toContain(name);
    }
  });

  it('keeps presenters, projectors, services, and stores out of runtime root', () => {
    const forbiddenRootFilePatterns = [
      /(?:^|-)presenter\.tsx?$/,
      /(?:^|-)projector\.tsx?$/,
      /(?:^|-)projection\.tsx?$/,
      /(?:^|-)service\.tsx?$/,
      /(?:^|-)store\.tsx?$/,
    ];
    const violations = readdirSync(join(agentSrc, 'runtime'), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => forbiddenRootFilePatterns.some((pattern) => pattern.test(name)));

    expect(violations).toEqual([]);
  });

  it('keeps NPC runtime modules host-agnostic and projection-only', () => {
    const npcRuntimeFiles = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .filter((file) => /(?:^|[/-])npc/i.test(relative(agentSrc, file)));

    const violations = npcRuntimeFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf-8');
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
        (match) => match[1] ?? '',
      );
      const forbiddenImports = imports.filter((specifier) =>
        /^(vscode|react|@neko\/platform|@neko-agent\/platform|@neko-dashboard|neko-dashboard|@neko-story|neko-story|@neko\/entity(?:\/(?!types\b|contracts\b)[^'"]*)?)$/.test(
          specifier,
        ),
      );
      const requiresVscode = /require\(['"]vscode['"]\)/.test(source);

      return [
        ...forbiddenImports.map((specifier) => `${relative(repoRoot, file)} -> ${specifier}`),
        ...(requiresVscode ? [`${relative(repoRoot, file)} -> require(vscode)`] : []),
      ];
    });

    expect(violations).toEqual([]);
  });

  it('keeps Extension as host adapter rather than runtime collaborator implementation', () => {
    const source = readSourceFiles(extensionSrc, (file) => !isTestFile(file));

    expect(source).not.toMatch(
      /class\s+(SessionPersistence|SessionArtifactFacade|ValidationRuntimeBridge|PromptRuntimeFacade)\b/,
    );
    expect(source).not.toMatch(
      /from\s+['"][^'"]*session\/(?:session-persistence|session-artifact-facade|validation-runtime-bridge|prompt-runtime-facade)['"]/,
    );
  });

  it('keeps builtin Skill catalog localization out of the Extension host adapter', () => {
    const source = stripTypeScriptComments(readFileSync(join(extensionSrc, 'index.ts'), 'utf-8'));

    expect(source).not.toMatch(/\bBUILTIN_SKILL_LOCALES\b/);
    expect(source).not.toMatch(/\bconst\s+\w*SkillLocales\b/i);
  });

  it('keeps creative execution runtimes out of Agent runtime ownership', () => {
    const forbiddenRuntimeFiles = [
      join(agentSrc, 'runtime/storyboard-image-runtime.ts'),
      join(agentSrc, 'runtime/shot-image-prep-runtime.ts'),
      join(agentSrc, 'runtime/comic-animation-indexing-runtime.ts'),
    ];

    const existingFiles = forbiddenRuntimeFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file));

    expect(existingFiles).toEqual([]);
  });

  it('keeps creation profiles and creation-specific runtime planes out of core', () => {
    const sharedSrc = join(workspaceRoot, 'packages/neko-types/src');
    const productionFiles = [
      ...listFiles(agentSrc),
      ...listFiles(agentTypesSrc),
      ...listFiles(extensionSrc),
      ...listFiles(tuiSrc),
      ...listFiles(sharedSrc),
    ].filter((file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file));
    const forbiddenPatterns = [
      /\bCreationProfile(?:Descriptor|Registry|Stage|Transition|PromptGuidance)?\b/,
      /\bICreationProfileRegistry\b/,
      /\bcreationProfileRegistry\b/,
      /\bgetCreationProfiles\b/,
      /\bICreationGuidanceRuntime\b/,
      /\bcreationGuidance\b/,
      /['"`]creation-profile['"`]/,
    ];
    const violations = productionFiles.flatMap((file) => {
      const source = stripTypeScriptComments(readFileSync(file, 'utf-8'));
      return forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(workspaceRoot, file)} matches ${pattern}`);
    });
    const forbiddenFiles = [
      join(sharedSrc, 'types/creation-profile.ts'),
      join(agentSrc, 'profile/creation-profile-registry.ts'),
      join(agentSrc, 'runtime/creation-guidance-runtime.ts'),
    ]
      .filter((file) => existsSync(file))
      .map((file) => relative(workspaceRoot, file).replace(/\\/g, '/'));

    expect([...violations, ...forbiddenFiles]).toEqual([]);
  });

  it('keeps creative compression and hard-coded domain Skill routing out of Agent core', () => {
    const sharedSrc = join(workspaceRoot, 'packages/neko-types/src');
    const productionFiles = [
      ...listFiles(agentSrc),
      ...listFiles(agentTypesSrc),
      ...listFiles(sharedSrc),
    ].filter((file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file));
    const forbiddenPatterns = [
      /\bCreativeSummarizer\b/,
      /\bMessageClassifier\b/,
      /\bCreativeCompressionConfig\b/,
      /\bcreativeCompression\b/,
      /\bcreativeMediaWorkflowTermFragments\b/,
      /\bcomicDocumentSourceTermFragments\b/,
      /\bfocusedProductionTermFragments\b/,
      /\bbroadOrchestrationTermFragments\b/,
      /\bartifactKeywords\b/,
    ];
    const violations = productionFiles.flatMap((file) => {
      const source = stripTypeScriptComments(readFileSync(file, 'utf-8'));
      return forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(workspaceRoot, file)} matches ${pattern}`);
    });
    const forbiddenFiles = [
      join(agentSrc, 'context/creative-summarizer.ts'),
      join(agentSrc, 'context/message-classifier.ts'),
    ]
      .filter((file) => existsSync(file))
      .map((file) => relative(workspaceRoot, file).replace(/\\/g, '/'));

    expect([...violations, ...forbiddenFiles]).toEqual([]);

    const skillRoutingSource = stripTypeScriptComments(
      readSourceFiles(join(agentSrc, 'pi'), (file) => !isTestFile(file)),
    );
    for (const hardCodedDomainRoute of [
      /storyboard, animation, video/i,
      /Canvas\/Cut handoff/i,
      /分镜、动画、视频/u,
      /Canvas\/Cut 交接/u,
    ]) {
      expect(skillRoutingSource).not.toMatch(hardCodedDomainRoute);
    }
  });

  it('keeps domain validators and task-result projectors out of Agent core', () => {
    const coreProjectionFiles = [
      join(agentSrc, 'validation/output-validator.ts'),
      join(agentSrc, 'validation/validation-hooks.ts'),
      join(agentSrc, 'task/task-view-projector.ts'),
      join(agentTypesSrc, 'work-item.ts'),
      join(agentTypesSrc, 'work-item-projector.ts'),
    ];
    const forbiddenPatterns = [
      /\bcreativeEntity\b/,
      /generated-storyboard/,
      /\b(?:validate|project|sanitize)Storyboard\w*\b/,
      /\bStoryboard(?:Output)?Validator\b/,
    ];
    const violations = coreProjectionFiles.flatMap((file) => {
      const source = stripTypeScriptComments(readFileSync(file, 'utf-8'));
      return forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(workspaceRoot, file)} matches ${pattern}`);
    });
    const forbiddenFiles = [
      join(agentSrc, 'validation/storyboard-output-validator.ts'),
      join(agentSrc, 'task/media-task-creative-entity.ts'),
      join(packageRoot, 'platform/src/media/media-task-creative-entity.ts'),
    ]
      .filter((file) => existsSync(file))
      .map((file) => relative(workspaceRoot, file).replace(/\\/g, '/'));

    expect([...violations, ...forbiddenFiles]).toEqual([]);
  });

  it('keeps creative Agent and planner services out of Agent and Platform core', () => {
    const productionFiles = [
      ...listFiles(agentSrc),
      ...listFiles(agentTypesSrc),
      ...listFiles(join(packageRoot, 'platform/src')),
    ].filter((file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file));
    const forbiddenPatterns = [/\bCreativeAgent\b/, /\bMediaPlanner\b/];
    const violations = productionFiles.flatMap((file) => {
      const source = stripTypeScriptComments(readFileSync(file, 'utf-8'));
      return forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(workspaceRoot, file)} matches ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps Canvas generation runtime out of Agent runtime ownership', () => {
    const forbiddenRuntimeFiles = [
      join(agentSrc, 'runtime/canvas-generation-runtime.ts'),
      join(agentSrc, 'runtime/creative-ai-run-runtime.ts'),
      join(agentSrc, 'runtime/storyboard-action-task-runtime.ts'),
      join(extensionSrc, 'services/creativeAiConversationRoutingService.ts'),
      join(extensionSrc, 'services/creativeAiConversationLifecycleService.ts'),
    ];
    const existingFiles = forbiddenRuntimeFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingFiles).toEqual([]);

    const agentProductionSource = stripTypeScriptComments(
      [agentSrc, extensionSrc]
        .flatMap((root) => listFiles(root))
        .filter((file) => /\.(?:ts|tsx)$/.test(file) && !isTestFile(file))
        .map((file) => readFileSync(file, 'utf-8'))
        .join('\n'),
    );
    for (const forbiddenIdentity of [
      'neko.agent.creativeAi.invokeExternal',
      'createCreativeAiRunRuntime',
      'executeExternalCreativeAi',
      'buildCanvasStoryboardActionIntentPrompt',
    ]) {
      expect(agentProductionSource).not.toContain(forbiddenIdentity);
    }

    const canvasExecutorSource = readFileSync(
      join(workspaceRoot, 'packages/neko-canvas/packages/extension/src/canvasCreativeAiExecutor.ts'),
      'utf-8',
    );
    for (const forbiddenLlmDetail of [
      'modelId',
      'credential',
      'maxTokens',
      'temperature',
      'thinkingBudget',
      'PiAgent',
    ]) {
      expect(canvasExecutorSource).not.toContain(forbiddenLlmDetail);
    }
  });

  it('keeps Character domain runtime in @neko/entity', () => {
    for (const fileName of [
      'character-runtime-policy.ts',
      'character-evidence.ts',
      'character-dialogue-session.ts',
      'character-dialogue-runtime.ts',
      'embody-character-session.ts',
    ]) {
      expect(existsSync(join(agentSrc, 'runtime', fileName)), fileName).toBe(false);
      expect(existsSync(join(workspaceRoot, 'packages/neko-entity/src', fileName)), fileName).toBe(
        true,
      );
    }
  });

  it('keeps Puppet face domain tools out of Agent core', () => {
    const forbiddenToolFiles = [
      join(agentSrc, 'tools/puppet-face-runtime.ts'),
      join(agentSrc, 'tools/puppet-face-tools.ts'),
    ];
    const existingFiles = forbiddenToolFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingFiles).toEqual([]);
  });

  it('keeps Story scene search runtime out of Agent core', () => {
    const forbiddenToolFiles = [join(agentSrc, 'tools/script-scene-search-runtime.ts')];
    const existingFiles = forbiddenToolFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingFiles).toEqual([]);
  });

  it('keeps concrete operation tool adapters out of Agent runtime ownership', () => {
    const forbiddenRuntimeFiles = [
      join(agentSrc, 'runtime/operation-adapters/canvas-node-update-adapter.ts'),
      join(agentSrc, 'runtime/operation-adapters/model-element-update-adapter.ts'),
      join(agentSrc, 'runtime/operation-adapters/timeline-element-update-adapter.ts'),
    ];
    const existingFiles = forbiddenRuntimeFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingFiles).toEqual([]);

    const runtimeSourceFiles = listFiles(join(agentSrc, 'runtime'))
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenAdapterTerms = [
      /\bcreateDefaultOperationToolAdapterRegistry\b/,
      /\bcreateCanvasNodeUpdateAdapter\b/,
      /\bcreateModelElementUpdateAdapter\b/,
      /\bcreateTimelineElementUpdateAdapter\b/,
      /canvas-node-update/,
      /model-element-update/,
      /timeline-element-update/,
    ];
    const violations = runtimeSourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenAdapterTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps domain plugin transfer command plans out of Agent runtime ownership', () => {
    const runtimeSourceFiles = listFiles(join(agentSrc, 'runtime'))
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenCommandTerms = [
      /['"`]neko\.canvas\.importAsset['"`]/,
      /['"`]neko\.cut\.importStoryboard['"`]/,
      /['"`]neko\.cut\.importGeneratedClip['"`]/,
      /['"`]neko\.sketch\.importAsset['"`]/,
      /['"`]neko\.model\.importAsset['"`]/,
    ];
    const violations = runtimeSourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenCommandTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps Canvas and Cut tool localization metadata out of Agent core', () => {
    const toolRegistrySource = stripTypeScriptComments(
      readFileSync(join(agentSrc, 'tools/tool-registry.ts'), 'utf-8'),
    );
    const forbiddenToolMetadataKeys = [
      'CreateCanvas',
      'AddCanvasShape',
      'canvas_list_nodes',
      'canvas_get_node',
      'canvas_update_node',
      'canvas_create_node',
      'canvas_derive_node',
      'canvas_create_composite',
      'canvas_update_block',
      'canvas_extract_structured_content',
      'canvas_get_active_context',
      'canvas_narrative_traverse',
      'canvas_apply_agent_content',
      'canvas_describe_authoring_capabilities',
      'canvas_list_connections',
      'canvas_get_connection',
      'canvas_create_connection',
      'canvas_get_storyboard_execution_summary',
      'canvas_generate_image',
      'canvas_generate_batch',
      'set_project_generation_config',
      'export_storyboard',
      'canvas_apply_style_transfer',
      'import_script_to_canvas',
      'canvas_generate_video_with_keyframes',
      'canvas.ingestMarkdown',
      'canvas.validateMarkdownStoryboard',
    ];
    const violations = forbiddenToolMetadataKeys
      .filter((toolName) => createObjectKeyPattern(toolName).test(toolRegistrySource))
      .map((toolName) => `tools/tool-registry.ts contains localization key ${toolName}`);

    expect(violations).toEqual([]);
  });

  it('keeps domain tool permission defaults out of Agent core', () => {
    const permissionSource = [
      'permission/tool-traits-registry.ts',
      'permission/types.ts',
      'hooks/executor-hooks-factory.ts',
    ]
      .filter((relativePath) => existsSync(join(agentSrc, relativePath)))
      .map((relativePath) => stripTypeScriptComments(readFileSync(join(agentSrc, relativePath), 'utf-8')))
      .join('\n');
    const forbiddenPermissionToolNames = [
      'GetTimelineInfo',
      'ListTimelineElements',
      'AddTimelineElement',
      'UpdateTimelineElement',
      'DeleteTimelineElement',
      'canvas_list_nodes',
      'canvas_get_node',
      'canvas_update_node',
      'canvas_create_node',
      'canvas_generate_image',
      'canvas_generate_video_with_keyframes',
      'GenerateVideoForClip',
      'ListVideoEffects',
      'GetVideoEffectInfo',
      'ListAssets',
      'GetAsset',
    ];
    const violations = forbiddenPermissionToolNames
      .filter((toolName) =>
        new RegExp(`['"\`]${escapeRegExp(toolName)}['"\`]`).test(permissionSource),
      )
      .map((toolName) => `Agent permission defaults contain domain tool ${toolName}`);

    expect(violations).toEqual([]);
  });

  it('keeps provider-specific Canvas tool instructions out of Agent runtime prompts', () => {
    const messageRuntimeSource = stripTypeScriptComments(
      readFileSync(join(agentSrc, 'runtime/turn/message-runtime.ts'), 'utf-8'),
    );
    const forbiddenPromptToolNames = [
      'canvas_get_node',
      'canvas_update_node',
      'canvas_generate_image',
      'canvas_describe_authoring_capabilities',
      'canvas_list_connections',
      'canvas_create_connection',
    ];
    const violations = forbiddenPromptToolNames
      .filter((toolName) => messageRuntimeSource.includes(toolName))
      .map((toolName) => `runtime/turn/message-runtime.ts contains provider tool ${toolName}`);

    expect(violations).toEqual([]);
  });

  it('keeps Canvas authoring semantics in Canvas provider, Skill, and catalog contracts', () => {
    const sourceFiles = [...listFiles(agentSrc), ...listFiles(join(packageRoot, 'platform/src'))]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenCanvasAuthoringTerms = [
      /['"`]canvas-authoring['"`]/,
      /['"`]canvas-markdown-storyboard['"`]/,
      /\bscene\.basic\b/,
      /\bshot\.basic\b/,
      /\bCanvasAuthoringCatalog\b/,
      /\bCanvasAuthoringFieldProfileDescriptor\b/,
      /\bCanvasAuthoringOperationDescriptor\b/,
      /\bCanvasAuthoringRecipeDescriptor\b/,
      /\bAI_NATIVE_STORYBOARD_FIELD_PROFILE\b/,
      /fieldProfiles/,
      /semanticPrompts/,
      /prompt-field alignment/i,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenCanvasAuthoringTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps storyboard CreativeTable field contracts out of Agent types and Webview rendering', () => {
    const sourceFiles = [
      ...listFiles(join(packageRoot, 'agent-types/src')),
      ...listFiles(webviewSrc),
    ]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenPatterns = [
      /creative-table-contract/,
      /\bSTORYBOARD_CREATIVE_TABLE_(?:FIELDS|HEADERS)\b/,
      /\bresolveStoryboardCreativeTableHeader\b/,
      /\bnormalizeStoryboardCreativeTableHeader\b/,
      /chat\.storyboardTable\.fields/,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps media quality domain validation out of Agent core', () => {
    const forbiddenValidationFiles = [
      join(agentSrc, 'validation/qa-types.ts'),
      join(agentSrc, 'validation/quality-evidence-normalizer.ts'),
      join(agentSrc, 'validation/video-content-index.ts'),
      join(agentSrc, 'validation/remediation-planner.ts'),
      join(agentSrc, 'validation/consistency-evaluator.ts'),
      join(agentSrc, 'validation/media-quality-runtime.ts'),
      join(agentSrc, 'validation/quality-check-tools.ts'),
    ];
    const existingFiles = forbiddenValidationFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingFiles).toEqual([]);
  });

  it('keeps media quality feedback adapters out of Agent core', () => {
    const forbiddenFeedbackFiles = [join(agentSrc, 'feedback/quality-review-evidence.ts')];
    const existingFiles = forbiddenFeedbackFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));
    const productionSource = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const qualityFeedbackTerms = [
      /\bQualityCheck\b/,
      /\bQualityRepairCheck\b/,
      /\bQualityCheckConsistency\b/,
    ];
    const sourceViolations = productionSource.flatMap(({ relativePath, source }) =>
      qualityFeedbackTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect([...existingFiles, ...sourceViolations]).toEqual([]);
  });

  it('keeps concrete validation, creative-process recovery, and memory policies out of Agent core', () => {
    const forbiddenFiles = [
      join(agentSrc, 'artifact/artifact-observation-hooks.ts'),
      join(agentSrc, 'control-plane/artifact-registry.ts'),
      join(agentSrc, 'control-plane/control-plane.ts'),
      join(agentSrc, 'control-plane/stage-registry.ts'),
      join(agentSrc, 'creative-process/creative-process-artifacts.ts'),
      join(agentSrc, 'creative-process/creative-process-recovery-policy.ts'),
      join(agentSrc, 'creative-process/creative-process-stages.ts'),
      join(agentSrc, 'evaluation/self-evaluation-hooks.ts'),
      join(agentSrc, 'feedback/feedback-coordinator.ts'),
      join(agentSrc, 'validation/artifact-validation-observation-hooks.ts'),
      join(agentSrc, 'validation/validation-coordinator.ts'),
      join(agentSrc, 'memory/keyfact-extractor.ts'),
      join(agentSrc, 'memory/project-memory-router.ts'),
      join(agentSrc, 'memory/provider-card-project-router.ts'),
    ];
    const existingFiles = forbiddenFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));
    const productionSource = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenTerms = [
      /\bcreateFeedbackCoordinator\b/,
      /\bcreateValidationCoordinator\b/,
      /\bcreateDefaultControlPlane\b/,
      /\bcreateDefaultCreativeProcessRecoveryPolicy\b/,
      /\bFeedbackStageController\b/,
      /\bCreativeProcessValidationStageController\b/,
      /\bSelfEvaluationHooks\b/,
      /\bcreateArtifactObservationHooks\b/,
      /\bKeyFactExtractor\b/,
      /\bProjectMemoryRouter\b/,
      /\bProviderCardProjectRouter\b/,
    ];
    const sourceViolations = productionSource.flatMap(({ relativePath, source }) =>
      forbiddenTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect([...existingFiles, ...sourceViolations]).toEqual([]);
  });

  it('keeps legacy feedback/control-plane runtime entrypoints out of Agent core', () => {
    const productionSource = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const legacyRuntimePatterns = [
      /\bFeedbackRuntimeBridge\b/,
      /feedback-runtime-bridge/,
      /\bFeedbackGuidanceModule\b/,
      /feedback-guidance-module/,
      /feedback\.guidance/,
      /feedback\.stage_transition_requested/,
      /\bfeedbackCoordinator(?:Factory)?\b/,
      /\bfeedbackControlPolicy\b/,
      /\btoolResultFeedbackAdapters\b/,
      /\bcontrolPlane\b/,
      /\bAgentControlPlane\b/,
      /\bAgentFeedbackCoordinator\b/,
      /\bAgentFeedbackCycle\b/,
      /\bAgentFeedbackSignal\b/,
      /\bAgentFeedbackDecision\b/,
      /\bAgentFeedbackFlowAction\b/,
      /\bAgentFeedbackEvaluationContext\b/,
      /\bAgentFeedbackMemoryExtraction(?:Input|Outcome|Result|Skipped)\b/,
    ];
    const violations = productionSource.flatMap(({ relativePath, source }) =>
      legacyRuntimePatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps optional Autoheal strategy packs and chain implementation out of Agent core', () => {
    const forbiddenFiles = [
      join(agentSrc, 'autoheal/autoheal-chain.ts'),
      join(agentSrc, 'autoheal/autoheal-types.ts'),
      join(agentSrc, 'autoheal/example-handlers.ts'),
    ];
    const existingFiles = forbiddenFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));
    const productionSource = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenTerms = [
      /\bclass\s+AutohealChain\b/,
      /\bcreateAutohealChain\b/,
      /\bDEFAULT_AUTOHEAL_POLICY\b/,
      /\bcreateResolutionDegradeHandler\b/,
      /\bcreateSubstituteHandler\b/,
      /\bcreateUserEscalationHandler\b/,
      /image\.dalle/,
      /image\.sdxl/,
      /video\.sora/,
      /video\.kling/,
    ];
    const sourceViolations = productionSource.flatMap(({ relativePath, source }) =>
      forbiddenTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect([...existingFiles, ...sourceViolations]).toEqual([]);
  });

  it('keeps character memory artifact projection out of Agent core', () => {
    const forbiddenFiles = [
      join(agentSrc, 'artifact/character-memory-artifact.ts'),
      join(agentSrc, 'artifact/entity-memory-contribution-inference.ts'),
    ];
    const existingFiles = forbiddenFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));
    const productionSource = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenTerms = [
      /\bbuildCharacterMemoryReviewArtifact\b/,
      /\bbuildEntityMemoryContributionReviewArtifact\b/,
      /\binferEntityMemoryContributionFromCharacterAnalysis\b/,
      /\bmaybeAttachInferredEntityMemoryContribution\b/,
      /character-memory-artifact-review/,
      /entity-memory-contribution-review/,
    ];
    const sourceViolations = productionSource.flatMap(({ relativePath, source }) =>
      forbiddenTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect([...existingFiles, ...sourceViolations]).toEqual([]);
  });

  it('keeps Agent package independent from concrete skill packages', () => {
    const packageManifest = stripTypeScriptComments(
      readFileSync(join(repoRoot, 'packages/agent/package.json'), 'utf-8'),
    );
    const tsconfig = stripTypeScriptComments(
      readFileSync(join(repoRoot, 'packages/agent/tsconfig.json'), 'utf-8'),
    );
    const sourceFiles = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenPackageSpecifiers = [
      /"@neko-agent\/skills"/,
      /"@neko-agent\/skills\//,
      /"@neko\/skills"/,
      /"@neko\/skills\//,
    ];
    const manifestViolations = forbiddenPackageSpecifiers
      .filter((pattern) => pattern.test(packageManifest) || pattern.test(tsconfig))
      .map((pattern) => `packages/agent package config matches ${pattern}`);
    const sourceViolations = sourceFiles.flatMap(({ relativePath, source }) =>
      [
        /from\s+['"]@neko-agent\/skills(?:\/[^'"]*)?['"]/,
        /from\s+['"]@neko\/skills(?:\/[^'"]*)?['"]/,
        /import\(['"]@neko-agent\/skills(?:\/[^'"]*)?['"]\)/,
        /import\(['"]@neko\/skills(?:\/[^'"]*)?['"]\)/,
      ]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect([...manifestViolations, ...sourceViolations]).toEqual([]);
  });

  it('keeps concrete media workflow skill strategy out of Agent core', () => {
    const forbiddenFiles = [join(agentSrc, 'artifact/shot-image-prep-artifact.ts')];
    const existingForbiddenFiles = forbiddenFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingForbiddenFiles).toEqual([]);

    const skillRuntimeSourceFiles = listFiles(join(agentSrc, 'skill'))
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenSkillNames = [
      /['"`]comic-to-storyboard['"`]/,
      /['"`]comic-to-animation['"`]/,
      /['"`]media-to-video['"`]/,
      /['"`]storyboard-to-animation-plan['"`]/,
      /['"`]animation-plan-to-cut['"`]/,
      /['"`]generated-shot-assembly['"`]/,
      /['"`]export-video-package['"`]/,
    ];
    const violations = skillRuntimeSourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenSkillNames
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps removed creative and Quality identities out of workspace runtime fixtures', () => {
    const removedCreativeSkillNames = [
      'ai-generate',
      'comic-to-animation',
      'comic-to-storyboard',
      'media-to-video',
      'image-to-shot',
      'storyboard-to-animation-plan',
      'animation-plan-to-cut',
      'generated-shot-assembly',
      'export-video-package',
    ] as const;
    const removedQualityToolNames = ['QualityRepairCheck', 'QualityCheckConsistency'] as const;
    const removedRuntimeIdentities = [
      ...removedCreativeSkillNames,
      ...removedQualityToolNames,
    ] as const;
    const allowedNegativeOrInternalReferences = new Map<string, ReadonlySet<string>>([
      [
        'packages/neko-agent/packages/extension/src/services/__tests__/skillCatalogProvider.test.ts',
        new Set(removedCreativeSkillNames),
      ],
      [
        'packages/neko-skills/src/builtins/builtin-skills.test.ts',
        new Set(removedRuntimeIdentities),
      ],
      ['packages/neko-skills/src/builtins/creative-media.ts', new Set(['generated-shot-assembly'])],
      [
        'packages/neko-skills/src/quality/__tests__/quality-review-validation.test.ts',
        new Set(removedQualityToolNames),
      ],
      [
        'packages/neko-skills/src/subagent/__tests__/creative-presets.test.ts',
        new Set(['QualityCheckConsistency']),
      ],
      [
        'packages/neko-cut/packages/extension/src/services/cutAgentSkillInvocation.test.ts',
        new Set(['ai-generate']),
      ],
      [
        'packages/neko-agent/packages/agent/src/session/__tests__/agent-session.test.ts',
        new Set(['comic-to-storyboard']),
      ],
    ]);
    const workspaceRoot = join(repoRoot, '../..');
    const trackedSourceFiles = execFileSync(
      'git',
      ['ls-files', 'packages', 'scripts/agent-eval/scenarios'],
      { cwd: workspaceRoot, encoding: 'utf-8' },
    )
      .split('\n')
      .filter(Boolean)
      .filter((file) => existsSync(join(workspaceRoot, file)))
      .filter(
        (file) =>
          file.endsWith('.ts') ||
          file.endsWith('.tsx') ||
          file.endsWith('.json') ||
          file.endsWith('.mjs'),
      )
      .filter((file) => !file.endsWith('architecture-boundary-guards.test.ts'));
    const violations = trackedSourceFiles.flatMap((relativePath) => {
      const file = join(workspaceRoot, relativePath);
      const allowedNames = allowedNegativeOrInternalReferences.get(relativePath);
      const source = readFileSync(file, 'utf-8');
      return removedRuntimeIdentities
        .filter((name) => hasQuotedIdentity(source, name) && !allowedNames?.has(name))
        .map((name) => `${relativePath} contains removed runtime identity ${name}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps domain SubAgent presets out of Agent core', () => {
    const forbiddenFiles = [join(agentSrc, 'subagent/creative-presets.ts')];
    const existingForbiddenFiles = forbiddenFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingForbiddenFiles).toEqual([]);

    const subagentRuntimeSourceFiles = listFiles(join(agentSrc, 'subagent'))
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenDomainPresetTerms = [
      /['"`]creative-director['"`]/,
      /['"`]cinematographer['"`]/,
      /['"`]composer['"`]/,
      /['"`]vfx-artist['"`]/,
      /['"`]quality-checker['"`]/,
      /\bquality_tier\b/,
      /\bQualityTier\b/,
      /\bCreativeAgentType\b/,
    ];
    const violations = subagentRuntimeSourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenDomainPresetTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps host-specific projection names quarantined away from runtime production callers', () => {
    const sourceFiles = listFiles(packageRoot)
      .filter(
        (file) =>
          (file.endsWith('.ts') || file.endsWith('.tsx')) &&
          !isTestFile(file) &&
          !relative(repoRoot, file).includes('__tests__/'),
      )
      .map((file) => ({
        file,
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));

    const allowedShimFiles = new Set([
      'packages/agent/src/runtime/stream/agent-stream-state.ts',
      'packages/agent/src/runtime/backfill-coordinator.ts',
      'packages/agent/src/session/context-host-message.ts',
      'packages/agent/src/runtime/index.ts',
      'packages/neko-agent/packages/agent/src/runtime/stream/agent-stream-state.ts',
      'packages/neko-agent/packages/agent/src/runtime/backfill-coordinator.ts',
      'packages/neko-agent/packages/agent/src/session/context-host-message.ts',
      'packages/neko-agent/packages/agent/src/runtime/index.ts',
    ]);
    const allowedAdapterFiles = new Set([
      'packages/extension/src/chat/message/agentTurnBridge.ts',
      'packages/extension/src/services/mediaTurnBridge.ts',
      'packages/neko-agent/packages/extension/src/chat/message/agentTurnBridge.ts',
      'packages/neko-agent/packages/extension/src/services/mediaTurnBridge.ts',
    ]);
    const forbiddenPatterns = [
      /\brunAgentTurnForWebviewRuntime\b/,
      /\bbuildAgentTurnForWebviewRuntimeInput\b/,
      /\brunAgentMediaTurnForWebview\b/,
      /\bprojectAgentStreamEventToWebviewMessages\b/,
      /\bAgentStreamWebviewMessage\b/,
      /\bAgentTurnForWebviewRuntimeMessage\b/,
      /\bRunAgentTurnForWebviewRuntime(?:Input|Result)\b/,
      /\bRunAgentMediaTurnForWebview(?:Input|Result)\b/,
      /\bBackfillCoordinatorWebviewPort\b/,
      /\bContextWebviewMessage\b/,
    ];

    const violations = sourceFiles.flatMap(({ relativePath, source }) => {
      if (allowedShimFiles.has(relativePath) || allowedAdapterFiles.has(relativePath)) {
        return [];
      }
      return forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps Webview-generated asset DTOs and render handles out of host-neutral contracts', () => {
    const hostNeutralRoots = [
      join(packageRoot, 'agent-types/src'),
      join(packageRoot, 'agent/src'),
      join(packageRoot, 'platform/src'),
    ];
    const allowedSanitizers = new Set([
      'packages/agent/src/input/message-resource-projector.ts',
      'packages/agent/src/session/working-memory.ts',
      'packages/neko-agent/packages/agent/src/input/message-resource-projector.ts',
      'packages/neko-agent/packages/agent/src/session/working-memory.ts',
    ]);
    const violations = hostNeutralRoots.flatMap((root) =>
      listFiles(root)
        .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
        .filter((file) => !isTestFile(file) && !relative(repoRoot, file).includes('__tests__/'))
        .flatMap((file) => {
          const relativePath = relative(repoRoot, file).replace(/\\/g, '/');
          if (allowedSanitizers.has(relativePath)) {
            return [];
          }
          const source = stripTypeScriptComments(readFileSync(file, 'utf-8'));
          return [/\bWebviewGeneratedAsset\b/, /\bwebviewUri\b/, /\bimagePathWebviewUris\b/]
            .filter((pattern) => pattern.test(source))
            .map((pattern) => `${relativePath} matches ${pattern}`);
        }),
    );

    expect(violations).toEqual([]);
  });

  it('keeps Agent Extension from re-owning project search aggregation policy', () => {
    const sourceFiles = listFiles(extensionSrc)
      .filter((file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file))
      .map((file) => ({
        file,
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));

    const shimImportViolations = sourceFiles.flatMap(({ file, source }) =>
      [...source.matchAll(/from\s+['"]([^'"]*services\/projectSearch[^'"]*)['"]/g)].map(
        (match) => `${relative(repoRoot, file)} -> ${match[1]}`,
      ),
    );
    expect(shimImportViolations).toEqual([]);

    const adapterPath = join(extensionSrc, 'services/agentProjectSearchAdapters.ts');
    const adapterSource = stripTypeScriptComments(readFileSync(adapterPath, 'utf-8'));
    const forbiddenLocalPolicyHelpers = [
      /\bfunction\s+dedupeCreativeEntityItems\b/,
      /\bfunction\s+dedupeKeyForProjectSearchItem\b/,
      /\bfunction\s+shouldPreferProjectSearchItem\b/,
      /\bfunction\s+aggregateCreativeEntityStatus\b/,
      /\bfunction\s+aggregateItemFreshness\b/,
      /\bfunction\s+aggregateStateFreshness\b/,
      /\bfunction\s+dashboardRowToSearchItem\b/,
      /\bfunction\s+extractLineBasedScriptCharacters\b/,
      /\bfunction\s+scriptCandidateToSearchItem\b/,
    ];
    const policyViolations = forbiddenLocalPolicyHelpers
      .filter((pattern) => pattern.test(adapterSource))
      .map((pattern) => `${relative(repoRoot, adapterPath)} matches ${pattern}`);

    expect(policyViolations).toEqual([]);
  });

  it('keeps removed IDC run control APIs out of Agent source and tests', () => {
    const sourceFiles = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));
    const forbiddenPatterns = [
      /\bstartIdcRunWithIntent\b/,
      /\bstopIdcRunWithIntent\b/,
      /\bstartIdcRun\s*\(/,
      /\bgetActiveIdcRun\b/,
      /\bgetIdcRun\s*\(/,
      /\blistIdcRuns\b/,
      /\bcreateIdcRunStore\b/,
      /\bIIdcRunStore\b/,
      /\bIdcRunLifecycle\b/,
      /\b_runStore\b/,
      /\b_idcRunLifecycle\b/,
      /\bworkflowRuntime\b/,
      /\bIWorkflowRuntime\b/,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps legacy IDC workflow control targets out of production activation paths', () => {
    const sourceFiles = [
      ...listFiles(agentSrc),
      ...listFiles(extensionSrc),
      ...listFiles(webviewSrc),
    ]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));

    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      [/'idc-workflow'/, /"idc-workflow"/, /\bStartIDCWorkflow\b/, /['"`]\/idc(?:\s|['"`])/]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps legacy idc metadata out of Agent creation guidance parsing', () => {
    const sourceFiles = listFiles(join(agentSrc, 'session'))
      .filter((file) => file.endsWith('.ts') && !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));

    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      [/metadata\[['"]idc['"]\]/, /\bagentCreation\s*\?\?\s*metadata\[['"]idc['"]\]/]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps workspace snapshot APIs named as staged creation compatibility, not IDC runtime', () => {
    const workspaceSrc = join(agentSrc, 'workspace');
    const sourceFiles = listFiles(workspaceSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenPatterns = [
      /\bidc-runtime-state-(?:store|reader)\b/,
      /\bcreateIdcRuntimeStateStore\b/,
      /\breadIdcRuntimeState\b/,
      /\bparseIdcRuntimeState\b/,
      /\bIIdcRuntimeStateStore\b/,
      /\bIdcRuntimeState(?:Input|Snapshot|FsOps|StoreConfig|ReadFsOps)?\b/,
      /\bReadIdcRuntimeStateConfig\b/,
      /\bIdcRuntimeRestoreState\b/,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps prompt-chain guidance free of creation observation state', () => {
    const sourceFiles = [
      ...listFiles(agentSrc),
      ...listFiles(join(packageRoot, 'agent-types/src')),
      ...listFiles(extensionSrc),
      ...listFiles(tuiSrc),
    ]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenPatterns = [
      /\bConversationSkillCreationRuntimePort\b/,
      /\bcreationRuntime\??:/,
      /\b_deps\.creationRuntime\b/,
      /\bcreation runtime is configured\b/i,
      /\bAgentPromptChainObservation(?:Base|Kind)?\b/,
      /\bConversationSkillPromptChain(?:ObservationPort|Context)\b/,
      /\bpromptChainObservationPort\b/,
      /\bcreationFeedback\b/,
      /\bcreateSkillExecutionCreationMetadata\b/,
      /\bmergeCreationExecutionMetadata\b/,
      /\bagentCreation\s*[?:]/,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    const forbiddenFiles = [
      join(agentTypesSrc, 'prompt-chain-observation.ts'),
      join(agentSrc, 'session/creation-execution-metadata.ts'),
      join(agentSrc, 'session/creation-kind.ts'),
    ]
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect([...violations, ...forbiddenFiles]).toEqual([]);
  });

  it('poisons fixed creative Workflow runtimes and executable prompt-chain plan schemas', () => {
    const sourceFiles = [
      ...listFiles(agentSrc),
      ...listFiles(agentTypesSrc),
      ...listFiles(extensionSrc),
      ...listFiles(webviewSrc),
      ...listFiles(join(workspaceRoot, 'packages/neko-skills/src')),
    ]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const workflowRuntimePatterns = [
      /\bI?WorkflowRuntime\b/,
      /\bCreativeWorkflowRuntime\b/,
      /\bWorkflowRun\b/,
      /\bWorkflowNode\b/,
      /\bWorkflowTransition\b/,
      /\bFixedCreativeStageExecutor\b/,
      /\bCreativeStageExecutor\b/,
    ];
    const runtimeViolations = sourceFiles.flatMap(({ relativePath, source }) =>
      workflowRuntimePatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    const fixedStageViolations = sourceFiles.flatMap(({ relativePath, source }) =>
      [
        /\bMediaProductionWorkflowRunState\b/,
        /\bMediaProductionStageExecutorPort\b/,
        /\bMediaProductionWorkflowStateStorePort\b/,
        /\bMediaProductionWorkflowRecoveryCoordinator\b/,
        /\bMediaProductionProjectAuthoringOrchestrator\b/,
        /\bMediaProductionPreExportGateOrchestrator\b/,
        /\bTaskBackedMediaProductionWorkflowStateStore\b/,
        /\bMEDIA_PRODUCTION_(?:EARLY_)?STAGE_IDS\b/,
        /\bCREATIVE_MEDIA_WORKFLOW_STAGES\b/,
        /\bCreativeMediaWorkflowStageDescriptor\b/,
      ]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    const promptChainPlanPatterns = [
      /\bAgentPromptChainExecutablePlan\b/,
      /\bPromptChain(?:Executable)?Plan\b/,
      /\bPromptChain(?:Node|Transition|Executor|Runtime|Schema)\b/,
      /\bpromptChain(?:Executable)?Plan\??\s*:/,
      /\bpromptChain(?:Nodes|Transitions|RetryPolicy|ToolSchema)\??\s*:/,
    ];
    const promptChainViolations = sourceFiles.flatMap(({ relativePath, source }) =>
      promptChainPlanPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    const forbiddenFiles = [
      'packages/agent/src/runtime/workflow-runtime.ts',
      'packages/agent/src/runtime/creative-workflow-runtime.ts',
      'packages/agent/src/workflow/workflow-runtime.ts',
      'packages/agent/src/media-production/early-stage-orchestrator.ts',
      'packages/agent/src/media-production/project-authoring-orchestrator.ts',
      'packages/agent/src/media-production/pre-export-gate-orchestrator.ts',
      'packages/agent/src/media-production/workflow-recovery-coordinator.ts',
      'packages/agent/src/task/media-production-workflow-state.ts',
      'packages/extension/src/services/mediaProductionProjectAuthoringResolver.ts',
      'packages/agent-types/src/prompt-chain-executable-plan.ts',
      'packages/agent-types/src/prompt-chain-workflow.ts',
      '../neko-types/src/types/media-production-workflow.ts',
    ].filter((file) => existsSync(join(repoRoot, file)));

    expect([
      ...runtimeViolations,
      ...fixedStageViolations,
      ...promptChainViolations,
      ...forbiddenFiles,
    ]).toEqual([]);
  });

  it('poisons parallel creative catalogs and required planning-projection handshakes', () => {
    const platformSrc = join(packageRoot, 'platform/src');
    const sourceFiles = [
      ...listFiles(agentSrc),
      ...listFiles(agentTypesSrc),
      ...listFiles(extensionSrc),
      ...listFiles(platformSrc),
    ]
      .filter((file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenPatterns = [
      /\bCreativeToolCatalog\b/,
      /\bCreativeCapabilityCatalog\b/,
      /\bProviderPurposeAllowlist\b/,
      /\bCreativeProviderPurposeMap\b/,
      /\bAgentCapabilityPlanningProjection\b/,
      /\bAgentCapabilityPlanningMetadata\b/,
      /\bCapabilityPlanningRuntime\b/,
      /\bPlanningProjectionHandshake\b/,
      /\bgetPlanningDomainIndex\b/,
      /\bdiscoverPlanningCapabilities\b/,
      /\binjectSelectedPlanningCapability\b/,
      /\bplanningProjectionRequired\b/,
      /\brequirePlanningProjection\b/,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );
    const forbiddenFiles = [
      join(agentTypesSrc, 'capability-planning.ts'),
      join(agentSrc, 'runtime/capability/agent-capability-planning-projection.ts'),
      join(agentSrc, 'runtime/capability/creative-capability-catalog.ts'),
      join(agentSrc, 'runtime/capability/capability-planning-runtime.ts'),
    ]
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect([...violations, ...forbiddenFiles]).toEqual([]);
  });

  it('poisons broad creative history snapshots and duplicated observation state', () => {
    const sourceFiles = [
      ...listFiles(agentSrc),
      ...listFiles(agentTypesSrc),
      ...listFiles(extensionSrc),
      ...listFiles(webviewSrc),
    ]
      .filter((file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenPatterns = [
      /\bCreativeObservationSnapshot\b/,
      /\bAgentCreativeObservationSnapshot\b/,
      /\bCreativeObservationAssembler\b/,
      /\bCreativeObservationContext\b/,
      /\bApprovalDecisionHistoryProjection\b/,
      /\bCreativeTargetCompletionEvaluator\b/,
      /\bcollectCreativeObservationFromHistory\b/,
      /\bscanCreativeHistoryPayloads\b/,
      /\bbuildCreativeObservationSnapshot\b/,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );
    const forbiddenFiles = [
      join(agentTypesSrc, 'creative-observation.ts'),
      join(agentSrc, 'runtime/creative-observation-assembler.ts'),
      join(agentSrc, 'runtime/creative-observation-context.ts'),
      join(agentSrc, 'runtime/creative-target-completion-evaluator.ts'),
      join(agentSrc, 'runtime/approval-decision-history-projection.ts'),
    ]
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect([...violations, ...forbiddenFiles]).toEqual([]);
  });

  it('keeps creative plan policy out of the generic Approval runtime', () => {
    const approvalSrc = join(agentSrc, 'approval');
    const sourceFiles = listFiles(approvalSrc)
      .filter((file) => file.endsWith('.ts') && !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenPatterns = [
      /\bApprovalBinding\b/,
      /\bCreatorReplan(?:Kind|Assessment)?\b/,
      /\bassessCreatorReplan\b/,
      /\bPlanApprovalStore\b/,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );
    const forbiddenFiles = [join(approvalSrc, 'creator-replan-policy.ts')]
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect([...violations, ...forbiddenFiles]).toEqual([]);
  });

  it('poisons global creative model matrices and executable Prompt-example catalogs', () => {
    const platformSrc = join(packageRoot, 'platform/src');
    const nekoSkillsSrc = join(workspaceRoot, 'packages/neko-skills/src');
    const sourceFiles = [
      ...listFiles(agentSrc),
      ...listFiles(agentTypesSrc),
      ...listFiles(extensionSrc),
      ...listFiles(platformSrc),
      ...listFiles(nekoSkillsSrc),
    ]
      .filter((file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file))
      .map((file) => ({
        relativePath: relative(workspaceRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenPatterns = [
      /\bGlobalModelCapabilityMatrix\b/,
      /\bCreativeModelCapabilityMatrix\b/,
      /\bAgentModelSupportMatrix\b/,
      /\bModelMarketingSupport\b/,
      /\binferCreativeMediaSupportFromModelName\b/,
      /\bpromoteSupportFromPromptExample\b/,
      /\bpromoteSupportFromHistoricalResult\b/,
      /\bCreativePromptManager\b/,
      /\bPromptExecutionCatalog\b/,
      /\bPromptExampleExecutionCatalog\b/,
      /\bPromptExampleRetrievalRuntime\b/,
      /\bPromptExampleResolverPrerequisite\b/,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );
    const forbiddenFiles = [
      join(agentSrc, 'provider/global-model-capability-matrix.ts'),
      join(agentSrc, 'prompt/creative-prompt-manager.ts'),
      join(agentSrc, 'prompt/prompt-execution-catalog.ts'),
      join(agentSrc, 'prompt/prompt-example-retrieval-runtime.ts'),
      join(agentTypesSrc, 'model-capability-matrix.ts'),
    ]
      .filter((file) => existsSync(file))
      .map((file) => relative(workspaceRoot, file).replace(/\\/g, '/'));

    expect([...violations, ...forbiddenFiles]).toEqual([]);
  });

  it('poisons retired IDC stage, persona, run, and executable-plan runtime paths', () => {
    const nekoSkillsSrc = join(workspaceRoot, 'packages/neko-skills/src');
    const productionFiles = [
      ...listFiles(agentSrc),
      ...listFiles(agentTypesSrc),
      ...listFiles(extensionSrc),
      ...listFiles(webviewSrc),
      ...listFiles(tuiSrc),
      ...listFiles(nekoSkillsSrc),
    ]
      .filter((file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file))
      .map((file) => ({
        relativePath: relative(workspaceRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenFiles = [
      join(agentTypesSrc, 'stage.ts'),
      join(agentTypesSrc, 'draft.ts'),
      join(agentTypesSrc, 'execution-plan.ts'),
      join(agentSrc, 'executor/stage-dispatcher.ts'),
      join(agentSrc, 'skill/activation/stage-activation-matrix.ts'),
      join(agentSrc, 'skill/activation/stage-planner.ts'),
      join(agentSrc, 'skill/activation/stage-registry.ts'),
      join(agentSrc, 'skill/stage-guardian.ts'),
      join(agentSrc, 'skill/stage-persona-binding.ts'),
      join(agentSrc, 'skill/stage-tracker.ts'),
      join(nekoSkillsSrc, 'builtins/creation-persona.ts'),
      join(nekoSkillsSrc, 'builtins/execution-persona.ts'),
      join(nekoSkillsSrc, 'builtins/iteration-persona.ts'),
    ]
      .filter((file) => existsSync(file))
      .map((file) => relative(workspaceRoot, file).replace(/\\/g, '/'));

    const forbiddenRuntimePatterns = [
      /\bIdcStage\b/,
      /\bStageActivationDecision\b/,
      /\bStagePersonaBinding\b/,
      /\bStageTracker\b/,
      /\bStageGuardian\b/,
      /\bstageTracking\??\s*:/,
      /\b(?:create|restore|resume|start)Idc(?:Run)?\b/i,
      /['"]stagePersona['"]/,
      /['"]creation-stage['"]/,
      /['"]EnterPlanMode['"]/,
      /['"]ExitPlanMode['"]/,
    ];
    const runtimeViolations = productionFiles.flatMap(({ relativePath, source }) =>
      forbiddenRuntimePatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect([...forbiddenFiles, ...runtimeViolations]).toEqual([]);
  });

  it('keeps Agent-native creation as prompt/profile guidance, not a parallel runtime or state store', () => {
    const forbiddenFiles = [
      'packages/neko-agent/packages/agent/src/runtime/agent-native-creation-runtime.ts',
      'packages/neko-agent/packages/agent/src/workspace/staged-creation-snapshot-reader.ts',
      'packages/neko-agent/packages/agent/src/workspace/staged-creation-snapshot-store.ts',
      'packages/neko-agent/packages/agent-types/src/creation-activity.ts',
    ];
    const existingForbiddenFiles = forbiddenFiles.filter((file) =>
      existsSync(join(repoRoot, file)),
    );

    expect(existingForbiddenFiles).toEqual([]);

    const sourceFiles = [
      ...listFiles(agentSrc),
      ...listFiles(join(packageRoot, 'agent-types/src')),
      ...listFiles(extensionSrc),
      ...listFiles(webviewSrc),
    ]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenPatterns = [
      /agent-native-creation-runtime/,
      /staged-creation-snapshot-(?:reader|store)/,
      /from ['"][^'"]*creation-activity['"]/,
      /\bAgentNativeCreationRuntime\b/,
      /\bcreateAgentNativeCreationRuntime\b/,
      /\bStagedCreationSnapshot\b/,
      /\bAgentCreationActivity\b/,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps new production code from importing legacy workflow trace DTOs as creation identity', () => {
    const allowedLegacyFiles = new Set([
      'packages/neko-agent/packages/agent-types/src/index.ts',
      'packages/neko-agent/packages/agent-types/src/webview-protocol.ts',
    ]);
    const sourceFiles = [
      ...listFiles(join(packageRoot, 'agent-types/src')),
      ...listFiles(agentSrc),
      ...listFiles(extensionSrc),
      ...listFiles(webviewSrc),
    ]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !allowedLegacyFiles.has(relativePath));

    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      [/from ['"]\.\/workflow['"]/, /from ['"]@neko-agent\/types['"][^;]*AgentWorkflow/]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
    expect(
      existsSync(join(repoRoot, 'packages/neko-agent/packages/agent-types/src/workflow.ts')),
    ).toBe(false);
  });

  it('keeps production task projection names creation-native outside explicit legacy trace files', () => {
    const sourceFiles = [...listFiles(join(packageRoot, 'agent-types/src')), ...listFiles(agentSrc)]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));

    const violations = sourceFiles.flatMap(({ relativePath, source }) => {
      const patterns = [
        /\bIIdcTaskProjection\b/,
        /\bIdcProjectedTask\b/,
        /\bcreateTaskManagerIdcTaskProjection\b/,
        /['"`]idc:\$\{/,
        /source:\s*['"]idc['"]/,
      ].filter((pattern) => {
        if (
          relativePath === 'packages/agent/src/task/task-manager.ts' &&
          String(pattern) === String(/['"`]idc:\$\{/)
        ) {
          return false;
        }
        return pattern.test(source);
      });
      return patterns.map((pattern) => `${relativePath} matches ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

});

function readSourceFiles(dir: string, include: (file: string) => boolean): string {
  return listFiles(dir)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter(include)
    .map((file) => readFileSync(file, 'utf-8'))
    .join('\n');
}

function stripTypeScriptComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function createObjectKeyPattern(key: string): RegExp {
  const escaped = escapeRegExp(key);
  const bareKey = /^[A-Za-z_$][\w$]*$/.test(key) ? escaped : '(?!)';
  return new RegExp(`(?:^|[,{]\\s*)(?:['"\`]${escaped}['"\`]|${bareKey})\\s*:`, 'm');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (excludedScanDirectories.has(entry)) {
      continue;
    }
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

const excludedScanDirectories = new Set(['node_modules', 'dist', '.turbo', 'coverage']);

function isTestFile(file: string): boolean {
  const name = basename(file);
  return (
    name.endsWith('.test.ts') ||
    name.endsWith('.test.tsx') ||
    name.endsWith('.spec.ts') ||
    name.endsWith('.spec.tsx')
  );
}
