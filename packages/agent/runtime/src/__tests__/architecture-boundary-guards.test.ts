import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const workspaceRoot = repoRoot;
const packageRoot = join(repoRoot, 'packages');
const agentSrc = join(packageRoot, 'agent/runtime/src');
const webviewSrc = join(packageRoot, 'agent/webview/src');
const extensionSrc = join(packageRoot, 'agent/extension/src');
const desktopMainSrc = join(workspaceRoot, 'apps/neko-desktop/src/main');
const desktopPreloadSrc = join(workspaceRoot, 'apps/neko-desktop/src/preload');
const tuiSrc = join(workspaceRoot, 'apps/neko-tui/src/tui');
const agentTypesSrc = join(packageRoot, 'agent/contracts/src');

describe('agent architecture boundary guards', () => {
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

  it('keeps the Webview production Markdown path on @neko/markdown without parallel parser dependencies', () => {
    const packageManifest = JSON.parse(
      readFileSync(join(packageRoot, 'agent/webview/package.json'), 'utf-8'),
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

  it('keeps runtime collaborators independent from host UI modules', () => {
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
      'document-module-diagnostics.ts',
      'index.ts',
      'plugin-transfer-runtime.ts',
      'resource-cache-runtime.ts',
    ]);
    const runtimeRootFiles = readdirSync(join(agentSrc, 'runtime'), { withFileTypes: true })
      .filter(
        (entry) => entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')),
      )
      .map((entry) => entry.name)
      .filter((name) => !allowedRuntimeRootFiles.has(name));

    expect(runtimeRootFiles).toEqual([]);
  });

  it('keeps runtime subdirectories narrow and documented', () => {
    const allowedRuntimeSubdirectories = new Set(['__tests__', 'capability', 'session', 'turn']);
    const runtimeSubdirectories = readdirSync(join(agentSrc, 'runtime'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !allowedRuntimeSubdirectories.has(name));

    expect(runtimeSubdirectories).toEqual([]);

    const readme = readFileSync(join(agentSrc, 'runtime/README.md'), 'utf-8');
    for (const name of ['turn/', 'capability/']) {
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

  it('keeps builtin Skill catalog localization out of the Desktop host adapter', () => {
    const source = stripTypeScriptComments(
      [
        readSourceFiles(desktopMainSrc, (file) => !isTestFile(file)),
        readSourceFiles(desktopPreloadSrc, (file) => !isTestFile(file)),
      ].join('\n'),
    );

    expect(source).not.toMatch(/\bBUILTIN_SKILL_LOCALES\b/);
    expect(source).not.toMatch(/\bconst\s+\w*SkillLocales\b/i);
    expect(listFiles(extensionSrc).filter((file) => /\.[cm]?[jt]sx?$/.test(file))).toEqual([]);
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
    const sharedSrc = join(workspaceRoot, 'packages/shared/src');
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
    const sharedSrc = join(workspaceRoot, 'packages/shared/src');
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
    const coreProjectionFiles = [join(agentTypesSrc, 'message.ts'), join(agentTypesSrc, 'tool.ts')];
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
      join(agentTypesSrc, 'work-item.ts'),
      join(agentTypesSrc, 'work-item-projector.ts'),
      join(agentSrc, 'validation/storyboard-output-validator.ts'),
      join(agentSrc, 'task/media-task-creative-entity.ts'),
      join(agentSrc, 'task/task-view-projector.ts'),
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
      join(
        workspaceRoot,
        'packages/neko-canvas/packages/extension/src/canvasCreativeAiExecutor.ts',
      ),
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
  });

  it('keeps Character domain runtime in @neko/chara', () => {
    for (const fileName of [
      'character-runtime-policy.ts',
      'character-evidence.ts',
      'character-dialogue-session.ts',
      'embody-character-session.ts',
    ]) {
      expect(existsSync(join(agentSrc, 'runtime', fileName)), fileName).toBe(false);
      expect(existsSync(join(workspaceRoot, 'packages/chara/src/core', fileName)), fileName).toBe(
        true,
      );
    }
    expect(
      existsSync(
        join(workspaceRoot, 'packages/chara/src/application/character-dialogue-runtime.ts'),
      ),
    ).toBe(true);
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
    expect(existsSync(join(agentSrc, 'tools/tool-registry.ts'))).toBe(false);
    const acpSource = readSourceFiles(join(agentSrc, 'acp'), (file) => !isTestFile(file));
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
      .filter((toolName) => createObjectKeyPattern(toolName).test(acpSource))
      .map((toolName) => `ACP application client contains localization key ${toolName}`);

    expect(violations).toEqual([]);
  });

  it('keeps media tool metadata on locator-only durable fields', () => {
    expect(existsSync(join(agentSrc, 'tools/tool-registry.ts'))).toBe(false);
    const acpSource = readSourceFiles(join(agentSrc, 'acp'), (file) => !isTestFile(file));
    expect(acpSource).not.toMatch(/referenceImage(?:Path|Url)/);
    expect(acpSource).not.toMatch(/(?:start|end)Frame(?:Path|Url)/);
    expect(acpSource).not.toMatch(/referenceVideo(?:Path|Url)/);
  });

  it('keeps domain tool permission defaults out of Agent core', () => {
    const permissionSource = [
      'permission/tool-traits-registry.ts',
      'permission/types.ts',
      'hooks/executor-hooks-factory.ts',
    ]
      .filter((relativePath) => existsSync(join(agentSrc, relativePath)))
      .map((relativePath) =>
        stripTypeScriptComments(readFileSync(join(agentSrc, relativePath), 'utf-8')),
      )
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

  it('keeps the retired Pi message turn runtime absent', () => {
    expect(existsSync(join(agentSrc, 'runtime/turn/message-runtime.ts'))).toBe(false);
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
      ...listFiles(join(packageRoot, 'agent/contracts/src')),
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
      readFileSync(join(repoRoot, 'packages/agent/runtime/package.json'), 'utf-8'),
    );
    const tsconfig = stripTypeScriptComments(
      readFileSync(join(repoRoot, 'packages/agent/runtime/tsconfig.json'), 'utf-8'),
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
      .map((pattern) => `packages/agent/runtime package config matches ${pattern}`);
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
    const sourceFiles = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', 'packages'],
      { cwd: workspaceRoot, encoding: 'utf-8' },
    )
      .split('\n')
      .filter(Boolean)
      .filter(
        (file) =>
          (file.endsWith('.ts') || file.endsWith('.tsx')) &&
          !isTestFile(file) &&
          !file.includes('__tests__/') &&
          existsSync(join(repoRoot, file)),
      )
      .map((relativePath) => ({
        relativePath,
        source: stripTypeScriptComments(readFileSync(join(repoRoot, relativePath), 'utf-8')),
      }));

    const allowedShimFiles = new Set([
      'packages/agent/runtime/src/runtime/backfill-coordinator.ts',
      'packages/agent/runtime/src/session/context-host-message.ts',
      'packages/agent/runtime/src/runtime/index.ts',
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
      if (allowedShimFiles.has(relativePath)) {
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
      join(packageRoot, 'agent/contracts/src'),
      join(packageRoot, 'agent/runtime/src'),
      join(packageRoot, 'platform/src'),
    ];
    const allowedSanitizers = new Set([
      'packages/agent/runtime/src/input/message-resource-projector.ts',
      'packages/agent/runtime/src/session/working-memory.ts',
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

  it('keeps Agent and Desktop hosts from re-owning project search aggregation policy', () => {
    const sourceFiles = [agentSrc, desktopMainSrc, desktopPreloadSrc]
      .flatMap(listFiles)
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
    const policyViolations = sourceFiles.flatMap(({ file, source }) =>
      forbiddenLocalPolicyHelpers
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(repoRoot, file)} matches ${pattern}`),
    );

    expect(policyViolations).toEqual([]);
    expect(existsSync(join(packageRoot, 'search/domain/src/core/aggregation.ts'))).toBe(true);
    expect(
      existsSync(join(packageRoot, 'search/domain/src/entity/project-search-projection.ts')),
    ).toBe(true);
    expect(listFiles(extensionSrc).filter((file) => /\.[cm]?[jt]sx?$/.test(file))).toEqual([]);
  });

  it('keeps prompt-chain guidance free of creation observation state', () => {
    const sourceFiles = [
      ...listFiles(agentSrc),
      ...listFiles(join(packageRoot, 'agent/contracts/src')),
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

  it('keeps Agent-native creation as prompt/profile guidance, not a parallel runtime or state store', () => {
    const forbiddenFiles = [
      'packages/agent/runtime/src/runtime/agent-native-creation-runtime.ts',
      'packages/agent/runtime/src/workspace/staged-creation-snapshot-reader.ts',
      'packages/agent/runtime/src/workspace/staged-creation-snapshot-store.ts',
      'packages/agent/contracts/src/creation-activity.ts',
    ];
    const existingForbiddenFiles = forbiddenFiles.filter((file) =>
      existsSync(join(repoRoot, file)),
    );

    expect(existingForbiddenFiles).toEqual([]);

    const sourceFiles = [
      ...listFiles(agentSrc),
      ...listFiles(join(packageRoot, 'agent/contracts/src')),
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
  if (!existsSync(dir)) return [];
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
