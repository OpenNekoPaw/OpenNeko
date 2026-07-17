#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const repoRoot = process.cwd();

const packageRoots = {
  webview: 'packages/neko-agent/packages/webview/src',
  extension: 'packages/neko-agent/packages/extension/src',
  agent: 'packages/neko-agent/packages/agent/src',
  platform: 'packages/neko-agent/packages/platform/src',
  'ai-sdk': 'packages/neko-agent/packages/ai-sdk/src',
  'agent-types': 'packages/neko-agent/packages/agent-types/src',
  tui: 'apps/neko-tui/src',
  assets: 'packages/neko-assets/src',
};

const packageDirs = {
  webview: 'packages/neko-agent/packages/webview',
  extension: 'packages/neko-agent/packages/extension',
};

const hostAgnosticScopes = new Set(['agent', 'platform', 'ai-sdk', 'agent-types']);
const agentContentAccessResidualScopes = new Set(['extension', 'agent', 'agent-types', 'webview']);

const retiredTranscriptAuthorityFiles = [
  'packages/neko-agent/packages/agent/src/session/conversation-manager.ts',
  'packages/neko-agent/packages/agent/src/session/conversation-resume-storage.ts',
  'packages/neko-agent/packages/agent/src/session/history-hydration.ts',
  'packages/neko-agent/packages/agent/src/session/journal-projection.ts',
  'packages/neko-agent/packages/agent/src/session/journal-reader.ts',
  'packages/neko-agent/packages/agent/src/session/journal-storage.ts',
  'packages/neko-agent/packages/agent/src/session/journal-writer.ts',
  'packages/neko-agent/packages/agent/src/session/node-sqlite-conversation-storage.ts',
  'packages/neko-agent/packages/agent/src/session/sqlite-conversation-storage.ts',
  'packages/neko-agent/packages/extension/src/chat/extensionConversationResume.ts',
  'apps/neko-tui/src/tui/host/tui-sqlite-conversation-storage.ts',
];

const retiredTranscriptAuthoritySymbols = [
  'ConversationManager',
  'ConversationResumeStorage',
  'JournalProjection',
  'JournalReader',
  'createNodeJournalStorage',
  'createNodeSqliteConversationStorage',
  'createConversationPersistenceRuntime',
  'projectJournalHistoryWithToolContext',
  'migrateLegacyConversationCatalog',
];

const retiredLegacyChatFiles = [
  'packages/neko-assets/src/services/LLMClassifier.ts',
  'packages/neko-agent/packages/platform/src/service/internal-chat-runtime.ts',
  'packages/neko-agent/packages/ai-sdk/src/bridge/index.ts',
  'packages/neko-agent/packages/ai-sdk/src/bridge/legacy-image-model.ts',
  'packages/neko-agent/packages/ai-sdk/src/bridge/legacy-video-model.ts',
  'packages/neko-agent/packages/ai-sdk/src/bridge/legacy-video-model.test.ts',
  'packages/neko-agent/packages/ai-sdk/src/bridge/legacy-speech-model.ts',
  'apps/neko-tui/src/tui/host/node-perception-pipeline.ts',
  'packages/neko-agent/packages/platform/src/perception/gemini-video-understanding-client.ts',
  'packages/neko-agent/packages/platform/src/perception/__tests__/gemini-video-understanding-client.test.ts',
];

const retiredLegacyChatSymbols = [
  'neko.agent.internalChat',
  'runInternalChatRuntime',
  'LLMClassifier',
  'createLegacyBridgeProvider',
  'LegacyMediaAdapter',
  'allowLegacyBridge',
  'AI_SDK_LEGACY_BRIDGE',
  'legacy-bridge',
  'GeminiVideoUnderstandingClient',
];

const compatibilityExceptions = [];

const requiredCompatibilityExceptionFields = [
  'id',
  'file',
  'reason',
  'owner',
  'tracking',
  'introducedAt',
  'replacement',
  'severityAfterExpiry',
];

const compatibilityExceptionExpirySeverities = new Set(['failure', 'warning']);
const lcdRegisterPath = 'quality/ledgers/agent-code-debt-lcd-register.json';
const lcdCategories = new Set([
  'confirmed-dead-code',
  'static-analysis-false-positive',
  'canonical-compatibility',
  'migration-adapter',
  'stray-surface',
  'misplaced-domain-logic',
  'runtime-fallback-resilience',
]);
const lcdSemanticClasses = new Set([
  'delete-now',
  'migrate-now',
  'current-bridge',
  'runtime-resilience',
  'boundary-canonicalizer',
  'test-only',
  'domain-status',
  'false-positive-word',
]);
const lcdStatuses = new Set(['active', 'removed', 'planned']);
const requiredLcdEntryFields = [
  'id',
  'package',
  'surface',
  'kind',
  'semanticClass',
  'status',
  'owner',
  'replacement',
  'removeAfter',
];
const requiredLcdProviderSunsetFields = [
  'provider',
  'providerType',
  'taskFamilies',
  'resolverPath',
  'nativeSupportStatus',
  'migrationConditions',
  'removalTrigger',
  'protectingTests',
];
const runnerIndividualEventProperties = [
  'onDidStart',
  'onDidStop',
  'onDidRequestConfirmation',
  'onDidSubAgentEvent',
];

const runnerIndividualEventAllowedFiles = new Set([
  'packages/neko-agent/packages/extension/src/ai/agentRunner.ts',
  'packages/neko-agent/packages/extension/src/ai/agentRunnerVscodeEventBridge.ts',
  'packages/neko-agent/packages/extension/src/ai/agentRunner.test.ts',
  'packages/neko-agent/packages/extension/src/ai/agentRunnerVscodeEventBridge.test.ts',
]);

const forbiddenAgentContentAccessResiduals = [
  'DocumentReaderService',
  '@neko/platform/document',
  'documentPathResolver',
  'documentResourceCacheService',
  'resolveDocumentPath',
  'loadAuthorizedMediaLibraryReadRoots',
  'setDocumentAuthorizedReadRoots',
  'image_paths',
  'include_image_paths',
  'image_path_limit',
  'cachePath',
  'runtimePath',
  'imagePaths',
  'document-reader',
  'document-image-cache',
  'neko_epub_',
];

const rules = [
  {
    id: 'webview-no-direct-vscode',
    scopes: ['webview'],
    reason:
      'Webview must use the shared VSCode webview wrapper, not the VSCode extension API package.',
    match: ({ specifier }) => isPackage(specifier, 'vscode'),
  },
  {
    id: 'webview-no-core-agent-runtime',
    scopes: ['webview'],
    reason:
      'Webview must render/project state and must not import core agent runtime/business logic.',
    match: ({ specifier }) =>
      isPackage(specifier, '@neko/agent') ||
      isPackage(specifier, '@neko/platform') ||
      isPackage(specifier, '@neko/ai-sdk'),
  },
  {
    id: 'webview-no-extension-api',
    scopes: ['webview'],
    reason: 'Webview must not import Extension package APIs.',
    match: ({ specifier, file }) =>
      isPackage(specifier, '@neko-agent/extension') ||
      pointsIntoPackage(file, specifier, 'extension'),
  },
  {
    id: 'extension-no-react',
    scopes: ['extension'],
    reason: 'Extension host must not import React runtime or React DOM.',
    match: ({ specifier }) => isReactRuntime(specifier),
  },
  {
    id: 'extension-no-webview-api',
    scopes: ['extension'],
    reason:
      'Extension must communicate through protocol/host adapters, not import Webview implementation.',
    match: ({ specifier, file }) =>
      isPackage(specifier, '@neko-agent/webview') || pointsIntoPackage(file, specifier, 'webview'),
  },
  {
    id: 'host-agnostic-no-vscode',
    scopes: [...hostAgnosticScopes],
    reason: 'Agent, Platform, AI SDK, and shared agent types must remain host-agnostic.',
    match: ({ specifier }) =>
      isPackage(specifier, 'vscode') || isPackage(specifier, '@neko/shared/vscode'),
  },
  {
    id: 'host-agnostic-no-react',
    scopes: [...hostAgnosticScopes],
    reason: 'Host-agnostic packages must not depend on React or React DOM.',
    match: ({ specifier }) => isReactRuntime(specifier),
  },
  {
    id: 'host-agnostic-no-webview-api',
    scopes: [...hostAgnosticScopes],
    reason: 'Host-agnostic packages must not import Webview implementation APIs.',
    match: ({ specifier, file }) =>
      isPackage(specifier, '@neko-agent/webview') || pointsIntoPackage(file, specifier, 'webview'),
  },
  {
    id: 'host-agnostic-no-extension-api',
    scopes: [...hostAgnosticScopes],
    reason: 'Host-agnostic packages must not import Extension implementation APIs.',
    match: ({ specifier, file }) =>
      isPackage(specifier, '@neko-agent/extension') ||
      pointsIntoPackage(file, specifier, 'extension'),
  },
];

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  runBoundaryCheck();
}

function runBoundaryCheck() {
  const findings = [];
  let checkedFiles = 0;

  for (const [scope, root] of Object.entries(packageRoots)) {
    const absoluteRoot = resolve(repoRoot, root);
    for (const file of walk(absoluteRoot)) {
      checkedFiles += 1;
      const content = readFileSync(file, 'utf8');
      findings.push(...findImportViolations(scope, file, content));
      findings.push(...findRunnerIndividualEventUsageViolations(scope, file, content));
      findings.push(...findWebviewReExportShimViolations(scope, file, content));
      findings.push(...findHostNeutralResidualViolations(scope, file, content));
      findings.push(...findAgentContentAccessResidualViolations(scope, file, content));
      findings.push(...findCanvasBoardRetiredPathViolations(scope, file, content));
      findings.push(...findPiAgentTurnBridgeLegacyViolations(scope, file, content));
      findings.push(...findRetiredTranscriptAuthorityViolations(scope, file, content));
      findings.push(...findRetiredLegacyChatViolations(scope, file, content));
      findings.push(...findSkillLocatorBoundaryViolations(scope, file, content));
    }
  }
  findings.push(...findRetiredTranscriptAuthorityFileViolations());
  findings.push(...findRetiredLegacyChatFileViolations());
  findings.push(...findLegacyCentralizedToolRegistrationViolations());

  const compatibility = evaluateCompatibilityExceptions(compatibilityExceptions, {
    validationDate: new Date(),
  });
  const lcdRegister = evaluateLcdRegister(loadLcdRegister(), {
    registerPath: lcdRegisterPath,
  });
  const blockingCompatibilityFindings = compatibility.findings.filter(
    (finding) => finding.severity === 'failure',
  );
  const blockingLcdFindings = lcdRegister.findings.filter(
    (finding) => finding.severity === 'failure',
  );
  const result = {
    status:
      findings.length > 0 ||
      blockingCompatibilityFindings.length > 0 ||
      blockingLcdFindings.length > 0
        ? 'failed'
        : 'passed',
    checkedFiles,
    scopes: Object.keys(packageRoots),
    compatibilityExceptions: compatibility.exceptions,
    compatibilityFindings: compatibility.findings,
    lcdRegister: lcdRegister.summary,
    lcdFindings: lcdRegister.findings,
    findings,
  };

  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exit(1);
  }

  process.stdout.write(output);
}

function runSelfTest() {
  const importCases = [
    {
      name: 'webview importing core runtime fails',
      scope: 'webview',
      file: fakeFile('webview', 'src/App.tsx'),
      content: "import { createAgentSessionWithRuntime } from '@neko/agent/runtime';\n",
      expectedRuleIds: ['webview-no-core-agent-runtime'],
    },
    {
      name: 'agent runtime importing vscode fails',
      scope: 'agent',
      file: fakeFile('agent', 'src/runtime/example.ts'),
      content: "import * as vscode from 'vscode';\n",
      expectedRuleIds: ['host-agnostic-no-vscode'],
    },
    {
      name: 'extension importing react fails',
      scope: 'extension',
      file: fakeFile('extension', 'src/index.ts'),
      content: "import React from 'react';\n",
      expectedRuleIds: ['extension-no-react'],
    },
    {
      name: 'host agnostic importing webview API fails',
      scope: 'platform',
      file: fakeFile('platform', 'src/index.ts'),
      content: "import { App } from '@neko-agent/webview';\n",
      expectedRuleIds: ['host-agnostic-no-webview-api'],
    },
    {
      name: 'webview protocol and shared wrapper imports pass',
      scope: 'webview',
      file: fakeFile('webview', 'src/messages/index.ts'),
      content:
        "import { getVSCodeAPI } from '@neko/shared/vscode';\nimport type { WebviewToExtensionMessage } from '@neko-agent/types';\n",
      expectedRuleIds: [],
    },
    {
      name: 'extension consumer using individual runner event fails',
      scope: 'extension',
      file: fakeFile('extension', 'src/chat/example.ts'),
      content: 'runner.onDidStop(() => undefined);\n',
      expectedRuleIds: ['extension-no-new-runner-individual-events'],
    },
    {
      name: 'runner vscode event bridge individual runner events pass',
      scope: 'extension',
      file: resolve(
        repoRoot,
        'packages/neko-agent/packages/extension/src/ai/agentRunnerVscodeEventBridge.ts',
      ),
      content: 'this.onDidStopEmitter.fire();\n',
      expectedRuleIds: [],
    },
    {
      name: 'webview pure re-export shim fails',
      scope: 'webview',
      file: fakeFile('webview', 'src/utils/message-helpers.ts'),
      content: "export { addToolCallBlock } from '../presenters/message-presenter';\n",
      expectedRuleIds: ['webview-no-re-export-compat-shim'],
    },
    {
      name: 'host-neutral ForWebview canonical export fails',
      scope: 'agent',
      file: fakeFile('agent', 'src/runtime/turn.ts'),
      content: 'export function runAgentTurnForWebviewRuntime() {}\n',
      expectedRuleIds: ['host-neutral-no-webview-runtime-contract'],
    },
    {
      name: 'platform localPaths successful DTO field fails',
      scope: 'platform',
      file: fakeFile('platform', 'src/media/result.ts'),
      content: 'export interface Result { localPaths: string[]; }\n',
      expectedRuleIds: ['host-neutral-no-local-path-contract'],
    },
    {
      name: 'agent content access residual fields fail in tests too',
      scope: 'extension',
      file: fakeFile('extension', 'src/tools/__tests__/read-image.test.ts'),
      content: "const args = { image_paths: ['/tmp/page.png'] };\n",
      expectedRuleIds: ['agent-no-content-access-residuals'],
    },
    {
      name: 'Canvas Board runtime cannot restore retired active/raw/structured fallbacks',
      scope: 'extension',
      file: fakeFile('extension', 'src/services/agentCanvasBoardLegacy.ts'),
      content:
        "import { writeFile } from 'node:fs/promises';\nconst target = activeCanvas ?? recentCanvas;\nvoid requestCanvasAuthoringHandoff(target);\nvoid canvas_create_node(target);\nvoid writeFile('board.nkc', '{}');\n",
      expectedRuleIds: ['extension-no-retired-canvas-board-path'],
    },
    {
      name: 'Pi Agent turn bridge cannot restore AgentRunner execution',
      scope: 'extension',
      file: resolve(
        repoRoot,
        'packages/neko-agent/packages/extension/src/chat/message/agentTurnBridge.ts',
      ),
      content: 'return runAgentTurnRuntime(input);\n',
      expectedRuleIds: ['extension-pi-turn-bridge-no-legacy-runtime'],
    },
    {
      name: 'Pi provider runtime cannot restore GenericAdapter chat execution',
      scope: 'extension',
      file: resolve(
        repoRoot,
        'packages/neko-agent/packages/extension/src/ai/vscodePiRuntimeManager.ts',
      ),
      content: 'return new GenericAdapter(config);\n',
      expectedRuleIds: ['extension-pi-provider-no-legacy-chat'],
    },
    {
      name: 'Pi quality perception cannot restore Platform chat model resolution',
      scope: 'extension',
      file: resolve(
        repoRoot,
        'packages/neko-agent/packages/extension/src/tools/qualityCapabilityProvider.ts',
      ),
      content: 'const service = platform.createService();\nresolveModelForPurpose("image.understand");\n',
      expectedRuleIds: ['extension-pi-perception-no-legacy-chat'],
    },
    {
      name: 'Pi image perception cannot restore model arguments or Platform chat execution',
      scope: 'extension',
      file: resolve(
        repoRoot,
        'packages/neko-agent/packages/extension/src/tools/perceptionCapabilityProvider.ts',
      ),
      content:
        'const service = platform.createService();\nresolveModelForPurpose("image.understand");\nconst modelId = args["modelId"];\n',
      expectedRuleIds: ['extension-pi-perception-no-legacy-chat'],
    },
    {
      name: 'Domain media generation cannot restore model-authored or nested media routing',
      scope: 'platform',
      file: resolve(
        repoRoot,
        'packages/neko-agent/packages/platform/src/media/media-agent-tools.ts',
      ),
      content:
        'const mediaModels = options?.metadata?.mediaModels;\nreturn argProviderId ?? runtimeTarget?.providerId;\n',
      expectedRuleIds: ['platform-pi-media-no-legacy-model-routing'],
    },
    {
      name: 'Domain media cannot restore the Platform chat provider registry',
      scope: 'platform',
      file: resolve(
        repoRoot,
        'packages/neko-agent/packages/platform/src/media/media-task-executor.ts',
      ),
      content: 'const providers = new ProviderRegistry(config);\n',
      expectedRuleIds: ['platform-media-no-legacy-chat-registry'],
    },
    {
      name: 'Extension cannot restore a retired transcript reader',
      scope: 'extension',
      file: fakeFile('extension', 'src/chat/transcript-loader.ts'),
      content: 'return new JournalReader(options);\n',
      expectedRuleIds: ['pi-session-no-retired-transcript-authority'],
    },
    {
      name: 'TUI local metadata may not restore transcript migration',
      scope: 'tui',
      file: resolve(repoRoot, 'apps/neko-tui/src/tui/host/tui-local-metadata-binding.ts'),
      content: 'return migrateLegacyConversationCatalog(records);\n',
      expectedRuleIds: ['pi-session-no-retired-transcript-authority'],
    },
    {
      name: 'Extension cannot restore the cross-extension Platform chat command',
      scope: 'extension',
      file: fakeFile('extension', 'src/commands/internal-chat.ts'),
      content: "return runInternalChatRuntime('neko.agent.internalChat');\n",
      expectedRuleIds: ['pi-runtime-no-retired-legacy-chat'],
    },
    {
      name: 'AI SDK cannot restore the MediaAdapter compatibility bridge',
      scope: 'ai-sdk',
      file: fakeFile('ai-sdk', 'src/resolve.ts'),
      content: 'return createLegacyBridgeProvider(config, adapter, { allowLegacyBridge: true });\n',
      expectedRuleIds: ['pi-runtime-no-retired-legacy-chat'],
    },
    {
      name: 'non-designated content access cannot recognize Skill locators',
      scope: 'extension',
      file: fakeFile('extension', 'src/services/content-access.ts'),
      content: "if (path.startsWith('/__neko_skills/')) return readFile(path);\n",
      expectedRuleIds: ['pi-skill-locator-designated-read-only'],
    },
    {
      name: 'designated Pi Skill boundary may recognize Skill locators',
      scope: 'agent',
      file: resolve(
        repoRoot,
        'packages/neko-agent/packages/agent/src/pi/conversation-runtime.ts',
      ),
      content: "const namespace = '/__neko_skills/';\n",
      expectedRuleIds: [],
    },
  ];

  const failures = [];
  for (const testCase of importCases) {
    const violations = [
      ...findImportViolations(testCase.scope, testCase.file, testCase.content),
      ...findRunnerIndividualEventUsageViolations(testCase.scope, testCase.file, testCase.content),
      ...findWebviewReExportShimViolations(testCase.scope, testCase.file, testCase.content),
      ...findHostNeutralResidualViolations(testCase.scope, testCase.file, testCase.content),
      ...findAgentContentAccessResidualViolations(testCase.scope, testCase.file, testCase.content),
      ...findCanvasBoardRetiredPathViolations(testCase.scope, testCase.file, testCase.content),
      ...findPiAgentTurnBridgeLegacyViolations(testCase.scope, testCase.file, testCase.content),
      ...findRetiredTranscriptAuthorityViolations(testCase.scope, testCase.file, testCase.content),
      ...findRetiredLegacyChatViolations(testCase.scope, testCase.file, testCase.content),
      ...findSkillLocatorBoundaryViolations(testCase.scope, testCase.file, testCase.content),
    ];
    const actualIds = [...new Set(violations.map((violation) => violation.ruleId))].sort();
    const expectedIds = [...testCase.expectedRuleIds].sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      failures.push({
        name: testCase.name,
        expectedRuleIds: expectedIds,
        actualRuleIds: actualIds,
        violations,
      });
    }
  }

  const centralizedToolCases = [
    {
      name: 'toolBootstrap domain tool registration fails',
      content: 'const tools = [createReadDocumentTool(deps), createSemanticCoverageTool()];\n',
      expectedRuleIds: ['extension-no-legacy-centralized-tool-registration'],
    },
    {
      name: 'toolBootstrap agent-owned meta-tool registration passes',
      content: 'const tools = createPluginSkillDiscoveryTools(source, logger);\n',
      expectedRuleIds: [],
    },
  ];

  for (const testCase of centralizedToolCases) {
    const violations = findLegacyCentralizedToolRegistrationViolationsFromContent(
      testCase.content,
      'packages/neko-agent/packages/extension/src/bootstrap/toolBootstrap.ts',
    );
    const actualIds = [...new Set(violations.map((violation) => violation.ruleId))].sort();
    const expectedIds = [...testCase.expectedRuleIds].sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      failures.push({
        name: testCase.name,
        expectedRuleIds: expectedIds,
        actualRuleIds: actualIds,
        violations,
      });
    }
  }

  const compatibilityCases = [
    {
      name: 'exception without metadata fails',
      exceptions: [
        {
          id: 'missing-owner',
          file: 'packages/neko-agent/packages/extension/src/ai/example.ts',
          reason: 'Missing required lifecycle fields.',
          tracking: 'openspec:test',
          introducedAt: '2026-05-04',
          expiresAt: '2026-05-05',
          replacement: 'test replacement',
          severityAfterExpiry: 'failure',
        },
      ],
      validationDate: '2026-05-04',
      expectedCodes: ['missing-metadata'],
    },
    {
      name: 'unexpired exception is visible but allowed',
      exceptions: [
        createSelfTestCompatibilityException({
          id: 'unexpired-test',
          expiresAt: '2026-05-05',
          severityAfterExpiry: 'failure',
        }),
      ],
      validationDate: '2026-05-04',
      expectedCodes: [],
      expectedStatuses: ['active'],
    },
    {
      name: 'expired failure exception blocks guard',
      exceptions: [
        createSelfTestCompatibilityException({
          id: 'expired-test',
          expiresAt: '2026-05-03',
          severityAfterExpiry: 'failure',
        }),
      ],
      validationDate: '2026-05-04',
      expectedCodes: ['expired-exception'],
      expectedStatuses: ['expired'],
    },
    {
      name: 'renewed exception requires rationale',
      exceptions: [
        createSelfTestCompatibilityException({
          id: 'renewed-without-rationale',
          expiresAt: '2026-05-06',
          previousExpiresAt: '2026-05-03',
        }),
      ],
      validationDate: '2026-05-04',
      expectedCodes: ['missing-renewal-rationale'],
    },
    {
      name: 'renewed exception with rationale passes metadata validation',
      exceptions: [
        createSelfTestCompatibilityException({
          id: 'renewed-with-rationale',
          expiresAt: '2026-05-06',
          previousExpiresAt: '2026-05-03',
          renewalRationale: 'Bridge split needs one more focused migration window.',
        }),
      ],
      validationDate: '2026-05-04',
      expectedCodes: [],
      expectedStatuses: ['active'],
    },
  ];

  for (const testCase of compatibilityCases) {
    const evaluated = evaluateCompatibilityExceptions(testCase.exceptions, {
      validationDate: new Date(`${testCase.validationDate}T00:00:00.000Z`),
    });
    const actualCodes = [...new Set(evaluated.findings.map((finding) => finding.code))].sort();
    const expectedCodes = [...testCase.expectedCodes].sort();
    const actualStatuses = evaluated.exceptions.map((exception) => exception.expiryStatus).sort();
    const expectedStatuses = [...(testCase.expectedStatuses ?? actualStatuses)].sort();

    if (
      JSON.stringify(actualCodes) !== JSON.stringify(expectedCodes) ||
      JSON.stringify(actualStatuses) !== JSON.stringify(expectedStatuses)
    ) {
      failures.push({
        name: testCase.name,
        expectedCodes,
        actualCodes,
        expectedStatuses,
        actualStatuses,
        evaluated,
      });
    }
  }

  const lcdCases = [
    {
      name: 'LCD entry without owner fails',
      register: createSelfTestLcdRegister([
        {
          id: 'LCD-TEST-001',
          package: 'neko-agent',
          surface: 'test surface',
          kind: 'migration-adapter',
          status: 'active',
          replacement: 'test replacement',
          removeAfter: 'test removal',
          tests: ['pnpm check:agent-boundaries'],
        },
      ]),
      expectedCodes: ['missing-lcd-metadata'],
    },
    {
      name: 'LCD-009 without provider sunset rows fails',
      register: createSelfTestLcdRegister([
        createSelfTestLcdEntry({
          id: 'LCD-009',
          surface: 'packages/neko-agent/packages/ai-sdk/src/bridge/*',
          kind: 'migration-adapter',
          status: 'active',
          sunsetProviders: [],
        }),
      ]),
      expectedCodes: ['missing-provider-sunset'],
    },
    {
      name: 'LCD-009 with incomplete provider sunset rows fails',
      register: createSelfTestLcdRegister([
        createSelfTestLcdEntry({
          id: 'LCD-009',
          surface: 'packages/neko-agent/packages/ai-sdk/src/bridge/*',
          kind: 'migration-adapter',
          status: 'active',
          sunsetProviders: [
            createSelfTestProviderSunsetRow({ providerType: 'fal' }),
            createSelfTestProviderSunsetRow({ providerType: 'dashscope' }),
            createSelfTestProviderSunsetRow({ providerType: 'kling' }),
          ],
        }),
      ]),
      expectedCodes: ['missing-provider-sunset'],
    },
    {
      name: 'valid LCD register passes metadata validation',
      register: createSelfTestLcdRegister([
        createSelfTestLcdEntry({
          id: 'LCD-TEST-002',
          status: 'removed',
        }),
      ]),
      expectedCodes: [],
    },
  ];

  for (const testCase of lcdCases) {
    const evaluated = evaluateLcdRegister(testCase.register, {
      registerPath: 'self-test-lcd-register.json',
      skipTestFileExistence: true,
    });
    const actualCodes = [...new Set(evaluated.findings.map((finding) => finding.code))].sort();
    const expectedCodes = [...testCase.expectedCodes].sort();
    if (JSON.stringify(actualCodes) !== JSON.stringify(expectedCodes)) {
      failures.push({
        name: testCase.name,
        expectedCodes,
        actualCodes,
        evaluated,
      });
    }
  }

  const result = {
    status: failures.length > 0 ? 'failed' : 'passed',
    cases: importCases.length + compatibilityCases.length + lcdCases.length,
    failures,
  };

  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (failures.length > 0) {
    process.stderr.write(output);
    process.exit(1);
  }
  process.stdout.write(output);
}

function evaluateCompatibilityExceptions(exceptions, options) {
  const validationDate = options.validationDate;
  const findings = [];
  const seenIds = new Set();
  const seenFiles = new Set();
  const evaluatedExceptions = exceptions.map((exception, index) => {
    const missingFields = requiredCompatibilityExceptionFields.filter(
      (field) => !hasNonEmptyString(exception[field]),
    );
    const hasExpiry =
      hasNonEmptyString(exception.expiresAt) || hasNonEmptyString(exception.sunsetMilestone);

    if (!hasExpiry) {
      missingFields.push('expiresAt/sunsetMilestone');
    }

    if (missingFields.length > 0) {
      findings.push({
        code: 'missing-metadata',
        severity: 'failure',
        id: exception.id ?? `compatibility-exception-${index + 1}`,
        file: exception.file,
        missingFields,
        reason: 'Compatibility exceptions must include lifecycle metadata.',
      });
    }

    if (hasNonEmptyString(exception.id)) {
      if (seenIds.has(exception.id)) {
        findings.push({
          code: 'duplicate-exception-id',
          severity: 'failure',
          id: exception.id,
          file: exception.file,
          reason: 'Compatibility exception ids must be unique.',
        });
      }
      seenIds.add(exception.id);
    }

    if (hasNonEmptyString(exception.file)) {
      if (seenFiles.has(exception.file)) {
        findings.push({
          code: 'duplicate-exception-file',
          severity: 'failure',
          id: exception.id,
          file: exception.file,
          reason: 'Each compatibility exception file should have one lifecycle record.',
        });
      }
      seenFiles.add(exception.file);
    }

    if (
      hasNonEmptyString(exception.severityAfterExpiry) &&
      !compatibilityExceptionExpirySeverities.has(exception.severityAfterExpiry)
    ) {
      findings.push({
        code: 'invalid-expiry-severity',
        severity: 'failure',
        id: exception.id,
        file: exception.file,
        severityAfterExpiry: exception.severityAfterExpiry,
        reason: 'severityAfterExpiry must be either failure or warning.',
      });
    }

    const expiryStatus = getCompatibilityExceptionExpiryStatus(exception, validationDate);
    if (expiryStatus === 'invalid-expiry') {
      findings.push({
        code: 'invalid-expiry-date',
        severity: 'failure',
        id: exception.id,
        file: exception.file,
        expiresAt: exception.expiresAt,
        reason: 'expiresAt must use YYYY-MM-DD.',
      });
    }

    if (expiryStatus === 'expired') {
      findings.push({
        code: 'expired-exception',
        severity: exception.severityAfterExpiry === 'warning' ? 'warning' : 'failure',
        id: exception.id,
        file: exception.file,
        expiresAt: exception.expiresAt,
        replacement: exception.replacement,
        reason: 'Compatibility exception has expired.',
      });
    }

    if (
      hasNonEmptyString(exception.previousExpiresAt) &&
      !hasNonEmptyString(exception.renewalRationale)
    ) {
      findings.push({
        code: 'missing-renewal-rationale',
        severity: 'failure',
        id: exception.id,
        file: exception.file,
        previousExpiresAt: exception.previousExpiresAt,
        expiresAt: exception.expiresAt,
        reason: 'Renewed compatibility exceptions must include renewalRationale.',
      });
    }

    return {
      ...exception,
      expiryStatus,
    };
  });

  return {
    exceptions: evaluatedExceptions,
    findings,
  };
}

function loadLcdRegister() {
  const absolutePath = resolve(repoRoot, lcdRegisterPath);
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    return {
      __loadError: error instanceof Error ? error.message : String(error),
    };
  }
}

function evaluateLcdRegister(register, options = {}) {
  const findings = [];
  const entries = Array.isArray(register?.entries) ? register.entries : [];
  const registerPath = options.registerPath ?? lcdRegisterPath;

  if (register?.__loadError) {
    findings.push({
      code: 'lcd-register-load-failed',
      severity: 'failure',
      file: registerPath,
      reason: register.__loadError,
    });
  }

  if (!Array.isArray(register?.categories)) {
    findings.push({
      code: 'missing-lcd-categories',
      severity: 'failure',
      file: registerPath,
      reason: 'LCD register must list approved cleanup categories.',
    });
  } else {
    const missingCategories = Array.from(lcdCategories).filter(
      (category) => !register.categories.includes(category),
    );
    if (missingCategories.length > 0) {
      findings.push({
        code: 'missing-lcd-category',
        severity: 'failure',
        file: registerPath,
        missingCategories,
      });
    }
  }

  if (!Array.isArray(register?.semanticClasses)) {
    findings.push({
      code: 'missing-lcd-semantic-classes',
      severity: 'failure',
      file: registerPath,
      reason: 'LCD register must list approved prelaunch cleanup semantic classes.',
    });
  } else {
    const missingSemanticClasses = Array.from(lcdSemanticClasses).filter(
      (semanticClass) => !register.semanticClasses.includes(semanticClass),
    );
    if (missingSemanticClasses.length > 0) {
      findings.push({
        code: 'missing-lcd-semantic-class',
        severity: 'failure',
        file: registerPath,
        missingSemanticClasses,
      });
    }
  }

  const seenIds = new Set();
  for (const [index, entry] of entries.entries()) {
    const id = hasNonEmptyString(entry?.id) ? entry.id : `lcd-entry-${index + 1}`;
    const missingFields = requiredLcdEntryFields.filter((field) => {
      if (field === 'tests') return false;
      return !hasNonEmptyString(entry?.[field]);
    });
    if (!Array.isArray(entry?.tests) || entry.tests.length === 0) {
      missingFields.push('tests');
    }

    if (missingFields.length > 0) {
      findings.push({
        code: 'missing-lcd-metadata',
        severity: 'failure',
        id,
        missingFields,
        reason: 'LCD entries must include lifecycle metadata.',
      });
    }

    if (seenIds.has(id)) {
      findings.push({
        code: 'duplicate-lcd-id',
        severity: 'failure',
        id,
        reason: 'LCD ids must be unique.',
      });
    }
    seenIds.add(id);

    if (hasNonEmptyString(entry?.kind) && !lcdCategories.has(entry.kind)) {
      findings.push({
        code: 'invalid-lcd-kind',
        severity: 'failure',
        id,
        kind: entry.kind,
      });
    }

    if (hasNonEmptyString(entry?.semanticClass) && !lcdSemanticClasses.has(entry.semanticClass)) {
      findings.push({
        code: 'invalid-lcd-semantic-class',
        severity: 'failure',
        id,
        semanticClass: entry.semanticClass,
      });
    }

    if (hasNonEmptyString(entry?.status) && !lcdStatuses.has(entry.status)) {
      findings.push({
        code: 'invalid-lcd-status',
        severity: 'failure',
        id,
        status: entry.status,
      });
    }

    if (
      !options.skipTestFileExistence &&
      entry?.status !== 'removed' &&
      Array.isArray(entry?.tests)
    ) {
      findings.push(...findMissingLcdTestFiles(id, entry.tests));
    }

    if (id === 'LCD-009') {
      findings.push(...evaluateLcdProviderSunsetRows(entry));
    }
  }

  return {
    summary: {
      registerPath,
      schemaVersion: register?.schemaVersion ?? null,
      owner: register?.owner ?? null,
      entryCount: entries.length,
      activeEntryCount: entries.filter((entry) => entry.status === 'active').length,
    },
    findings,
  };
}

function evaluateLcdProviderSunsetRows(entry) {
  const findings = [];
  const rows = Array.isArray(entry?.sunsetProviders) ? entry.sunsetProviders : [];
  const requiredProviderTypes = [
    'fal',
    'dashscope',
    'runway',
    'luma',
    'suno',
    'vidu',
    'midjourney',
    'minimax',
    'liblib',
    'kling',
  ];

  if (rows.length === 0) {
    findings.push({
      code: 'missing-provider-sunset',
      severity: 'failure',
      id: entry?.id ?? 'LCD-009',
      reason: 'LCD-009 must include provider-level sunset rows.',
    });
    return findings;
  }

  const rowTypes = rows.map((row) => row.providerType);
  const missingProviders = requiredProviderTypes.filter(
    (providerType) => !rowTypes.includes(providerType),
  );
  if (missingProviders.length > 0) {
    findings.push({
      code: 'missing-provider-sunset',
      severity: 'failure',
      id: entry?.id ?? 'LCD-009',
      missingProviders,
    });
  }

  for (const [index, row] of rows.entries()) {
    const providerType = hasNonEmptyString(row?.providerType)
      ? row.providerType
      : `provider-row-${index + 1}`;
    const missingFields = requiredLcdProviderSunsetFields.filter((field) => {
      const value = row?.[field];
      return Array.isArray(value) ? value.length === 0 : !hasNonEmptyString(value);
    });
    if (missingFields.length > 0) {
      findings.push({
        code: 'missing-provider-sunset-metadata',
        severity: 'failure',
        id: entry?.id ?? 'LCD-009',
        providerType,
        missingFields,
      });
    }
  }

  return findings;
}

function findMissingLcdTestFiles(id, tests) {
  return tests.flatMap((testCommand) => {
    if (!hasNonEmptyString(testCommand)) {
      return [
        {
          code: 'invalid-lcd-test',
          severity: 'failure',
          id,
          testCommand,
        },
      ];
    }

    const referencedFiles = extractRepoFileReferences(testCommand);
    return referencedFiles
      .filter((file) => !existsSync(resolve(repoRoot, file)))
      .map((file) => ({
        code: 'missing-lcd-test-file',
        severity: 'failure',
        id,
        file,
        testCommand,
      }));
  });
}

function extractRepoFileReferences(value) {
  const commandDir = value.match(/(?:^|\s)--dir\s+([^\s]+)/)?.[1]?.replace(/\/+$/g, '');
  const matches = value.match(/(?:^|\s)(packages\/[^\s]+|scripts\/[^\s]+|docs\/[^\s]+)/g) ?? [];
  return matches
    .map((match) => match.trim())
    .map((file) => file.replace(/[),.;]+$/g, ''))
    .map((file) => {
      if (existsSync(resolve(repoRoot, file))) return file;
      if (commandDir && file.startsWith('packages/')) return `${commandDir}/${file}`;
      return file;
    })
    .filter((file) => /\.[A-Za-z0-9]+$/.test(file));
}

function getCompatibilityExceptionExpiryStatus(exception, validationDate) {
  if (!hasNonEmptyString(exception.expiresAt)) {
    return hasNonEmptyString(exception.sunsetMilestone) ? 'milestone-only' : 'missing-expiry';
  }

  const expiresAt = parseDateOnly(exception.expiresAt);
  if (expiresAt === null) {
    return 'invalid-expiry';
  }

  return expiresAt.getTime() < startOfUtcDay(validationDate).getTime() ? 'expired' : 'active';
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function createSelfTestCompatibilityException(overrides) {
  return {
    id: 'self-test-compatibility-exception',
    file: 'packages/neko-agent/packages/extension/src/ai/selfTest.ts',
    reason: 'Self-test compatibility exception.',
    owner: 'neko-agent-runtime',
    tracking: 'openspec:self-test',
    introducedAt: '2026-05-04',
    expiresAt: '2026-05-05',
    sunsetMilestone: 'self-test',
    replacement: 'self-test replacement',
    severityAfterExpiry: 'failure',
    ...overrides,
  };
}

function createSelfTestLcdRegister(entries) {
  return {
    schemaVersion: 1,
    owner: 'self-test',
    categories: Array.from(lcdCategories),
    semanticClasses: Array.from(lcdSemanticClasses),
    entries,
  };
}

function createSelfTestLcdEntry(overrides) {
  return {
    id: 'LCD-TEST',
    package: 'neko-agent',
    surface: 'test surface',
    kind: 'migration-adapter',
    semanticClass: 'current-bridge',
    status: 'active',
    owner: 'neko-agent-runtime',
    replacement: 'test replacement',
    removeAfter: 'test condition',
    tests: ['pnpm check:agent-boundaries'],
    ...overrides,
  };
}

function createSelfTestProviderSunsetRow(overrides) {
  return {
    provider: 'Self-test provider',
    providerType: 'self-test-provider',
    taskFamilies: ['image'],
    resolverPath: 'self-test resolver path',
    nativeSupportStatus: 'self-test status',
    migrationConditions: ['self-test condition'],
    removalTrigger: 'self-test removal trigger',
    protectingTests: ['packages/neko-agent/packages/ai-sdk/src/resolve.test.ts'],
    ...overrides,
  };
}

function findImportViolations(scope, file, content) {
  const imports = extractImportSpecifiers(content);
  const activeRules = rules.filter((rule) => rule.scopes.includes(scope));
  const violations = [];

  for (const specifier of imports) {
    for (const rule of activeRules) {
      if (rule.match({ specifier, file })) {
        violations.push({
          ruleId: rule.id,
          file: relative(repoRoot, file),
          specifier,
          reason: rule.reason,
        });
      }
    }
  }

  return violations;
}

function findRunnerIndividualEventUsageViolations(scope, file, content) {
  if (scope !== 'extension') {
    return [];
  }

  const relativeFile = relative(repoRoot, file);
  if (runnerIndividualEventAllowedFiles.has(relativeFile)) {
    return [];
  }

  const violations = [];
  for (const eventProperty of runnerIndividualEventProperties) {
    const pattern = new RegExp(`\\.${eventProperty}\\s*\\(`, 'g');
    if (!pattern.test(content)) {
      continue;
    }
    violations.push({
      ruleId: 'extension-no-new-runner-individual-events',
      file: relativeFile,
      specifier: eventProperty,
      reason:
        'New Extension consumers must subscribe to onDidRunnerEvent instead of individual VSCode runner events.',
    });
  }
  return violations;
}

function findWebviewReExportShimViolations(scope, file, content) {
  if (scope !== 'webview') {
    return [];
  }

  const relativeFile = relative(repoRoot, file);
  if (relativeFile.includes('/__tests__/') || /\.test\.(ts|tsx|js|jsx)$/.test(relativeFile)) {
    return [];
  }
  const hasCompatibilityShimMarker =
    /re-export\s+shim|compatibility\s+shim|backward-compatible\s+re-export|backward-compatible\s+re-exports|re-export\s+for\s+backward\s+compatibility/i.test(
      content,
    );
  if (!hasCompatibilityShimMarker && !isWebviewCompatibilityShimCandidate(relativeFile)) {
    return [];
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));
  if (lines.length === 0) {
    return [];
  }

  const withoutBlockComments = lines.filter(
    (line) => !line.startsWith('/**') && !line.startsWith('*') && !line.startsWith('*/'),
  );
  if (withoutBlockComments.length === 0) {
    return [];
  }

  const joined = withoutBlockComments.join('\n');
  const exportFromStatements =
    joined.match(/\bexport\s+(?:type\s+)?(?:\{[\s\S]*?\}|\*)\s+from\s+['"][^'"]+['"]\s*;?/g) ?? [];
  const normalizedExports = exportFromStatements.join('\n').replace(/\s+/g, ' ').trim();
  const normalizedContent = joined.replace(/\s+/g, ' ').trim();

  if (exportFromStatements.length > 0 && normalizedExports === normalizedContent) {
    return [
      {
        ruleId: 'webview-no-re-export-compat-shim',
        file: relativeFile,
        reason:
          'Webview compatibility files that only re-export canonical presenters or helpers must be deleted; import the canonical module directly.',
      },
    ];
  }

  return [];
}

function isWebviewCompatibilityShimCandidate(relativeFile) {
  const basename = relativeFile.split('/').pop() ?? '';
  if (/compat|legacy|helpers?|extractors?|constants?/i.test(basename)) {
    return true;
  }
  return [
    'packages/neko-agent/packages/webview/src/utils/message-helpers.ts',
    'packages/neko-agent/packages/webview/src/components/ChatView/ToolCallDisplay/media-extractors.ts',
    'packages/neko-agent/packages/webview/src/components/ChatView/ToolCallDisplay/tool-constants.ts',
  ].includes(relativeFile);
}

function findHostNeutralResidualViolations(scope, file, content) {
  if (!hostAgnosticScopes.has(scope)) {
    return [];
  }

  const relativeFile = relative(repoRoot, file);
  if (isTestOrFixtureFile(relativeFile)) {
    return [];
  }

  const source = stripComments(content);
  const violations = [];

  if (
    /\b[A-Za-z0-9_]*ForWebview[A-Za-z0-9_]*\b/.test(source) &&
    !/context-webview-presenter|agent-stream-state|backfill-coordinator/.test(relativeFile)
  ) {
    violations.push({
      ruleId: 'host-neutral-no-webview-runtime-contract',
      file: relativeFile,
      reason:
        'Host-neutral Agent/Platform/types code must not expose Webview-named canonical runtime contracts.',
    });
  }

  if (
    /\blocalPaths\s*[?:]?\s*:/.test(source) &&
    !/working-memory|message-resource-projector/.test(relativeFile)
  ) {
    violations.push({
      ruleId: 'host-neutral-no-local-path-contract',
      file: relativeFile,
      reason:
        'Host-neutral successful DTOs must not expose localPaths; use stable refs or Host-internal hostOutputPaths.',
    });
  }

  return violations;
}

function findAgentContentAccessResidualViolations(scope, file, content) {
  if (!agentContentAccessResidualScopes.has(scope)) {
    return [];
  }

  const relativeFile = relative(repoRoot, file);
  const source = stripComments(content);
  const violations = [];
  for (const symbol of forbiddenAgentContentAccessResiduals) {
    if (!source.includes(symbol)) {
      continue;
    }
    violations.push({
      ruleId: 'agent-no-content-access-residuals',
      file: relativeFile,
      specifier: symbol,
      reason:
        'Agent content access code and tests must use stable refs plus unified content access; old cache/path/document-reader fields and services are forbidden.',
    });
  }
  return violations;
}

function findPiAgentTurnBridgeLegacyViolations(scope, file, content) {
  const relativeFile = relative(repoRoot, file);
  const source = stripComments(content);
  if (
    scope === 'platform' &&
    relativeFile.startsWith('packages/neko-agent/packages/platform/src/media/') &&
    !isTestOrFixtureFile(relativeFile)
  ) {
    const forbidden = [
      'ProviderRegistry',
      'getAdapterRegistry',
      'platform.createService',
      ...(relativeFile.endsWith('/media-agent-tools.ts')
        ? [
            'options?.metadata?.mediaModels',
            'args.providerId ??',
            'argProviderId ?? runtimeTarget',
            'argModelId ?? runtimeTarget',
          ]
        : []),
    ];
    return forbidden
      .filter((symbol) => source.includes(symbol))
      .map((symbol) => ({
        ruleId:
          symbol === 'ProviderRegistry' ||
          symbol === 'getAdapterRegistry' ||
          symbol === 'platform.createService'
            ? 'platform-media-no-legacy-chat-registry'
            : 'platform-pi-media-no-legacy-model-routing',
        file: relativeFile,
        specifier: symbol,
        reason:
          'Media generation must use ConfigManager plus the owning media registry and frozen purpose snapshot; it cannot depend on the legacy chat registry or model-authored routing.',
      }));
  }
  if (scope !== 'extension') return [];
  if (
    relativeFile ===
      'packages/neko-agent/packages/extension/src/tools/qualityCapabilityProvider.ts' ||
    relativeFile ===
      'packages/neko-agent/packages/extension/src/tools/perceptionCapabilityProvider.ts' ||
    relativeFile === 'packages/neko-agent/packages/extension/src/index.ts'
  ) {
    const forbidden = [
      'platform.createService',
      'bootstrapResult.platform.createService',
      'resolveModelForPurpose',
      'GenericAdapter',
      '@neko/ai-sdk',
      'args["providerId"]',
      "args['providerId']",
      'args["modelId"]',
      "args['modelId']",
      'args["path"]',
      "args['path']",
    ];
    const violations = forbidden
      .filter((symbol) => source.includes(symbol))
      .map((symbol) => ({
        ruleId: 'extension-pi-perception-no-legacy-chat',
        file: relativeFile,
        specifier: symbol,
        reason:
          'Bounded perception must use the turn-scoped Pi purpose model runtime and cannot resolve or execute through Platform/Vercel chat.',
      }));
    if (violations.length > 0) return violations;
  }
  if (relativeFile === 'packages/neko-agent/packages/extension/src/ai/vscodePiRuntimeManager.ts') {
    const forbidden = [
      'GenericAdapter',
      'AdapterRegistry',
      '@neko/ai-sdk',
      "from 'ai'",
      'from "ai"',
    ];
    return forbidden
      .filter((symbol) => source.includes(symbol))
      .map((symbol) => ({
        ruleId: 'extension-pi-provider-no-legacy-chat',
        file: relativeFile,
        specifier: symbol,
        reason:
          'The Pi provider runtime must register Pi models directly and cannot invoke Platform GenericAdapter/AdapterRegistry or Vercel AI SDK chat.',
      }));
  }
  if (
    relativeFile !== 'packages/neko-agent/packages/extension/src/chat/message/agentTurnBridge.ts'
  ) {
    return [];
  }
  const forbidden = [
    'runAgentTurnRuntime',
    'buildAgentTurnRuntimeInput',
    'AgentRunner',
    'persistConversationTerminal',
  ];
  return forbidden
    .filter((symbol) => source.includes(symbol))
    .map((symbol) => ({
      ruleId: 'extension-pi-turn-bridge-no-legacy-runtime',
      file: relativeFile,
      specifier: symbol,
      reason:
        'The VS Code Agent turn bridge must route through Pi and cannot import or invoke the replaced AgentRunner/Journal turn path.',
    }));
}

function findRetiredTranscriptAuthorityViolations(scope, file, content) {
  if (!['agent', 'extension', 'tui'].includes(scope)) return [];
  const relativeFile = relative(repoRoot, file).replaceAll('\\', '/');
  if (/\/(?:__tests__|test-utils)\//u.test(relativeFile) || /\.(?:test|spec)\.tsx?$/u.test(relativeFile)) {
    return [];
  }

  return retiredTranscriptAuthoritySymbols
    .filter((symbol) => content.includes(symbol))
    .map((symbol) => ({
      ruleId: 'pi-session-no-retired-transcript-authority',
      file: relativeFile,
      specifier: symbol,
      reason:
        'Pi Session is the only transcript authority; production code cannot import or revive legacy transcript readers, importers, migrations, or runtime fallbacks.',
    }));
}

function findRetiredTranscriptAuthorityFileViolations() {
  return retiredTranscriptAuthorityFiles
    .filter((file) => existsSync(resolve(repoRoot, file)))
    .map((file) => ({
      ruleId: 'pi-session-retired-transcript-file-removed',
      file,
      specifier: file,
      reason:
        'The prelaunch discard decision requires retired transcript authority source files to remain deleted.',
    }));
}

function findRetiredLegacyChatViolations(scope, file, content) {
  if (!['agent', 'extension', 'platform', 'ai-sdk', 'tui', 'assets'].includes(scope)) return [];
  const relativeFile = relative(repoRoot, file).replaceAll('\\', '/');
  if (/\/(?:__tests__|test-utils)\//u.test(relativeFile) || /\.(?:test|spec)\.tsx?$/u.test(relativeFile)) {
    return [];
  }
  return retiredLegacyChatSymbols
    .filter((symbol) => content.includes(symbol))
    .map((symbol) => ({
      ruleId: 'pi-runtime-no-retired-legacy-chat',
      file: relativeFile,
      specifier: symbol,
      reason:
        'Pi is the only Agent/LLM chat runtime; production code cannot restore the deleted cross-extension Platform chat fallback.',
    }));
}

function findRetiredLegacyChatFileViolations() {
  return retiredLegacyChatFiles
    .filter((file) => existsSync(resolve(repoRoot, file)))
    .map((file) => ({
      ruleId: 'pi-runtime-retired-legacy-chat-file-removed',
      file,
      specifier: file,
      reason: 'Deleted legacy Platform chat entry points must remain absent.',
    }));
}

function findSkillLocatorBoundaryViolations(scope, file, content) {
  if (!['agent', 'extension', 'platform', 'ai-sdk', 'tui', 'webview'].includes(scope)) return [];
  if (!content.includes('/__neko_skills/')) return [];
  const relativeFile = relative(repoRoot, file).replaceAll('\\', '/');
  if (isTestOrFixtureFile(relativeFile)) return [];
  const designatedFiles = new Set([
    'packages/neko-agent/packages/agent/src/pi/skill-host.ts',
    'packages/neko-agent/packages/agent/src/pi/conversation-runtime.ts',
  ]);
  if (designatedFiles.has(relativeFile)) return [];
  return [
    {
      ruleId: 'pi-skill-locator-designated-read-only',
      file: relativeFile,
      specifier: '/__neko_skills/',
      reason:
        'Skill locators are process-local identities recognized only by Pi Skill Host and its designated Agent read tool; PathResolver, ContentAccess, cache, persistence, Webview, and generic file paths must reject them.',
    },
  ];
}

function findCanvasBoardRetiredPathViolations(scope, file, content) {
  if (scope !== 'extension') {
    return [];
  }
  const relativeFile = relative(repoRoot, file).replaceAll('\\', '/');
  if (
    !/\/services\/agentCanvasBoard[^/]*\.ts$/u.test(relativeFile) ||
    /\.test\.ts$/u.test(relativeFile)
  ) {
    return [];
  }
  const forbiddenPatterns = [
    /\bactiveCanvas\b/u,
    /\brecentCanvas\b/u,
    /\bprofessionalCanvas\b/u,
    /\bsendToCanvas\b/u,
    /\blegacyStoryboardCompiler\b/u,
    /\brequestCanvasAuthoringHandoff\b/u,
    /\bcanvas_create_(?:node|composite)\b/u,
    /\bcanvas\.(?:ingestMarkdown|createStoryboardFromMarkdown)\b/u,
    /from\s+['"]node:fs(?:\/promises)?['"]/u,
    /\b(?:writeFile|appendFile|rename|copyFile)\s*\(/u,
  ];
  const matched = forbiddenPatterns.filter((pattern) => pattern.test(content));
  if (matched.length === 0) {
    return [];
  }
  return [
    {
      ruleId: 'extension-no-retired-canvas-board-path',
      file: relativeFile,
      specifier: matched.map((pattern) => pattern.source).join(', '),
      reason:
        'Canvas Board runtime must use public resolver/delivery contracts and cannot restore active/recent targets, generic Send-to-Canvas, structured Storyboard fallback, or raw .nkc mutation.',
    },
  ];
}

function isTestOrFixtureFile(relativeFile) {
  return (
    relativeFile.includes('/__tests__/') ||
    /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/.test(relativeFile) ||
    relativeFile.includes('/fixtures/')
  );
}

function stripComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function findLegacyCentralizedToolRegistrationViolations() {
  const file = resolve(
    repoRoot,
    'packages/neko-agent/packages/extension/src/bootstrap/toolBootstrap.ts',
  );
  const content = readFileSync(file, 'utf8');
  const relativeFile = relative(repoRoot, file);
  return findLegacyCentralizedToolRegistrationViolationsFromContent(content, relativeFile);
}

function findLegacyCentralizedToolRegistrationViolationsFromContent(content, relativeFile) {
  const findings = [];
  const forbiddenPatterns = [
    'LEGACY_CENTRALIZED_TOOL_REGISTRATION_METADATA',
    'LegacyCentralizedToolRegistrationMetadata',
    'createReadDocumentTool(',
    'createReadImageTool(',
    'createSemanticCoverageTool(',
  ];
  for (const pattern of forbiddenPatterns) {
    if (content.includes(pattern)) {
      findings.push({
        ruleId: 'extension-no-legacy-centralized-tool-registration',
        file: relativeFile,
        specifier: pattern,
        reason:
          'Domain document/media/search tools must be registered by owner capability providers, not toolBootstrap.',
      });
    }
  }

  return findings;
}

function extractImportSpecifiers(content) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function* walk(path) {
  const stats = statSync(path);
  if (stats.isFile()) {
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) {
      yield path;
    }
    return;
  }

  for (const entry of readdirSync(path)) {
    if (
      entry === 'node_modules' ||
      entry === 'dist' ||
      entry === 'build' ||
      entry === 'coverage' ||
      entry === '.turbo'
    ) {
      continue;
    }
    yield* walk(join(path, entry));
  }
}

function isPackage(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function isReactRuntime(specifier) {
  return isPackage(specifier, 'react') || isPackage(specifier, 'react-dom');
}

function pointsIntoPackage(file, specifier, packageKey) {
  if (!specifier.startsWith('.')) {
    return false;
  }

  const target = resolve(dirname(file), specifier);
  const packageDir = resolve(repoRoot, packageDirs[packageKey]);
  return target === packageDir || target.startsWith(`${packageDir}/`);
}

function fakeFile(scope, path) {
  const root = packageRoots[scope] ?? 'packages/neko-agent/packages/agent/src';
  return resolve(repoRoot, root, path.replace(/^src\//, ''));
}
