import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DshAcpDomainToolRequest } from '@neko/agent-contracts/dsh-acp';
import { createOtioTimeline, serializeOtio } from '@neko/cut-domain';
import type { GenerationJobPort, GenerationJobSnapshot } from '@neko/generation-domain/job';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDesktopDshDomainToolHandlers } from './desktop-dsh-domain-tool-handlers';

const roots: string[] = [];
const generationProjection = {
  projectSnapshot: vi.fn(async () => ({ status: 'accepted' as const })),
};
const coordinateCanvasMutation = async <TResult>(
  _target: unknown,
  operation: () => Promise<TResult>,
): Promise<TResult> => operation();

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop DSH domain Tool handlers', () => {
  it('does not define a Desktop or Symlink-owned DSH permission policy', async () => {
    const source = await readFile(
      new URL('./desktop-dsh-domain-tool-handlers.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(/sandboxMode|permissionPreset|SymlinkAccessMode/u);
  });

  it('resolves the exact Workspace grant for the canonical document Tool', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'notes.md'), '# Story');
    const resolveAuthorizedWorkspace = vi.fn(async () => workspaceResolution(root));
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: {
        async getByDshSessionId() {
          return sessionBinding();
        },
      },
      contexts: {
        async readContext() {
          return workspaceContext();
        },
      },
      workspaceGrants: { resolveAuthorizedWorkspace },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection,
      configuration: { getApplicationConfig: vi.fn(), getWorkspaceConfig: vi.fn() },
      assistant: { assistantSpaceId: 'assistant:one', root },
      cutRuntime: undefined,
    });

    await expect(
      handlers.executeDocumentTool(documentRequest(), new AbortController().signal),
    ).resolves.toMatchObject({ outcome: 'success', result: { text: '# Story' } });
    expect(resolveAuthorizedWorkspace).toHaveBeenCalledWith('workspace-grant:one', 'workspace:one');
  });

  it('reads a managed media-library link through the ordinary workspace-file locator', async () => {
    const root = await createRoot();
    const libraryRoot = await mkdtemp(join(tmpdir(), 'openneko-dsh-document-library-'));
    roots.push(libraryRoot);
    await writeFile(join(libraryRoot, 'book.md'), '# Linked story');
    await mkdir(join(root, 'neko', 'assets'), { recursive: true });
    await symlink(
      libraryRoot,
      join(root, 'neko', 'assets', 'Books'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const resolveAuthorizedWorkspace = vi.fn(async () => workspaceResolution(root));
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: {
        async getByDshSessionId() {
          return sessionBinding();
        },
      },
      contexts: {
        async readContext() {
          return workspaceContext();
        },
      },
      workspaceGrants: { resolveAuthorizedWorkspace },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection,
      configuration: { getApplicationConfig: vi.fn(), getWorkspaceConfig: vi.fn() },
      assistant: { assistantSpaceId: 'assistant:one', root },
      cutRuntime: undefined,
    });

    await expect(
      handlers.executeDocumentTool(
        {
          ...documentRequest(),
          input: {
            source: { file: { authority: 'workspace', path: 'neko/assets/Books/book.md' } },
          },
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ outcome: 'success', result: { text: '# Linked story' } });
  });

  it('reads an EPUB image entry through the Content-owned DSH image path', async () => {
    const root = await createRoot();
    await copyFile(
      new URL('../../../../scripts/fixtures/documents/synthetic-document.epub', import.meta.url),
      join(root, 'story.epub'),
    );
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: {
        async getByDshSessionId() {
          return sessionBinding();
        },
      },
      contexts: {
        async readContext() {
          return workspaceContext();
        },
      },
      workspaceGrants: {
        resolveAuthorizedWorkspace: vi.fn(async () => workspaceResolution(root)),
      },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection,
      configuration: { getApplicationConfig: vi.fn(), getWorkspaceConfig: vi.fn() },
      assistant: { assistantSpaceId: 'assistant:one', root },
      cutRuntime: undefined,
    });

    await expect(
      handlers.executeContentImageTool(
        {
          sessionId: 'dsh-session:one',
          turn: 1,
          toolCallId: 'tool:image',
          sandboxMode: 'read-only',
          tool: 'openneko_read_image',
          operation: 'read-chunk',
          input: {
            source: {
              file: { authority: 'workspace', path: 'story.epub' },
              selector: { kind: 'entry', path: 'OEBPS/images/page-1.png' },
            },
            offset: 0,
          },
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      outcome: 'success',
      result: { offset: 0, totalBytes: 808, mimeType: 'image/png' },
    });
  });

  it('resolves exact Workspace grant and purpose model for Generation', async () => {
    const root = await createRoot();
    const resolveAuthorizedWorkspace = vi.fn(async () => workspaceResolution(root));
    const submitGeneration = vi.fn<GenerationJobPort['submitGeneration']>(async () =>
      generationSnapshot(),
    );
    const getJobs = vi.fn(async () => generationJobs(submitGeneration));
    const projectSnapshot = vi.fn(async () => ({ status: 'accepted' as const }));
    const resolveModelRefForPurpose = vi.fn(() => ({
      providerId: 'provider:one',
      modelId: 'model:one',
    }));
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: {
        async getByDshSessionId() {
          return sessionBinding();
        },
      },
      contexts: {
        async readContext() {
          return workspaceContext();
        },
      },
      workspaceGrants: { resolveAuthorizedWorkspace },
      coordinateCanvasMutation,
      generationRuntime: { getJobs },
      generationProjection: { projectSnapshot },
      configuration: {
        getApplicationConfig: vi.fn(),
        getWorkspaceConfig: vi.fn(
          () =>
            ({
              resolveModelRefForPurpose,
              getProvider: (providerId: string) =>
                providerId === 'provider:one'
                  ? { id: providerId, type: 'generic', enabled: true }
                  : undefined,
              getModel: (modelId: string) =>
                modelId === 'model:one'
                  ? {
                      id: modelId,
                      providerId: 'provider:one',
                      name: 'image-model',
                      capabilities: ['image.generate', 'text_to_image'],
                      enabled: true,
                    }
                  : undefined,
            }) as never,
        ),
      },
      assistant: { assistantSpaceId: 'assistant:one', root },
    });

    await expect(
      handlers.executeGenerationTool(generationRequest(), new AbortController().signal),
    ).resolves.toMatchObject({ outcome: 'success', jobId: 'job:one' });
    expect(resolveAuthorizedWorkspace).toHaveBeenCalledWith('workspace-grant:one', 'workspace:one');
    expect(getJobs).toHaveBeenCalledWith({
      owner: { kind: 'workspace', workspaceId: 'workspace:one' },
      root,
    });
    expect(resolveModelRefForPurpose).toHaveBeenCalledWith('image.generate');
    expect(submitGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'provider:one', modelId: 'model:one' }),
    );
    expect(projectSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        request: generationRequest(),
        snapshot: expect.objectContaining({ ref: { kind: 'generation', jobId: 'job:one' } }),
      }),
    );

    const unsupportedControlRequest = {
      ...generationRequest(),
      toolCallId: 'call:unsupported-image-control',
      input: {
        purpose: 'image.generate',
        lifecycleMode: 'detached',
        generationType: 'image-to-image',
        request: {
          prompt: 'Keep the subject identity',
          ipAdapterRefs: [
            {
              imageLocator: { file: { authority: 'workspace', path: 'references/subject.png' } },
              mode: 'subject',
            },
          ],
        },
      },
    } satisfies DshAcpDomainToolRequest;
    await expect(
      handlers.executeGenerationTool(unsupportedControlRequest, new AbortController().signal),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: {
        code: 'GENERATION_DSH_TOOL_FAILED',
        message: expect.stringContaining('image.reference.ip-adapter'),
      },
    });
    expect(submitGeneration).toHaveBeenCalledTimes(1);
  });

  it('resolves the video model profile before submitting an Agent Generation Job', async () => {
    const root = await createRoot();
    const submitGeneration = vi.fn<GenerationJobPort['submitGeneration']>(async () =>
      generationSnapshot(),
    );
    const resolveModelRefForPurpose = vi.fn(() => ({
      providerId: 'minimax-provider',
      modelId: 'minimax-h3',
    }));
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: {
        async getByDshSessionId() {
          return sessionBinding();
        },
      },
      contexts: {
        async readContext() {
          return workspaceContext();
        },
      },
      workspaceGrants: {
        resolveAuthorizedWorkspace: vi.fn(async () => workspaceResolution(root)),
      },
      coordinateCanvasMutation,
      generationRuntime: {
        getJobs: vi.fn(async () => generationJobs(submitGeneration)),
      },
      generationProjection,
      configuration: {
        getApplicationConfig: vi.fn(),
        getWorkspaceConfig: vi.fn(
          () =>
            ({
              resolveModelRefForPurpose,
              getProvider: (providerId: string) =>
                providerId === 'minimax-provider'
                  ? { id: providerId, type: 'minimax', enabled: true }
                  : undefined,
              getModel: (modelId: string) =>
                modelId === 'minimax-h3'
                  ? {
                      id: modelId,
                      providerId: 'minimax-provider',
                      name: 'MiniMax-H3',
                      capabilities: ['video.generate', 'image_to_video'],
                      enabled: true,
                    }
                  : undefined,
            }) as never,
        ),
      },
      assistant: { assistantSpaceId: 'assistant:one', root },
    });

    await expect(
      handlers.executeGenerationTool(videoGenerationRequest(), new AbortController().signal),
    ).resolves.toMatchObject({ outcome: 'success', jobId: 'job:one' });
    expect(submitGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'minimax-provider',
        modelId: 'minimax-h3',
        parameterAdjustments: [
          { parameter: 'negativePrompt', reason: 'unsupported' },
          { parameter: 'resolution', reason: 'invalid' },
          { parameter: 'fps', reason: 'unsupported' },
          { parameter: 'generateAudio', reason: 'unsupported' },
          { parameter: 'motionStrength', reason: 'unsupported' },
          { parameter: 'cameraMovement', reason: 'unsupported' },
        ],
        request: {
          prompt: 'A slow upward push',
          providerId: 'minimax-provider',
          modelId: 'minimax-h3',
          inputs: [
            {
              type: 'image',
              role: 'first-frame',
              locator: { file: { authority: 'workspace', path: 'frames/SH01.png' } },
            },
          ],
          duration: 6,
          resolution: '768P',
          aspectRatio: '16:9',
        },
      }),
    );
  });

  it('resolves Canvas only after exact Workspace authorization', async () => {
    const root = await createRoot();
    const resolveAuthorizedWorkspace = vi.fn(async () => workspaceResolution(root));
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: {
        async getByDshSessionId() {
          return sessionBinding();
        },
      },
      contexts: {
        async readContext() {
          return workspaceContext();
        },
      },
      workspaceGrants: { resolveAuthorizedWorkspace },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection,
      configuration: {
        getApplicationConfig: vi.fn(),
        getWorkspaceConfig: vi.fn(),
      },
      assistant: { assistantSpaceId: 'assistant:one', root },
    });

    await expect(
      handlers.executeCanvasTool(
        { ...canvasRequest(), input: { documentPath: '' } },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'CANVAS_DSH_TOOL_INVALID_INPUT' },
    });
    expect(resolveAuthorizedWorkspace).not.toHaveBeenCalled();
  });

  it('coordinates an exact Canvas mutation before projecting the Agent-authored node', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'boards'), { recursive: true });
    await writeFile(
      join(root, 'boards', 'main.nkc'),
      JSON.stringify({
        name: 'Main',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [],
        connections: [],
      }),
    );
    const coordinateTarget = vi.fn();
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: {
        async getByDshSessionId() {
          return sessionBinding();
        },
      },
      contexts: {
        async readContext() {
          return workspaceContext();
        },
      },
      workspaceGrants: {
        resolveAuthorizedWorkspace: vi.fn(async () => workspaceResolution(root)),
      },
      coordinateCanvasMutation: async (target, operation) => {
        coordinateTarget(target);
        const documentPath = join(root, 'boards', 'main.nkc');
        const current = JSON.parse(await readFile(documentPath, 'utf8'));
        await writeFile(documentPath, JSON.stringify({ ...current, name: 'Saved host edit' }));
        return operation();
      },
      generationRuntime: { getJobs: vi.fn() },
      generationProjection,
      configuration: { getApplicationConfig: vi.fn(), getWorkspaceConfig: vi.fn() },
      assistant: { assistantSpaceId: 'assistant:one', root },
    });

    await expect(
      handlers.executeCanvasTool(
        {
          ...canvasRequest(),
          operation: 'apply',
          input: {
            documentPath: 'boards/main.nkc',
            command: {
              kind: 'create_node',
              node: { type: 'markdown', content: '# Agent node' },
            },
          },
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      outcome: 'success',
      result: {
        documentPath: 'boards/main.nkc',
        command: 'create_node',
        nodeType: 'markdown',
      },
    });
    expect(coordinateTarget).toHaveBeenCalledWith({
      workspaceId: 'workspace:one',
      canvasId: 'boards/main.nkc',
    });
    expect(JSON.parse(await readFile(join(root, 'boards', 'main.nkc'), 'utf8'))).toMatchObject({
      name: 'Saved host edit',
      nodes: [expect.objectContaining({ type: 'markdown', data: { content: '# Agent node' } })],
    });
  });

  it('resolves Character through the exact authoring target and Workspace grant', async () => {
    const root = await createRoot();
    const resolveAuthorizedWorkspace = vi.fn(async () => workspaceResolution(root));
    const query = vi.fn(async () => characterFacts());
    const resolveService = vi.fn(async () => ({ query, fillDraft: vi.fn() }));
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: {
        async getByDshSessionId() {
          return sessionBinding();
        },
      },
      contexts: {
        async readContext() {
          return {
            kind: 'authoring' as const,
            workspaceId: 'workspace:one',
            workspaceGrantId: 'workspace-grant:one',
            authority: { kind: 'project' as const, projectId: 'project:one' },
            target: {
              kind: 'character-project' as const,
              characterProjectId: 'character:one',
            },
          };
        },
      },
      workspaceGrants: { resolveAuthorizedWorkspace },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection,
      configuration: { getApplicationConfig: vi.fn(), getWorkspaceConfig: vi.fn() },
      assistant: { assistantSpaceId: 'assistant:one', root },
      character: { resolveService },
    });

    await expect(
      handlers.executeCharacterTool(
        {
          sessionId: 'dsh-session:one',
          turn: 1,
          toolCallId: 'call:character',
          sandboxMode: 'read-only',
          tool: 'openneko_character',
          operation: 'query',
          input: { characterProjectId: 'character:one' },
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      outcome: 'success',
      result: { characterProjectId: 'character:one' },
    });
    expect(resolveAuthorizedWorkspace).toHaveBeenCalledWith('workspace-grant:one', 'workspace:one');
    expect(resolveService).toHaveBeenCalledWith({
      workspaceId: 'workspace:one',
      workspacePath: root,
      projectId: 'project:one',
      characterProjectId: 'character:one',
    });
    expect(query).toHaveBeenCalledWith(
      { characterProjectId: 'character:one' },
      expect.any(AbortSignal),
    );
  });

  it('denies a read-only Character mutation before resolving Conversation or Workspace authority', async () => {
    const getByDshSessionId = vi.fn();
    const readContext = vi.fn();
    const resolveAuthorizedWorkspace = vi.fn();
    const resolveService = vi.fn();
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: { getByDshSessionId },
      contexts: { readContext },
      workspaceGrants: { resolveAuthorizedWorkspace },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection,
      configuration: { getApplicationConfig: vi.fn(), getWorkspaceConfig: vi.fn() },
      assistant: { assistantSpaceId: 'assistant:one', root: '/tmp/assistant' },
      character: { resolveService },
    });

    await expect(
      handlers.executeCharacterTool(
        {
          sessionId: 'dsh-session:one',
          turn: 1,
          toolCallId: 'call:character',
          sandboxMode: 'read-only',
          tool: 'openneko_character',
          operation: 'fill-draft',
          input: {
            characterProjectId: 'character:one',
            displayName: 'Mira',
            definition: emptyCharacterDefinition(),
          },
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'DSH_DOMAIN_TOOL_READ_ONLY' },
    });
    expect(getByDshSessionId).not.toHaveBeenCalled();
    expect(readContext).not.toHaveBeenCalled();
    expect(resolveAuthorizedWorkspace).not.toHaveBeenCalled();
    expect(resolveService).not.toHaveBeenCalled();
  });

  it('rejects absolute and escaping Cut paths before resolving a Workspace grant', async () => {
    const root = await createRoot();
    const resolveAuthorizedWorkspace = vi.fn(async () => workspaceResolution(root));
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: {
        async getByDshSessionId() {
          return sessionBinding();
        },
      },
      contexts: {
        async readContext() {
          return workspaceContext();
        },
      },
      workspaceGrants: { resolveAuthorizedWorkspace },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection,
      configuration: {
        getApplicationConfig: vi.fn(),
        getWorkspaceConfig: vi.fn(),
      },
      assistant: { assistantSpaceId: 'assistant:one', root },
    });

    for (const documentPath of ['/tmp/story.otio', '../story.otio']) {
      await expect(
        handlers.executeCutTool(
          { ...cutQueryRequest(), input: { documentPath } },
          new AbortController().signal,
        ),
      ).resolves.toMatchObject({
        outcome: 'failure',
        diagnostic: { code: 'CUT_DSH_TOOL_INVALID_INPUT' },
      });
    }
    expect(resolveAuthorizedWorkspace).not.toHaveBeenCalled();
  });

  it('reuses the Workspace Cut runtime export owner for DSH Job operations', async () => {
    const root = await createRoot();
    const resolveAuthorizedWorkspace = vi.fn(async () => workspaceResolution(root));
    const resolveExportService = vi.fn(() => ({
      submit: vi.fn(),
      describe: vi.fn(async () => exportTask('job:one')),
      cancel: vi.fn(),
    }));
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: {
        async getByDshSessionId() {
          return sessionBinding();
        },
      },
      contexts: {
        async readContext() {
          return workspaceContext();
        },
      },
      workspaceGrants: { resolveAuthorizedWorkspace },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection,
      configuration: {
        getApplicationConfig: vi.fn(),
        getWorkspaceConfig: vi.fn(),
      },
      assistant: { assistantSpaceId: 'assistant:one', root },
      cutRuntime: { resolveExportService } as never,
    });

    await expect(
      handlers.executeCutTool(exportDescribeRequest(), new AbortController().signal),
    ).resolves.toMatchObject({ outcome: 'success', jobId: 'job:one' });
    expect(resolveAuthorizedWorkspace).toHaveBeenCalledWith('workspace-grant:one', 'workspace:one');
    expect(resolveExportService).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace:one',
        workspacePath: root,
        authoring: expect.any(Object),
      }),
    );
  });

  it('queries and applies a real OTIO document through the exact Workspace grant', async () => {
    const root = await createRoot();
    const documentPath = join(root, 'cuts', 'story.otio');
    await mkdir(join(root, 'cuts'), { recursive: true });
    await writeFile(
      documentPath,
      serializeOtio(
        createOtioTimeline('Desktop DSH Cut', {
          profile: '1080p30',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 1920,
          height: 1080,
        }),
      ),
    );
    const resolveAuthorizedWorkspace = vi.fn(async () => workspaceResolution(root));
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: {
        async getByDshSessionId() {
          return sessionBinding();
        },
      },
      contexts: {
        async readContext() {
          return workspaceContext();
        },
      },
      workspaceGrants: { resolveAuthorizedWorkspace },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection,
      configuration: {
        getApplicationConfig: vi.fn(),
        getWorkspaceConfig: vi.fn(),
      },
      assistant: { assistantSpaceId: 'assistant:one', root },
    });

    const queried = await handlers.executeCutTool(cutQueryRequest(), new AbortController().signal);
    expect(queried).toMatchObject({
      outcome: 'success',
      result: { documentPath: 'cuts/story.otio', name: 'Desktop DSH Cut' },
    });
    expect(queried).not.toHaveProperty('result.fingerprint');
    if (queried.outcome !== 'success') throw new Error('Expected successful Cut query.');
    const queriedFacts = queried.result as {
      tracks: readonly [{ trackId: string }];
    };

    const applied = await handlers.executeCutTool(
      {
        ...cutQueryRequest(),
        sandboxMode: 'workspace-write',
        operation: 'apply',
        input: {
          documentPath: 'cuts/story.otio',
          commands: [
            { type: 'set-track-muted', trackId: queriedFacts.tracks[0].trackId, muted: true },
          ],
        },
      },
      new AbortController().signal,
    );
    expect(applied).toMatchObject({
      outcome: 'success',
      result: {
        documentPath: 'cuts/story.otio',
        name: 'Desktop DSH Cut',
        tracks: [{ audioMuted: true }],
      },
    });
    expect(resolveAuthorizedWorkspace).toHaveBeenCalledTimes(2);
    expect(resolveAuthorizedWorkspace).toHaveBeenNthCalledWith(
      1,
      'workspace-grant:one',
      'workspace:one',
    );
    expect(resolveAuthorizedWorkspace).toHaveBeenNthCalledWith(
      2,
      'workspace-grant:one',
      'workspace:one',
    );
    expect(JSON.parse(await readFile(documentPath, 'utf8'))).toMatchObject({
      name: 'Desktop DSH Cut',
    });
  });

  it('rejects an unknown Assistant Space without using application configuration', async () => {
    const root = await createRoot();
    const getApplicationConfig = vi.fn();
    const handlers = createDesktopDshDomainToolHandlers({
      bindings: {
        async getByDshSessionId() {
          return sessionBinding();
        },
      },
      contexts: {
        async readContext() {
          return { kind: 'assistant', assistantSpaceId: 'assistant:other', baseGrantIds: [] };
        },
      },
      workspaceGrants: { resolveAuthorizedWorkspace: vi.fn() },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection,
      configuration: { getApplicationConfig, getWorkspaceConfig: vi.fn() },
      assistant: { assistantSpaceId: 'assistant:one', root },
    });

    await expect(
      handlers.executeGenerationTool(generationRequest(), new AbortController().signal),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'GENERATION_DSH_ASSISTANT_UNAUTHORIZED' },
    });
    expect(getApplicationConfig).not.toHaveBeenCalled();
  });
});

function sessionBinding() {
  return {
    conversationId: '00000000-01ARZ3NDEKTSV4RRFFQ69G5FAV',
    dshSessionId: 'dsh-session:one',
  };
}

function workspaceContext() {
  return {
    kind: 'workspace' as const,
    workspaceId: 'workspace:one',
    workspaceGrantId: 'workspace-grant:one',
  };
}

function workspaceResolution(root: string) {
  return {
    workspaceGrantId: 'workspace-grant:one',
    windowId: 'window:one',
    workspace: {
      workspaceId: 'workspace:one',
      workspacePath: root,
      displayName: 'Workspace',
      locator: { kind: 'variable' as const, value: '${HOME}/workspace' },
    },
  };
}

function generationRequest(): DshAcpDomainToolRequest {
  return {
    sessionId: 'dsh-session:one',
    turn: 1,
    toolCallId: 'call:one',
    sandboxMode: 'workspace-write',
    tool: 'openneko_generation',
    operation: 'submit',
    input: {
      purpose: 'image.generate',
      lifecycleMode: 'detached',
      generationType: 'text-to-image',
      request: { prompt: 'cat' },
    },
  };
}

function videoGenerationRequest(): DshAcpDomainToolRequest {
  return {
    sessionId: 'dsh-session:one',
    turn: 1,
    toolCallId: 'call:video',
    sandboxMode: 'workspace-write',
    tool: 'openneko_generation',
    operation: 'submit',
    input: {
      purpose: 'video.generate',
      lifecycleMode: 'detached',
      generationType: 'image-to-video',
      request: {
        prompt: 'A slow upward push',
        negativePrompt: 'text',
        inputs: [
          {
            type: 'image',
            role: 'first-frame',
            locator: { file: { authority: 'workspace', path: 'frames/SH01.png' } },
          },
        ],
        duration: 6,
        resolution: '1080p',
        fps: 24,
        aspectRatio: '16:9',
        generateAudio: false,
        motionStrength: 0.25,
        cameraMovement: 'dolly-in',
      },
    },
  };
}

function canvasRequest(): DshAcpDomainToolRequest {
  return {
    sessionId: 'dsh-session:one',
    turn: 1,
    toolCallId: 'call:canvas',
    sandboxMode: 'workspace-write',
    tool: 'openneko_canvas',
    operation: 'query',
    input: { documentPath: 'boards/main.nkc' },
  };
}

function documentRequest(): DshAcpDomainToolRequest {
  return {
    sessionId: 'dsh-session:one',
    turn: 1,
    toolCallId: 'call:document',
    sandboxMode: 'read-only',
    tool: 'openneko_document',
    operation: 'read',
    input: { source: { file: { authority: 'workspace', path: 'notes.md' } } },
  };
}

function cutQueryRequest(): DshAcpDomainToolRequest {
  return {
    sessionId: 'dsh-session:one',
    turn: 1,
    toolCallId: 'call:cut',
    sandboxMode: 'read-only',
    tool: 'openneko_cut',
    operation: 'query',
    input: { documentPath: 'cuts/story.otio' },
  };
}

function exportDescribeRequest(): DshAcpDomainToolRequest {
  return {
    ...cutQueryRequest(),
    operation: 'export-describe',
    input: { documentPath: 'cuts/story.otio', jobId: 'job:one' },
  };
}

function exportTask(jobId: string) {
  return {
    jobId,
    documentUri: 'cuts/story.otio',
    sessionId: 'cut-session:one',
    sourceSnapshotId: 'sha256:fingerprint',
    settings: {
      outputName: 'story',
      container: 'mp4' as const,
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      videoBitrate: 8_000_000,
      includeAudio: false,
      audioBitrate: 192_000,
      audioSampleRate: 48_000 as const,
    },
    outputWorkspaceRelativePath: 'exports/story.mp4',
    status: 'running' as const,
    startedAt: 1,
  };
}

function generationJobs(
  submitGeneration: GenerationJobPort['submitGeneration'],
): GenerationJobPort {
  return {
    submitGeneration,
    describeGeneration: async () => generationSnapshot(),
    async *observeGeneration() {
      yield succeededGenerationSnapshot();
    },
    cancelGeneration: async () => generationSnapshot(),
    retryGeneration: async () => generationSnapshot(),
    regenerateGeneration: async () => generationSnapshot(),
    reconcileGeneration: async () => generationSnapshot(),
  };
}

function generationSnapshot(): GenerationJobSnapshot {
  return {
    ref: { kind: 'generation' as const, jobId: 'job:one' },
    phase: 'pending' as const,
    lifecycleMode: 'detached' as const,
    request: {
      providerId: 'provider:one',
      modelId: 'model:one',
      generationType: 'text-to-image' as const,
      request: { prompt: 'cat', providerId: 'provider:one', modelId: 'model:one' },
    },
    progress: { stage: 'queued' as const, percent: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
}

function succeededGenerationSnapshot(): GenerationJobSnapshot {
  return {
    ...generationSnapshot(),
    phase: 'succeeded',
    progress: { stage: 'completed', percent: 100 },
    resultLocators: [
      { file: { authority: 'workspace', path: 'neko/generated/job-one/image.png' } },
    ],
    updatedAt: 2,
  };
}

function characterFacts() {
  return {
    characterProjectId: 'character:one',
    displayName: 'Mira',
    reviewStatus: 'draft' as const,
    isFreshTarget: true,
    draft: {
      hasSummary: false,
      hasBackground: false,
      hasOrigin: false,
      canonCount: 0,
      knowledgeBoundaryCount: 0,
      behaviorPolicyCount: 0,
      expressionPolicyCount: 0,
      representationCount: 0,
    },
    evidenceCount: 0,
    candidateCount: 0,
    versionCount: 0,
    versions: [],
    versionsTruncated: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function emptyCharacterDefinition() {
  return {
    summary: '',
    backgroundStory: {
      overview: '',
      origins: [],
      personalHistory: [],
      formativeEvents: [],
      establishedRelationships: [],
    },
    originSetting: {
      overview: '',
      eras: [],
      cultures: [],
      socialEnvironment: [],
      importantPlaces: [],
      organizations: [],
      believedRules: [],
    },
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
}

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-dsh-tool-workspace-'));
  roots.push(root);
  return root;
}
