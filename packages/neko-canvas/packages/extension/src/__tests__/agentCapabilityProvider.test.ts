import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CanvasPlaybackPlan, ICapabilityMediaService, NekoCanvasAPI } from '@neko/shared';
import {
  CANVAS_STORYBOARD_ACTION_INTENT_IDS,
  MEDIA_PRODUCTION_ANIMATION_PLAN_PROFILE_ID,
  MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID,
  MEDIA_PRODUCTION_SHOT_IMAGE_PREP_REVIEW_PROFILE_ID,
  STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
  CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS,
  TOOL_NAMES_CANVAS,
  validateCanvasAuthoringCatalog,
  validateCanvasAuthoringResultEnvelope,
  validateCanvasStoryboardActionIntent,
} from '@neko/shared';
import { createNekoCanvasCapabilityProvider } from '../agentCapabilityProvider';

const vscodeCommandState = vi.hoisted(() => ({
  executeCommand: vi.fn(
    async (_command: string, ..._args: readonly unknown[]): Promise<unknown> => undefined,
  ),
}));

vi.mock('vscode', () => ({
  ConfigurationTarget: { Workspace: 2 },
  commands: {
    executeCommand: vscodeCommandState.executeCommand,
  },
  extensions: {
    getExtension: vi.fn(),
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => ''),
      update: vi.fn(async () => undefined),
    })),
  },
}));

const providerSource = readFileSync(join(__dirname, '../agentCapabilityProvider.ts'), 'utf-8');
const toolNamesSource = readFileSync(
  join(__dirname, '../../../../../neko-types/src/types/tool-names.ts'),
  'utf-8',
);

function createPlaybackPlan(): CanvasPlaybackPlan {
  return {
    adapterId: 'storyboard',
    requestedAdapterId: 'storyboard',
    behaviorMode: 'linear',
    advancePolicy: 'timer',
    entryUnitIds: ['unit-shot-1'],
    units: [
      {
        id: 'unit-shot-1',
        sourceNodeId: 'shot-1',
        kind: 'shot',
        renderMode: 'media-playback',
        label: 'Shot 1',
        durationMs: 3000,
      },
    ],
    transitions: [],
    routeCandidates: [
      {
        id: 'route-main',
        title: 'Main route',
        entryUnitId: 'unit-shot-1',
        unitIds: ['unit-shot-1'],
        sourceKind: 'entry',
        totalDurationMs: 3000,
      },
    ],
    diagnostics: [],
    metadata: { sourceCanvasUri: 'file:///story.nkc', sourceRevision: 3 },
  };
}

function createApi(): NekoCanvasAPI {
  const plan = createPlaybackPlan();
  return {
    importAsset: vi.fn(),
    canvas: {
      create: vi.fn(),
      addShape: vi.fn(),
    },
    storyboard: {
      import: vi.fn(),
      getExecutionSummary: vi.fn(),
    },
    markdown: {
      invoke: vi.fn(async (input) => ({
        capabilityId: input.capabilityId,
        status:
          input.capabilityId === 'canvas.validateMarkdownStoryboard' ? 'validated' : 'blocked',
        diagnostics:
          input.capabilityId === 'canvas.validateMarkdownStoryboard'
            ? []
            : [
                {
                  severity: 'warning',
                  code: 'canvas-markdown-capability-not-implemented',
                  message: 'Not implemented in test mock.',
                },
              ],
      })),
    },
    playback: {
      getPlan: vi.fn(async () => plan),
      getRoutes: vi.fn(async () => plan.routeCandidates),
      revealWorkspace: vi.fn(async () => true),
      createCutDraftFromRoute: vi.fn(async () => ({
        kind: 'canvas-cut-draft',
        schemaVersion: 1,
        sourceCanvasUri: 'file:///story.nkc',
        sourceRevision: '3',
        routeId: 'route-main',
        createdAt: '2026-06-24T00:00:00.000Z',
        projectName: 'Story',
        units: [],
        diagnostics: [],
        extensions: { 'neko.canvas': { source: 'test' } },
      })),
      reorderUnits: vi.fn(async (request) => ({
        changed: true,
        routeId: request.routeId,
        sourceCanvasUri: request.sourceCanvasUri,
        orderedUnitIds: request.orderedUnitIds,
        plan,
      })),
    },
    nodes: {
      list: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      derive: vi.fn(),
      createConnection: vi.fn(),
      createComposite: vi.fn(),
      updateBlock: vi.fn(),
      extractStructuredContent: vi.fn(),
      getActiveContext: vi.fn(),
      applyAgentContent: vi.fn(),
      generateImage: vi.fn(),
      generateBatch: vi.fn(),
      onSelectionChange: vi.fn(() => ({ dispose: vi.fn() })),
    },
    events: {
      onDidChangeCanvas: vi.fn(() => ({ dispose: vi.fn() })),
    },
  } as unknown as NekoCanvasAPI;
}

function createMediaService(): ICapabilityMediaService {
  return {
    generateImage: vi.fn(async () => ({ id: 'image-task-1' })),
    generateVideo: vi.fn(async () => ({ id: 'video-task-1' })),
    waitForTask: vi.fn(async () => ({
      status: 'completed',
      outputs: [{ url: 'file:///generated/video.mp4', mimeType: 'video/mp4' }],
    })),
  };
}

describe('agentCapabilityProvider storyboard export contracts', () => {
  it('keeps target-aware Agent content behind Canvas APIs instead of legacy commands', () => {
    const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
    const editorProviderSource = readFileSync(
      join(__dirname, '../editor/canvasEditorProvider.ts'),
      'utf-8',
    );

    expect(extensionSource).not.toContain("'neko.canvas.importAgentContent'");
    expect(editorProviderSource).toContain("'nodes.getActiveContext'");
    expect(editorProviderSource).toContain("'nodes.applyAgentContent'");
    expect(editorProviderSource).toContain("operationType: 'nodes.applyAgentContent'");
  });

  it('does not retain the removed Cut storyboard command handoff', () => {
    expect(providerSource).not.toContain('neko.cut.authoring.importStoryboard');
  });

  it('routes first/end frames through canonical stable keyframe identity', () => {
    expect(providerSource).toContain('toCanvasStableMediaResourceRef(firstFrameMediaRef)');
    expect(providerSource).toContain('toCanvasStableMediaResourceRef(lastFrameMediaRef)');
    expect(providerSource).toContain("operation: 'generate-from-keyframes'");
    expect(providerSource).toContain('startFrameRef');
    expect(providerSource).toContain('endFrameRef');
    expect(providerSource).not.toContain('referenceImageUrl: firstFrameData');
    expect(providerSource).not.toContain("metadata['lastFrameUrl']");
    expect(providerSource).not.toContain("metadata['referenceDescriptors'] = referenceDescriptors");
  });

  it('registers additive composable Canvas Agent tools', () => {
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_DERIVE_NODE');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_EXTRACT_STRUCTURED_CONTENT');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_GET_CONNECTION');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_NARRATIVE_TRAVERSE');
  });

  it('marks Canvas query and mutation tools with target-aware safety metadata', () => {
    expect(providerSource).toContain("safetyKind: 'read-only-query'");
    expect(providerSource).toContain("safetyKind: 'confirmation-gated'");
    expect(providerSource).toContain('targetRequirements');
    expect(providerSource).toContain('queryBeforeMutate');
    expect(providerSource).toContain('allowedFallbacks');
    expect(providerSource).toContain('preferredQueryTools');
  });

  it('drives preset schemas from shared registry constants', () => {
    expect(providerSource).toContain('CANVAS_AGENT_NODE_PRESETS');
    expect(providerSource).toContain('CANVAS_AGENT_DERIVE_TARGET_PRESETS');
    expect(providerSource).toContain('CANVAS_AGENT_CONTAINER_PRESETS');
    expect(providerSource).not.toContain("'shot',\n                'scene'");
  });

  it('validates Canvas Agent node type inputs at the provider boundary', () => {
    expect(providerSource).toContain('isCanvasNodeType');
    expect(providerSource).toContain('readOptionalCanvasNodeType(args.type)');
    expect(providerSource).toContain("readOptionalCanvasNodeType(value.type, 'child node type')");
    expect(providerSource).toContain(
      "readOptionalCanvasNodeType(args.targetType, 'derive target type')",
    );
  });

  it('requests additive subsystem metadata only when callers opt in', () => {
    expect(providerSource).toContain('includeSubsystemMetadata');
    expect(providerSource).toContain(
      'includeSubsystemMetadata: args.includeSubsystemMetadata as boolean | undefined',
    );
  });

  it('contributes prompt fragments for mixed-purpose Canvas subsystem context', () => {
    expect(providerSource).toContain('getPromptFragments(');
    expect(providerSource).toContain('neko-canvas:authoring-operation-routing');
    expect(providerSource).toContain('neko-canvas:multi-purpose-canvas-subsystems');
    expect(providerSource).toContain('activeSubsystems');
    expect(providerSource).toContain('includeSubsystemMetadata: true');
    expect(providerSource).toContain('projection adapters');
  });

  it('localizes mixed-purpose Canvas subsystem prompt fragments for Chinese prompts', () => {
    const provider = createNekoCanvasCapabilityProvider(createApi());
    const fragment = provider
      .getPromptFragments({ extensionContext: {}, locale: 'zh' })
      .find((candidate) => candidate.id === 'neko-canvas:multi-purpose-canvas-subsystems');
    const localized = fragment?.locales?.['zh']?.content;

    expect(localized).toBeDefined();
    expect(localized).toContain('同一图中混合分镜、叙事、行为、实体和记忆子系统');
    expect(localized).toContain('includeSubsystemMetadata: true');
    expect(localized).not.toContain('Neko Canvas .nkc files can mix');
  });

  it('keeps concrete Canvas operation routing in provider capability prompts', () => {
    const provider = createNekoCanvasCapabilityProvider(createApi());
    const fragment = provider
      .getPromptFragments({ extensionContext: {} })
      .find((candidate) => candidate.id === 'neko-canvas:authoring-operation-routing');
    const localized = fragment?.locales?.['zh']?.content;

    expect(fragment?.content).toContain('canvas.createStoryboardFromMarkdown');
    expect(fragment?.content).toContain('ordinary Markdown document content');
    expect(fragment?.content).toContain('Only explicit professional structured intent');
    expect(fragment?.content).toContain('mode=create-nodes');
    expect(fragment?.content).toContain('documentResourceRef');
    expect(localized).toContain('canvas.createStoryboardFromMarkdown');
    expect(localized).toContain('documentResourceRef');
  });

  it('registers review-only artifact rendering and lifecycle Canvas Markdown facets', () => {
    expect(providerSource).toContain('getArtifactFacets(');
    expect(providerSource).toContain('renderer:neko-canvas:generic-artifact-preview');
    expect(providerSource).toContain("'CompositeArtifact', 'GenericTable', 'StoryboardTable'");
    expect(providerSource).not.toContain('projector:storyboard-to-canvas');
    expect(providerSource).not.toContain("capabilityId: 'canvas.importStoryboard'");
    expect(providerSource).toContain("capabilityId: 'canvas.ingestMarkdown'");
    expect(providerSource).toContain('requiresApproval: true');
  });

  it('exposes Canvas authoring as a provider-owned capability family', () => {
    const provider = createNekoCanvasCapabilityProvider(createApi());
    const facets = provider.getArtifactFacets({ extensionContext: {} });

    const renderer = facets.renderers.find(
      (candidate) => candidate.id === 'renderer:neko-canvas:generic-artifact-preview',
    );
    expect(renderer?.profiles).toEqual([
      MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID,
      MEDIA_PRODUCTION_SHOT_IMAGE_PREP_REVIEW_PROFILE_ID,
      MEDIA_PRODUCTION_ANIMATION_PLAN_PROFILE_ID,
      STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
    ]);
    for (const legacyProfile of [
      'comic-shot-asset-prep',
      'comic-to-animation-plan',
      'manga-to-video',
    ]) {
      expect(renderer?.profiles).not.toContain(legacyProfile);
    }

    expect(facets.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: 'canvas.authoring',
          packageId: 'neko-canvas',
          accepts: expect.arrayContaining(['CanvasAuthoringIntent', 'Markdown', 'ResourceRef']),
          produces: expect.arrayContaining(['CanvasAuthoringResultEnvelope', 'canvas-node-ref']),
          actions: expect.arrayContaining([
            TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
            TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
            TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
          ]),
          risk: 'medium',
          requiresApproval: true,
        }),
      ]),
    );
  });

  it('registers narrative traversal as a read-only mixed Canvas tool', () => {
    expect(providerSource).toContain('traverseNarrativeFlow');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_NARRATIVE_TRAVERSE');
    expect(toolNamesSource).toContain("CANVAS_NARRATIVE_TRAVERSE: 'canvas_narrative_traverse'");
    expect(providerSource).toContain('Ignores storyboard, behavior, entity, and memory nodes');
  });

  it('registers Agent-readable Canvas playback route capabilities', () => {
    expect(toolNamesSource).toContain("CANVAS_GET_PLAYBACK_PLAN: 'canvas.getPlaybackPlan'");
    expect(toolNamesSource).toContain("CANVAS_GET_PLAYBACK_ROUTES: 'canvas.getPlaybackRoutes'");
    expect(toolNamesSource).toContain(
      "CANVAS_REVEAL_PLAYBACK_WORKSPACE: 'canvas.revealPlaybackWorkspace'",
    );
    expect(toolNamesSource).toContain(
      "CANVAS_CREATE_CUT_DRAFT_FROM_ROUTE: 'canvas.createCutDraftFromRoute'",
    );
    expect(toolNamesSource).toContain(
      "CANVAS_REORDER_PLAYBACK_UNITS: 'canvas.reorderPlaybackUnits'",
    );
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_CREATE_CUT_DRAFT_FROM_ROUTE');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_REORDER_PLAYBACK_UNITS');
  });

  it('registers Canvas Markdown capability tool names and artifact facets', () => {
    expect(toolNamesSource).toContain("CANVAS_INGEST_MARKDOWN: 'canvas.ingestMarkdown'");
    expect(toolNamesSource).toContain("CANVAS_CREATE_MARKDOWN_NOTE: 'canvas.createMarkdownNote'");
    expect(toolNamesSource).toContain(
      "CANVAS_CREATE_TABLE_FROM_MARKDOWN: 'canvas.createTableFromMarkdown'",
    );
    expect(toolNamesSource).not.toContain('CANVAS_CREATE_STORYBOARD_DRAFT_FROM_MARKDOWN');
    expect(toolNamesSource).not.toContain('canvas.createStoryboardDraftFromMarkdown');
    expect(toolNamesSource).toContain(
      "CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN: 'canvas.createStoryboardFromMarkdown'",
    );
    expect(toolNamesSource).toContain("CANVAS_ATTACH_RESOURCE: 'canvas.attachResource'");
    expect(toolNamesSource).toContain(
      "CANVAS_VALIDATE_MARKDOWN_STORYBOARD: 'canvas.validateMarkdownStoryboard'",
    );
    expect(providerSource).toContain('CANVAS_MARKDOWN_TOOL_DEFINITIONS');
    expect(providerSource).toContain("capabilityId: 'canvas.ingestMarkdown'");
    expect(providerSource).toContain("capabilityId: 'canvas.validateMarkdownStoryboard'");
    expect(providerSource).toContain(
      'document-entry DocumentArchiveResourceRef values must use documentResourceRef',
    );
    expect(providerSource).toContain("accepts: ['Markdown', 'GfmTable']");
    expect(providerSource).not.toContain('MarkdownStoryboardDraft');

    const provider = createNekoCanvasCapabilityProvider(createApi());
    const facets = provider.getArtifactFacets({ extensionContext: {} });
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: createMediaService(),
      configManager: undefined,
      embedFn: undefined,
    });
    const toolNames = tools.map((tool) => tool.name);
    const authoringFacet = facets.capabilities.find(
      (capability) => capability.capabilityId === 'canvas.authoring',
    );
    const storyboardMarkdownFacets = facets.capabilities.filter(
      (capability) =>
        capability.capabilityId === 'canvas.createStoryboardFromMarkdown' ||
        capability.capabilityId === 'canvas.validateMarkdownStoryboard',
    );
    const createStoryboardTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN,
    );

    expect(provider.getSkills).toBeUndefined();
    expect(createStoryboardTool?.description).toContain(
      'Prefer a typed canonical Storyboard artifact',
    );
    expect(createStoryboardTool?.description).toContain(
      'Markdown remains a source adapter for text-only inputs',
    );
    expect(createStoryboardTool?.description).toContain(
      'host-confirmed tool calls provide approval automatically',
    );
    expect(toolNames).not.toContain('CreateCanvas');
    expect(toolNames).not.toContain('AddCanvasShape');
    expect(toolNames).not.toContain('canvas.createStoryboardDraftFromMarkdown');
    expect(authoringFacet).toEqual(
      expect.objectContaining({
        packageId: 'neko-canvas',
        accepts: expect.arrayContaining(['Markdown']),
      }),
    );
    expect(storyboardMarkdownFacets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          accepts: expect.arrayContaining(['GfmCreativeTable', 'SemanticStoryboardProjection']),
        }),
        expect.objectContaining({
          capabilityId: 'canvas.validateMarkdownStoryboard',
          accepts: expect.arrayContaining(['GfmCreativeTable', 'SemanticStoryboardProjection']),
        }),
      ]),
    );
    expect(JSON.stringify(storyboardMarkdownFacets)).not.toContain('MarkdownStoryboardDraft');
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'canvas.ingestMarkdown',
        'canvas.createMarkdownNote',
        'canvas.createTableFromMarkdown',
        'canvas.createStoryboardFromMarkdown',
        'canvas.validateMarkdownStoryboard',
      ]),
    );
    expect(facets.lifecycleCapabilities?.map((descriptor) => descriptor.capabilityId)).toEqual([
      'canvas.ingestMarkdown',
      'canvas.createMarkdownNote',
      'canvas.createTableFromMarkdown',
      'canvas.createStoryboardFromMarkdown',
      'canvas.attachResource',
      'canvas.validateMarkdownStoryboard',
    ]);
    expect(facets.lifecycleCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: 'canvas.ingestMarkdown',
          providerId: 'neko-canvas',
          displayName: 'Ingest Markdown to Canvas',
          phases: ['review'],
          inputSchema: { id: 'canvas.markdown.input', version: 1 },
          resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
          requiresApproval: true,
          safetyKind: 'confirmation-gated',
        }),
        expect.objectContaining({
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          providerId: 'neko-canvas',
          phases: ['validate', 'review', 'apply'],
          requiresApproval: true,
          safetyKind: 'confirmation-gated',
        }),
        expect.objectContaining({
          capabilityId: 'canvas.validateMarkdownStoryboard',
          providerId: 'neko-canvas',
          displayName: 'Validate Markdown Storyboard',
          phases: ['validate'],
          requiresApproval: false,
          safetyKind: 'read-only-query',
        }),
      ]),
    );
  });

  it('registers a read-only Canvas authoring capability catalog tool with section filtering', async () => {
    const provider = createNekoCanvasCapabilityProvider(createApi());
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const catalogTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
    );

    expect(catalogTool).toMatchObject({
      isReadOnly: true,
      safetyKind: 'read-only-query',
      traits: {
        cost: 'free',
        reversible: true,
        locality: 'local',
        impactLevel: 'none',
      },
      localization: {
        zh: expect.objectContaining({
          description: expect.stringContaining('Canvas authoring 能力目录'),
        }),
      },
    });

    await expect(
      catalogTool!.execute({
        sections: ['presets', 'operations', 'fieldProfiles', 'semanticPrompts'],
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        version: 1,
        sections: ['presets', 'operations', 'fieldProfiles', 'semanticPrompts'],
        presets: expect.arrayContaining([
          expect.objectContaining({
            id: 'scene.basic',
            nodeType: 'scene',
            containerPolicyId: 'scene',
          }),
          expect.objectContaining({
            id: 'shot.basic',
            nodeType: 'shot',
          }),
        ]),
        operations: expect.arrayContaining([
          expect.objectContaining({
            id: 'describe-authoring-capabilities',
            kind: 'query',
            risk: 'read-only',
            toolName: TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
          }),
          expect.objectContaining({
            id: 'create-composite',
            kind: 'mutation',
            toolName: TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
            requiresConfirmation: true,
            preferredQueryTools: expect.arrayContaining([
              TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
              TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
            ]),
          }),
          expect.objectContaining({
            id: 'create-connection',
            kind: 'mutation',
            toolName: TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION,
            requiresConfirmation: true,
            preferredQueryTools: expect.arrayContaining([
              TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
              TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
            ]),
          }),
          expect.objectContaining({
            id: 'delete-connection',
            kind: 'mutation',
            status: 'unavailable',
          }),
        ]),
        fieldProfiles: expect.arrayContaining([
          expect.objectContaining({
            id: 'storyboard.ai-native',
            unknownFieldPolicy: 'preserve-custom',
            fields: expect.arrayContaining([
              expect.objectContaining({
                id: 'character.appearance',
                valueType: 'character-appearance',
                capabilityBinding: expect.objectContaining({
                  capabilityId: 'entity.bindCharacterAppearance',
                  stableRefRequired: true,
                }),
              }),
              expect.objectContaining({
                id: 'voice.cue',
                valueType: 'voice-cue',
                capabilityBinding: expect.objectContaining({
                  capabilityId: 'audio.tts.generate',
                  requiresApproval: true,
                }),
              }),
            ]),
          }),
        ]),
        semanticPrompts: expect.objectContaining({
          supported: true,
          promptBlockKinds: expect.arrayContaining(['image', 'video', 'voice']),
          promptContentProfiles: expect.arrayContaining([
            expect.objectContaining({
              id: 'storyboard.image-prompt.v1',
              blockKind: 'image',
              generationEffectiveParts: expect.arrayContaining([
                expect.objectContaining({ id: 'image.intent', required: true }),
                expect.objectContaining({
                  id: 'character.appearance',
                  mapsToFieldId: 'character.appearance',
                }),
              ]),
            }),
            expect.objectContaining({
              id: 'storyboard.video-prompt.v1',
              blockKind: 'video',
              generationEffectiveParts: expect.arrayContaining([
                expect.objectContaining({ id: 'video.intent', required: true }),
                expect.objectContaining({
                  id: 'duration.rhythm',
                  mapsToFieldId: 'generation.duration',
                }),
              ]),
            }),
            expect.objectContaining({
              id: 'storyboard.voice-prompt.v1',
              blockKind: 'voice',
              generationEffectiveParts: expect.arrayContaining([
                expect.objectContaining({ id: 'voice.dialogue', required: true }),
              ]),
            }),
          ]),
          alignmentStates: expect.arrayContaining(['in-sync', 'fields-changed', 'conflict']),
          referenceMediaKinds: expect.arrayContaining(['image', 'video', 'audio']),
          metadataPolicies: expect.arrayContaining([
            expect.objectContaining({
              id: 'storyboard.review-metadata',
              generationEffect: 'suggestion-only',
              fieldIds: expect.arrayContaining(['sourcePanel', 'ocrNotes', 'risk']),
            }),
            expect.objectContaining({
              id: 'storyboard.custom-metadata',
              generationEffect: 'none',
            }),
          ]),
          promotionRules: expect.arrayContaining([
            expect.objectContaining({
              id: 'metadata-to-prompt-span',
              requiresConfirmation: true,
            }),
            expect.objectContaining({
              id: 'skill-field-to-prompt-content',
              to: 'semantic-prompt-span',
            }),
          ]),
          advancedParameterIds: [...CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS],
          nextCreativeStateIds: expect.arrayContaining([
            'missing-reference',
            'ready-to-generate-video',
            'needs-result-review',
            'accepted',
          ]),
          actionIntentIds: [...CANVAS_STORYBOARD_ACTION_INTENT_IDS],
          primaryStoryboardColumns: [
            'shot',
            'reference-media',
            'image-prompt',
            'video-prompt',
            'duration',
            'dialogue',
            'state',
            'action',
          ],
          progressOwner: 'agent',
        }),
        diagnostics: [],
      },
    });

    const result = await catalogTool!.execute({ sections: ['operations'] });
    expect(result.success).toBe(true);
    expect(validateCanvasAuthoringCatalog(result.data).valid).toBe(true);
    expect(result.data).not.toHaveProperty('nodeTypes');
  });

  it('exposes prompt-first storyboard targetable fields without relying on Skill columns', async () => {
    const provider = createNekoCanvasCapabilityProvider(createApi());
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const catalogTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
    );

    await expect(
      catalogTool!.execute({ sections: ['targetableFields', 'fieldProfiles'] }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        targetableFields: expect.arrayContaining([
          expect.objectContaining({
            id: 'shot.imagePrompt',
            path: '/storyboardPrompt/promptBlocks/imagePromptDocument/text',
            storageTarget: 'prompt-span',
          }),
          expect.objectContaining({
            id: 'scene.videoPrompt',
            path: '/storyboardPrompt/promptBlocks/videoPromptDocument/text',
            storageTarget: 'prompt-span',
          }),
          expect.objectContaining({
            id: 'referenceMedia.imageRefs',
            storageTarget: 'node-data',
          }),
          expect.objectContaining({
            id: 'review.ocrNotes',
            storageTarget: 'review-metadata',
          }),
        ]),
        fieldProfiles: expect.arrayContaining([
          expect.objectContaining({
            id: 'storyboard.ai-native',
            fields: expect.arrayContaining([
              expect.objectContaining({
                id: 'shot.imagePrompt',
                promptSpan: expect.objectContaining({ behavior: 'source-of-truth' }),
              }),
              expect.objectContaining({
                id: 'scene.videoPrompt',
                promptSpan: expect.objectContaining({ behavior: 'source-of-truth' }),
              }),
              expect.objectContaining({
                id: 'generation.duration',
                storageTarget: 'capability-input',
              }),
              expect.objectContaining({
                id: 'review.risk',
                storageTarget: 'review-metadata',
              }),
            ]),
          }),
        ]),
      },
    });
  });

  it('diagnoses unsupported storyboard action parameters against model capability slices', () => {
    const validation = validateCanvasStoryboardActionIntent(
      {
        version: 1,
        actionId: 'generate-video',
        target: { nodeId: 'shot-1', sceneNodeId: 'scene-1', shotNumber: 1 },
        generationParams: {
          duration: 4,
          advancedParameters: {
            aspectRatio: '16:9',
            seed: 1234,
            videoReference: { refId: 'video-ref' },
            loraStack: ['unsupported-custom-param'],
          },
        },
      },
      { supportedAdvancedParameters: ['aspectRatio'] },
    );

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsupported-storyboard-advanced-parameter',
          target: 'advancedParameters.seed',
          expected: ['aspectRatio'],
        }),
        expect.objectContaining({
          code: 'unsupported-storyboard-advanced-parameter',
          target: 'advancedParameters.videoReference',
          expected: ['aspectRatio'],
        }),
        expect.objectContaining({
          code: 'unsupported-storyboard-advanced-parameter',
          target: 'advancedParameters.loraStack',
          expected: CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS,
        }),
      ]),
    );
  });

  it('returns structured Canvas authoring envelopes from mutation tools', async () => {
    const api = createApi();
    vi.mocked(api.nodes.create).mockResolvedValue('node-1');
    vi.mocked(api.nodes.createComposite).mockResolvedValue({
      containerId: 'scene-1',
      childIds: ['shot-1', 'shot-2'],
      connectionIds: ['connection-1'],
    });
    vi.mocked(api.nodes.updateBlock).mockResolvedValue({
      nodeId: 'shot-1',
      changed: true,
      data: { storyboardPrompt: { version: 1 } },
    });
    vi.mocked(api.nodes.applyAgentContent).mockResolvedValue({
      changed: true,
      mode: 'apply',
      nodeId: 'shot-1',
      target: { nodeId: 'shot-1', fieldPath: '/storyboardPrompt', mode: 'apply' },
    });
    vi.mocked(api.nodes.generateImage).mockResolvedValue(undefined);

    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const getTool = (name: string) => tools.find((tool) => tool.name === name)!;

    const createNodeResult = await getTool(TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE).execute({
      type: 'text',
      x: 12,
      y: 24,
      data: { content: 'hello' },
    });
    expect(createNodeResult).toMatchObject({
      success: true,
      data: {
        value: 'node-1',
        authoringResult: {
          version: 1,
          status: 'success',
          refs: [expect.objectContaining({ kind: 'node', id: 'node-1' })],
        },
      },
    });
    expect(
      validateCanvasAuthoringResultEnvelope(
        (createNodeResult.data as { authoringResult: unknown }).authoringResult,
      ).valid,
    ).toBe(true);

    await expect(
      getTool(TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE).execute({
        containerPreset: 'scene.basic',
        children: [{ preset: 'shot.basic', data: { shotNumber: 1 } }],
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        containerId: 'scene-1',
        childIds: ['shot-1', 'shot-2'],
        authoringResult: {
          status: 'success',
          refs: expect.arrayContaining([
            expect.objectContaining({ kind: 'node', id: 'scene-1' }),
            expect.objectContaining({ kind: 'node', id: 'shot-1' }),
            expect.objectContaining({ kind: 'connection', id: 'connection-1' }),
          ]),
        },
      },
    });

    await expect(
      getTool(TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK).execute({
        nodeId: 'shot-1',
        path: '/storyboardPrompt',
        value: { version: 1 },
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        authoringResult: {
          status: 'success',
          refs: [expect.objectContaining({ kind: 'node', id: 'shot-1' })],
          changedFields: ['/storyboardPrompt'],
        },
      },
    });

    await expect(
      getTool(TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT).execute({
        kind: 'structured',
        contentJson: '{"version":1}',
        nodeId: 'shot-1',
        fieldPath: '/storyboardPrompt',
        mode: 'apply',
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        authoringResult: {
          status: 'success',
          refs: [expect.objectContaining({ kind: 'node', id: 'shot-1' })],
          changedFields: ['/storyboardPrompt'],
        },
      },
    });

    await expect(
      getTool(TOOL_NAMES_CANVAS.CANVAS_GENERATE_IMAGE).execute({ nodeId: 'shot-1' }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        authoringResult: {
          status: 'success',
          refs: [expect.objectContaining({ kind: 'node', id: 'shot-1' })],
          nextActions: [expect.objectContaining({ toolName: TOOL_NAMES_CANVAS.CANVAS_GET_NODE })],
        },
      },
    });
  });

  it('returns blocked Canvas authoring envelopes when mutation tools fail', async () => {
    const api = createApi();
    vi.mocked(api.nodes.createComposite).mockRejectedValue(
      new Error('Unsupported child preset "shot.magic"'),
    );
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const createComposite = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
    )!;

    await expect(
      createComposite.execute({
        containerPreset: 'scene.basic',
        children: [{ preset: 'shot.magic', data: {} }],
      }),
    ).resolves.toMatchObject({
      success: false,
      data: {
        authoringResult: {
          status: 'blocked',
          blockedReason: 'Unsupported child preset "shot.magic"',
          diagnostics: [
            expect.objectContaining({
              code: 'canvas-authoring-operation-blocked',
              target: 'create-composite',
              requiredQuery: TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
            }),
          ],
          nextActions: expect.arrayContaining([
            expect.objectContaining({
              toolName: TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
            }),
          ]),
        },
      },
    });
  });

  it('lists, reads, and creates Canvas connections through structured tools', async () => {
    const api = createApi();
    const existingConnection = {
      id: 'connection-1',
      sourceId: 'shot-1',
      targetId: 'shot-2',
      type: 'sequence',
      sourceEndpoint: { nodeId: 'shot-1', scope: 'node' },
      targetEndpoint: { nodeId: 'shot-2', scope: 'node' },
    };
    vi.mocked(api.nodes.getActiveContext).mockResolvedValue({
      selectedNodeIds: [],
      selectedNodes: [],
      connections: [existingConnection],
    });
    vi.mocked(api.nodes.createConnection).mockResolvedValue({
      connectionId: 'connection-2',
      connection: {
        id: 'connection-2',
        sourceId: 'shot-2',
        targetId: 'shot-3',
        type: 'reference',
        label: 'Reference',
        sourceEndpoint: { nodeId: 'shot-2', scope: 'node' },
        targetEndpoint: { nodeId: 'shot-3', scope: 'node' },
      },
    });

    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const getTool = (name: string) => tools.find((tool) => tool.name === name)!;

    await expect(
      getTool(TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS).execute({ type: 'sequence' }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        connections: [expect.objectContaining({ id: 'connection-1', type: 'sequence' })],
      },
    });

    await expect(
      getTool(TOOL_NAMES_CANVAS.CANVAS_GET_CONNECTION).execute({
        connectionId: 'connection-1',
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        connection: expect.objectContaining({ id: 'connection-1' }),
      },
    });

    await expect(
      getTool(TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION).execute({
        sourceId: 'shot-2',
        targetId: 'shot-3',
        type: 'reference',
        label: 'Reference',
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        connectionId: 'connection-2',
        authoringResult: {
          status: 'success',
          refs: expect.arrayContaining([
            expect.objectContaining({ kind: 'connection', id: 'connection-2' }),
            expect.objectContaining({ kind: 'node', id: 'shot-2' }),
            expect.objectContaining({ kind: 'node', id: 'shot-3' }),
          ]),
        },
      },
    });
    expect(api.nodes.createConnection).toHaveBeenCalledWith({
      sourceId: 'shot-2',
      targetId: 'shot-3',
      sourceEndpoint: { nodeId: 'shot-2', scope: 'node' },
      targetEndpoint: { nodeId: 'shot-3', scope: 'node' },
      type: 'reference',
      label: 'Reference',
    });

    await expect(
      getTool(TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION).execute({
        sourceId: 'shot-2',
        targetId: 'shot-3',
        sourceEndpoint: { nodeId: 'other-node', scope: 'node' },
      }),
    ).resolves.toMatchObject({
      success: false,
      data: {
        authoringResult: {
          status: 'blocked',
          diagnostics: [
            expect.objectContaining({
              code: 'canvas-authoring-operation-blocked',
              target: 'create-connection',
              requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
            }),
          ],
        },
      },
    });
  });

  it('reports repairable diagnostics for stale refs and approval-gated Canvas mutations', async () => {
    const api = createApi();
    vi.mocked(api.nodes.updateBlock).mockRejectedValue(
      new Error('Target node "stale-node" not found'),
    );
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const updateBlock = tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK)!;
    const createConnection = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION,
    )!;

    expect(updateBlock).toMatchObject({
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
      queryBeforeMutate: expect.objectContaining({
        preferredQueryTools: expect.arrayContaining([TOOL_NAMES_CANVAS.CANVAS_GET_NODE]),
      }),
    });
    expect(createConnection).toMatchObject({
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
      targetRequirements: expect.objectContaining({
        required: ['sourceId', 'targetId'],
      }),
    });

    await expect(
      updateBlock.execute({
        nodeId: 'stale-node',
        path: '/storyboardPrompt',
        value: 'prompt',
      }),
    ).resolves.toMatchObject({
      success: false,
      data: {
        authoringResult: {
          status: 'blocked',
          blockedReason: 'Target node "stale-node" not found',
          diagnostics: [
            expect.objectContaining({
              code: 'canvas-authoring-operation-blocked',
              target: 'update-block',
              requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
              retryable: true,
            }),
          ],
          nextActions: expect.arrayContaining([
            expect.objectContaining({ toolName: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT }),
          ]),
        },
      },
    });
  });

  it('executes Markdown capability tools through the Canvas Markdown API', async () => {
    const api = createApi();
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });

    const validateTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD,
    );
    const ingestTool = tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN);

    expect(validateTool).toMatchObject({
      isReadOnly: true,
      safetyKind: 'read-only-query',
    });
    expect(ingestTool).toMatchObject({
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
    });

    await expect(
      validateTool!.execute({
        markdown: '| image | visual |\n| --- | --- |\n| P1 | shot |',
        sourceFormat: 'gfm-table',
        provenance: { source: 'webview', label: 'assistant-markdown-block' },
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        capabilityId: 'canvas.validateMarkdownStoryboard',
        phase: 'validate',
        status: 'validated',
        data: {
          capabilityId: 'canvas.validateMarkdownStoryboard',
          status: 'validated',
          authoringResult: {
            status: 'success',
            diagnostics: [],
            summary: 'Validate Markdown Storyboard: validated.',
          },
        },
      },
    });
    expect(api.markdown.invoke).toHaveBeenCalledWith({
      capabilityId: 'canvas.validateMarkdownStoryboard',
      markdown: '| image | visual |\n| --- | --- |\n| P1 | shot |',
      sourceFormat: 'gfm-table',
      provenance: { source: 'webview', label: 'assistant-markdown-block' },
    });

    await expect(
      ingestTool!.execute({
        markdown: '| image | visual |\n| --- | --- |\n| P1 | shot |',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        resources: [{ token: 'P1', sourcePath: 'assets/page-1.png' }],
        provenance: { source: 'webview', label: 'assistant-markdown-block' },
      }),
    ).resolves.toMatchObject({
      success: false,
      data: {
        capabilityId: 'canvas.ingestMarkdown',
        phase: 'review',
        status: 'blocked',
        data: {
          capabilityId: 'canvas.ingestMarkdown',
          status: 'blocked',
          authoringResult: {
            status: 'blocked',
            diagnostics: [
              expect.objectContaining({
                code: 'canvas-markdown-capability-not-implemented',
              }),
            ],
          },
        },
      },
    });
  });

  it('fails visibly when Canvas Markdown API returns an invalid result', async () => {
    const api = createApi();
    api.markdown.invoke = vi.fn(async () => ({}) as never);
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const ingestTool = tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN);

    await expect(
      ingestTool!.execute({
        markdown:
          '| scene | shot | source | imagePrompt |\n| --- | --- | --- | --- |\n| S1 | 1 | P1 | prep |',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        provenance: { source: 'webview', label: 'assistant-markdown-block' },
      }),
    ).resolves.toMatchObject({
      success: false,
      error: 'Canvas Markdown capability returned an invalid result.',
      data: {
        capabilityId: 'canvas.ingestMarkdown',
        phase: 'review',
        status: 'blocked',
        diagnostics: [
          expect.objectContaining({
            severity: 'error',
            code: 'canvas-markdown-invalid-result',
          }),
        ],
        data: {
          authoringResult: {
            status: 'blocked',
          },
        },
      },
    });
  });

  it('blocks Markdown capability tools before invoking Canvas when markdown is missing', async () => {
    const api = createApi();
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const ingestTool = tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN);

    expect(ingestTool?.parameters.required).toEqual(['markdown']);
    await expect(
      ingestTool!.execute({
        intentHint: 'creative-table',
        profileHint: 'storyboard',
      }),
    ).resolves.toMatchObject({
      success: false,
      error: 'Canvas Markdown capability requires non-empty markdown.',
      data: {
        capabilityId: 'canvas.ingestMarkdown',
        phase: 'review',
        status: 'blocked',
        diagnostics: [
          expect.objectContaining({
            severity: 'error',
            code: 'canvas-markdown-missing-markdown',
          }),
        ],
      },
    });
    expect(api.markdown.invoke).not.toHaveBeenCalled();
  });

  it('allows storyboard validation and approved production creation without visible provenance', async () => {
    const api = createApi();
    api.markdown.invoke = vi.fn(async (input) => ({
      capabilityId: input.capabilityId,
      status: input.capabilityId === 'canvas.validateMarkdownStoryboard' ? 'validated' : 'created',
      diagnostics: [],
      ...(input.capabilityId === 'canvas.createStoryboardFromMarkdown'
        ? { nodeIds: ['scene-1', 'shot-1'] }
        : {}),
    }));
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const validateTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD,
    );
    const createStoryboardTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN,
    );
    const storyboardMarkdown =
      '| scene | shot | reference media | image prompt | scene video prompt | duration | dialogue | state | action |\n' +
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
      '| S1 | 1 | @P1 as first frame | restore panel colors | scene video prompt | 4s | hello | ready | generate-video |';

    await expect(
      validateTool!.execute({
        markdown: storyboardMarkdown,
        sourceFormat: 'gfm-table',
        profileHint: 'storyboard',
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        capabilityId: 'canvas.validateMarkdownStoryboard',
        status: 'validated',
      },
    });

    await expect(
      createStoryboardTool!.execute({
        markdown: storyboardMarkdown,
        sourceFormat: 'gfm-table',
        profileHint: 'storyboard',
        mode: 'create-nodes',
        approval: { source: 'creation-apply', stageId: 'apply' },
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        status: 'applied',
        data: {
          authoringResult: {
            status: 'success',
            refs: expect.arrayContaining([
              expect.objectContaining({ kind: 'node', id: 'scene-1' }),
              expect.objectContaining({ kind: 'node', id: 'shot-1' }),
            ]),
          },
        },
      },
    });

    expect(api.markdown.invoke).toHaveBeenCalledTimes(2);
  });

  it('projects confirmed storyboard tool calls into lifecycle approval context', async () => {
    const api = createApi();
    api.markdown.invoke = vi.fn(async (input) => ({
      capabilityId: input.capabilityId,
      status: 'created',
      diagnostics: [],
      nodeIds: ['scene-1', 'shot-1'],
    }));
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const createStoryboardTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN,
    );

    await expect(
      createStoryboardTool!.execute(
        {
          markdown:
            '| scene | shot | reference media | image prompt | scene video prompt | duration | dialogue | state | action |\n' +
            '| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
            '| S1 | 1 | @P1 as first frame | restore panel colors | scene video prompt | 4s | hello | ready | generate-video |',
          sourceFormat: 'gfm-table',
          profileHint: 'storyboard',
          mode: 'create-nodes',
        },
        { metadata: { parentToolCallId: 'call-storyboard-1' } },
      ),
    ).resolves.toMatchObject({
      success: true,
      data: {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        status: 'applied',
      },
    });

    expect(api.markdown.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        approval: expect.objectContaining({
          source: 'tool-confirmation',
          toolCallId: 'call-storyboard-1',
          approvedAt: expect.any(Number),
        }),
      }),
    );
  });

  it('blocks storyboard review ingestion when the source table is not visible', async () => {
    const api = createApi();
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const ingestTool = tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN);
    const storyboardMarkdown =
      '| scene | shot | reference media | image prompt | scene video prompt | duration | dialogue | state | action |\n' +
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
      '| S1 | 1 | @P1 as first frame | restore panel colors | scene video prompt | 4s | hello | ready | generate-video |';

    await expect(
      ingestTool!.execute({
        markdown: storyboardMarkdown,
        sourceFormat: 'gfm-table',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
      }),
    ).resolves.toMatchObject({
      success: false,
      error:
        'Canvas storyboard review ingestion requires a visible assistant Markdown block source or UI handoff source.',
      data: {
        capabilityId: 'canvas.ingestMarkdown',
        status: 'blocked',
        diagnostics: [
          expect.objectContaining({
            code: 'canvas-storyboard-visible-source-required',
          }),
        ],
      },
    });

    expect(api.markdown.invoke).not.toHaveBeenCalled();
  });

  it('allows storyboard Markdown handoff from a visible assistant Markdown block', async () => {
    const api = createApi();
    api.markdown.invoke = vi.fn(async (input) => ({
      capabilityId: input.capabilityId,
      status: input.capabilityId === 'canvas.validateMarkdownStoryboard' ? 'validated' : 'created',
      diagnostics: [],
      ...(input.capabilityId === 'canvas.createStoryboardFromMarkdown'
        ? { nodeIds: ['scene-1', 'shot-1'] }
        : {}),
    }));
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const createStoryboardTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN,
    );
    const storyboardMarkdown =
      '| scene | shot | reference media | image prompt | scene video prompt | duration | dialogue | state | action |\n' +
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
      '| S1 | 1 | @P1 as first frame | restore panel colors | scene video prompt | 4s | hello | ready | generate-video |';

    await expect(
      createStoryboardTool!.execute({
        markdown: storyboardMarkdown,
        sourceFormat: 'gfm-table',
        profileHint: 'storyboard',
        mode: 'create-nodes',
        approval: { source: 'user-confirmation', approvalId: 'send-to-canvas-storyboard' },
        provenance: { source: 'webview', label: 'assistant-markdown-block' },
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        status: 'applied',
        data: {
          authoringResult: {
            status: 'success',
            refs: expect.arrayContaining([
              expect.objectContaining({ kind: 'node', id: 'scene-1' }),
              expect.objectContaining({ kind: 'node', id: 'shot-1' }),
            ]),
          },
        },
      },
    });

    expect(api.markdown.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        provenance: { source: 'webview', label: 'assistant-markdown-block' },
      }),
    );
  });

  it('fails visibly when Canvas Markdown mutation result has no Canvas refs', async () => {
    const api = createApi();
    api.markdown.invoke = vi.fn(async (input) => ({
      capabilityId: input.capabilityId,
      status: 'created',
      diagnostics: [],
    }));
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const ingestTool = tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN);

    await expect(
      ingestTool!.execute({
        markdown:
          '| scene | shot | source | imagePrompt |\n| --- | --- | --- | --- |\n| S1 | 1 | P1 | prep |',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        provenance: { source: 'webview', label: 'assistant-markdown-block' },
      }),
    ).resolves.toMatchObject({
      success: false,
      error:
        'Canvas Markdown capability reported a mutation status but did not return any Canvas node reference.',
      data: {
        capabilityId: 'canvas.ingestMarkdown',
        phase: 'review',
        status: 'blocked',
        diagnostics: [
          expect.objectContaining({
            severity: 'error',
            code: 'canvas-markdown-mutation-result-missing-ref',
          }),
        ],
      },
    });
  });

  it('localizes Canvas-owned tool definitions in the Canvas provider', () => {
    const provider = createNekoCanvasCapabilityProvider(createApi());
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: createMediaService(),
      configManager: undefined,
      embedFn: undefined,
    });

    const toolsMissingZhLocalization = tools
      .filter((tool) => !tool.localization?.zh?.description)
      .map((tool) => tool.name);

    expect(toolsMissingZhLocalization).toEqual([]);
    expect(
      tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_LIST_NODES)?.localization?.zh,
    ).toMatchObject({
      description: '列出当前画布上的节点，可按类型过滤。',
      parameters: {
        type: '可选节点类型过滤条件。',
      },
    });
    expect(
      tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD)
        ?.localization?.zh,
    ).toMatchObject({
      description: '只读校验 Markdown 分镜内容是否可被 Canvas 接收；不会修改 Canvas 状态。',
      parameters: {
        markdown: '要校验的 Markdown 分镜内容。',
        sourceFormat: '来源格式提示。',
      },
    });
    expect(
      tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN)?.localization
        ?.zh,
    ).toMatchObject({
      description:
        '将可见 Markdown 内容作为可审阅 Note、表格或 creative table 导入 Canvas；storyboard profile 输入必须来自可见 assistant Markdown 块或 UI handoff 来源；不会创建生产 scene/shot 节点。',
    });
    expect(
      tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN)
        ?.localization?.zh,
    ).toMatchObject({
      description:
        '在显式确认后，通过无 UI .nkc authoring 路径从已校验 Markdown 创建生产 Canvas 分镜节点（scene.basic + shot.basic）；需要完整 storyboard creative table 和 create-nodes 模式。',
      parameters: {
        mode: '分镜创建模式；生产节点创建必须使用 create-nodes。',
        approval:
          '可选生命周期审批上下文；已由宿主确认的工具调用会自动注入 tool-confirmation，显式创作流程可传 creation-apply。',
      },
    });
    expect(
      tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_GENERATE_VIDEO_WITH_KEYFRAMES)
        ?.localization?.zh,
    ).toMatchObject({
      description: '使用首帧和尾帧图片作为关键帧，为 ShotNode 生成视频片段。',
      parameters: {
        firstFrameNodeId: '提供首帧图片的 ShotNode ID。',
        lastFrameNodeId: '提供尾帧图片的 ShotNode ID。',
      },
    });
  });

  it('declares Canvas-owned tool traits in the Canvas provider', () => {
    const provider = createNekoCanvasCapabilityProvider(createApi());
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: createMediaService(),
      configManager: undefined,
      embedFn: undefined,
    });

    const toolsMissingTraits = tools.filter((tool) => !tool.traits).map((tool) => tool.name);

    expect(toolsMissingTraits).toEqual([]);
    expect(tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_GET_NODE)?.traits).toEqual({
      cost: 'free',
      reversible: true,
      locality: 'local',
      impactLevel: 'none',
    });
    expect(
      tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_GENERATE_IMAGE)?.traits,
    ).toEqual({
      cost: 'moderate',
      reversible: false,
      locality: 'network',
      impactLevel: 'high',
    });
  });

  it('declares numeric videoFps enum values for project generation config', () => {
    const provider = createNekoCanvasCapabilityProvider(createApi());
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const configTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.SET_PROJECT_GENERATION_CONFIG,
    );

    expect(configTool?.parameters.properties['videoFps']).toEqual(
      expect.objectContaining({
        type: 'number',
        enum: [24, 30],
      }),
    );
  });

  it('projects Canvas Markdown lifecycle actions through capability definitions', async () => {
    const api = createApi();
    api.markdown.invoke = vi.fn(async (input) => ({
      capabilityId: input.capabilityId,
      status: 'needs-review',
      tableNodeId: 'table-node-1',
      diagnostics: [],
      actions: [
        {
          actionId: 'create-storyboard-nodes',
          label: 'Create storyboard nodes',
          capabilityId: 'canvas.createStoryboardFromMarkdown',
        },
      ],
    }));
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const ingestTool = tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN);

    await expect(
      ingestTool!.execute({
        markdown: '| image | visual |\n| --- | --- |\n| P1 | shot |',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        provenance: { source: 'webview', label: 'assistant-markdown-block' },
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        capabilityId: 'canvas.ingestMarkdown',
        phase: 'review',
        status: 'needs-review',
        actions: [
          {
            actionId: 'create-storyboard-nodes',
            capabilityId: 'canvas.createStoryboardFromMarkdown',
            phase: 'apply',
            requiresApproval: true,
            sourceRef: {
              kind: 'node',
              id: 'table-node-1',
              packageId: 'neko-canvas',
            },
          },
        ],
      },
    });
  });

  it('keeps playback display and reveal read-only while reorder remains confirmation-gated', () => {
    expect(providerSource).toContain('api.playback.getPlan');
    expect(providerSource).toContain('api.playback.getRoutes');
    expect(providerSource).toContain('api.playback.revealWorkspace');
    expect(providerSource).toContain('api.playback.createCutDraftFromRoute');
    expect(providerSource).toContain('api.playback.reorderUnits');
    expect(providerSource).not.toContain('neko.cut.authoring.importCanvasDraft');
    expect(providerSource).toContain("approvalContext === 'agent-inferred'");
    expect(providerSource).toContain(
      'Agent-inferred Canvas playback reorder requires confirmation',
    );
    expect(providerSource).toContain('readPlaybackReorderApprovalContext(args.approvalContext)');
  });

  it('executes playback tools through Canvas/Cut owning APIs with approval policy', async () => {
    const api = createApi();
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });

    const getPlanTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
    );
    const revealTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE,
    );
    const createDraftTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_CREATE_CUT_DRAFT_FROM_ROUTE,
    );
    const reorderTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_REORDER_PLAYBACK_UNITS,
    );

    expect(getPlanTool).toMatchObject({
      isReadOnly: true,
      safetyKind: 'read-only-query',
    });
    expect(revealTool).toMatchObject({
      isReadOnly: true,
      safetyKind: 'read-only-query',
    });
    expect(createDraftTool).toMatchObject({
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
    });
    expect(reorderTool).toMatchObject({
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
    });

    await expect(getPlanTool!.execute({ sourceCanvasUri: 'file:///story.nkc' })).resolves.toEqual({
      success: true,
      data: createPlaybackPlan(),
    });
    expect(api.playback.getPlan).toHaveBeenCalledWith('file:///story.nkc');

    await expect(
      revealTool!.execute({
        sourceCanvasUri: 'file:///story.nkc',
        routeId: 'route-main',
        unitId: 'unit-shot-1',
      }),
    ).resolves.toEqual({ success: true, data: { revealed: true } });
    expect(api.playback.revealWorkspace).toHaveBeenCalledWith({
      sourceCanvasUri: 'file:///story.nkc',
      routeId: 'route-main',
      unitId: 'unit-shot-1',
    });

    const agentInferredResult = await reorderTool!.execute({
      routeId: 'route-main',
      orderedUnitIds: ['unit-shot-1'],
      approvalContext: 'agent-inferred',
    });
    expect(agentInferredResult).toMatchObject({
      success: false,
      error: 'Agent-inferred Canvas playback reorder requires confirmation.',
    });
    expect(api.playback.reorderUnits).not.toHaveBeenCalled();

    const explicitResult = await reorderTool!.execute({
      sourceCanvasUri: 'file:///story.nkc',
      routeId: 'route-main',
      orderedUnitIds: ['unit-shot-1'],
      approvalContext: 'explicit-user-instruction',
      instructionText: 'Move shot 1 first.',
    });
    expect(explicitResult.success).toBe(true);
    expect(api.playback.reorderUnits).toHaveBeenCalledWith({
      sourceCanvasUri: 'file:///story.nkc',
      routeId: 'route-main',
      orderedUnitIds: ['unit-shot-1'],
      approvalContext: 'explicit-user-instruction',
      instructionText: 'Move shot 1 first.',
    });

    await expect(
      createDraftTool!.execute({
        routeId: 'route-main',
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        draft: expect.objectContaining({ kind: 'canvas-cut-draft', routeId: 'route-main' }),
      },
    });
    expect(api.playback.createCutDraftFromRoute).toHaveBeenCalledWith({
      sourceCanvasUri: undefined,
      routeId: 'route-main',
      projectName: undefined,
    });
    expect(vscodeCommandState.executeCommand).not.toHaveBeenCalledWith(
      'neko.cut.authoring.importCanvasDraft',
      expect.anything(),
    );
  });

  it('does not give Agent a playback runtime or private route order', () => {
    expect(providerSource).toContain('Agent must not persist route order');
    expect(providerSource).toContain('Canvas owns playback UI and playhead');
    expect(providerSource).not.toContain('agentOrder');
    expect(providerSource).not.toContain('AgentPlaybackSession');
    expect(providerSource).not.toContain('createVideoPlayer');
  });
});
