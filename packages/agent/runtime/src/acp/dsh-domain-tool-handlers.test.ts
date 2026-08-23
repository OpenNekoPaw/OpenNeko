import type { DshAcpDomainToolRequest } from '@neko/agent-contracts/dsh-acp';
import { describe, expect, it, vi } from 'vitest';

import { createDshDomainToolHandlers } from './dsh-domain-tool-handlers';

describe('DSH domain Tool handlers', () => {
  it('uses the request Session identity to resolve Generation jobs', async () => {
    const resolve = vi.fn(async () => workspaceContext());
    const resolveJobs = vi.fn(async () => ({
      submitGeneration: vi.fn(async () => generationSnapshot()),
      describeGeneration: vi.fn(),
      async *observeGeneration() {
        yield succeededGenerationSnapshot();
      },
      cancelGeneration: vi.fn(),
      retryGeneration: vi.fn(),
      regenerateGeneration: vi.fn(),
      reconcileGeneration: vi.fn(),
    }));
    const generation = generationHandlers(resolveJobs);
    const handlers = createDshDomainToolHandlers({
      contexts: { resolve },
      generation,
      canvas: { resolveService: vi.fn() },
      cut: { resolveService: vi.fn() },
      document: { resolveRuntime: vi.fn() },
      character: { resolveService: vi.fn() },
    });

    await expect(
      handlers.executeGenerationTool(generationRequest(), new AbortController().signal),
    ).resolves.toMatchObject({ outcome: 'success', jobId: 'job:one' });
    expect(resolve).toHaveBeenCalledWith('dsh-session:one');
    expect(resolveJobs).toHaveBeenCalledWith(workspaceContext());
    expect(generation.projectSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        context: workspaceContext(),
        request: generationRequest(),
        snapshot: expect.objectContaining({ ref: { kind: 'generation', jobId: 'job:one' } }),
      }),
    );
  });

  it('keeps Generation available in authoring context when Canvas projection is not admitted', async () => {
    const context = authoringContext();
    const resolveJobs = vi.fn(async () => ({
      submitGeneration: vi.fn(async () => generationSnapshot()),
      describeGeneration: vi.fn(),
      async *observeGeneration() {
        yield succeededGenerationSnapshot();
      },
    }));
    const projectSnapshot = vi.fn(async () => ({
      status: 'blocked' as const,
      diagnostic: {
        code: 'dsh-generation-canvas-context-unsupported',
        message: 'Authoring context has no automatic Workspace Board projection.',
      },
    }));
    const handlers = createDshDomainToolHandlers({
      contexts: { resolve: vi.fn(async () => context) },
      generation: { resolveJobs, projectSnapshot },
      canvas: { resolveService: vi.fn() },
      cut: { resolveService: vi.fn() },
      document: { resolveRuntime: vi.fn() },
      character: { resolveService: vi.fn() },
    });

    await expect(
      handlers.executeGenerationTool(generationRequest(), new AbortController().signal),
    ).resolves.toMatchObject({ outcome: 'success', jobId: 'job:one' });
    expect(resolveJobs).toHaveBeenCalledWith(context);
    expect(projectSnapshot).toHaveBeenCalledTimes(2);
  });

  it('rejects Canvas for a non-Workspace context without resolving a service', async () => {
    const resolveService = vi.fn();
    const handlers = createDshDomainToolHandlers({
      contexts: {
        async resolve() {
          return {
            conversationId: 'conversation:assistant',
            dshSessionId: 'dsh-session:assistant',
            binding: {
              kind: 'assistant',
              assistantSpaceId: 'assistant:one',
              baseGrantIds: [],
            },
          };
        },
      },
      generation: generationHandlers(),
      canvas: { resolveService },
      cut: { resolveService: vi.fn() },
      document: { resolveRuntime: vi.fn() },
      character: { resolveService: vi.fn() },
    });

    await expect(
      handlers.executeCanvasTool(canvasRequest(), new AbortController().signal),
    ).resolves.toEqual({
      outcome: 'failure',
      diagnostic: {
        code: 'CANVAS_DSH_CONTEXT_UNSUPPORTED',
        message: 'Canvas is unavailable for assistant Conversation context.',
      },
    });
    expect(resolveService).not.toHaveBeenCalled();
  });

  it('projects exact context resolution failures without calling a domain owner', async () => {
    const resolveJobs = vi.fn();
    const handlers = createDshDomainToolHandlers({
      contexts: {
        async resolve() {
          throw Object.assign(new Error('Session has no Conversation binding.'), {
            code: 'DSH_DOMAIN_TOOL_CONVERSATION_MISSING',
          });
        },
      },
      generation: generationHandlers(resolveJobs),
      canvas: { resolveService: vi.fn() },
      cut: { resolveService: vi.fn() },
      document: { resolveRuntime: vi.fn() },
      character: { resolveService: vi.fn() },
    });

    await expect(
      handlers.executeGenerationTool(generationRequest(), new AbortController().signal),
    ).resolves.toEqual({
      outcome: 'failure',
      diagnostic: {
        code: 'DSH_DOMAIN_TOOL_CONVERSATION_MISSING',
        message: 'Session has no Conversation binding.',
      },
    });
    expect(resolveJobs).not.toHaveBeenCalled();
  });

  it('rejects a read-only Generation mutation before resolving Conversation context', async () => {
    const resolve = vi.fn();
    const resolveJobs = vi.fn();
    const handlers = createDshDomainToolHandlers({
      contexts: { resolve },
      generation: generationHandlers(resolveJobs),
      canvas: { resolveService: vi.fn() },
      cut: { resolveService: vi.fn() },
      document: { resolveRuntime: vi.fn() },
      character: { resolveService: vi.fn() },
    });

    await expect(
      handlers.executeGenerationTool(
        { ...generationRequest(), sandboxMode: 'read-only' },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      outcome: 'failure',
      diagnostic: {
        code: 'DSH_DOMAIN_TOOL_READ_ONLY',
        message:
          "DSH sandbox mode 'read-only' does not permit openneko.generation operation 'submit'.",
      },
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(resolveJobs).not.toHaveBeenCalled();
  });

  it('rejects Cut for a non-Workspace context without resolving a service', async () => {
    const resolveService = vi.fn();
    const handlers = createDshDomainToolHandlers({
      contexts: {
        async resolve() {
          return {
            conversationId: 'conversation:assistant',
            dshSessionId: 'dsh-session:assistant',
            binding: {
              kind: 'assistant',
              assistantSpaceId: 'assistant:one',
              baseGrantIds: [],
            },
          };
        },
      },
      generation: generationHandlers(),
      canvas: { resolveService: vi.fn() },
      cut: { resolveService },
      document: { resolveRuntime: vi.fn() },
      character: { resolveService: vi.fn() },
    });

    await expect(
      handlers.executeCutTool(
        {
          sessionId: 'dsh-session:assistant',
          turn: 1,
          toolCallId: 'call:cut',
          sandboxMode: 'read-only',
          tool: 'openneko.cut',
          operation: 'query',
          input: { documentPath: 'cuts/story.otio' },
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      outcome: 'failure',
      diagnostic: {
        code: 'CUT_DSH_CONTEXT_UNSUPPORTED',
        message: 'Cut is unavailable for assistant Conversation context.',
      },
    });
    expect(resolveService).not.toHaveBeenCalled();
  });

  it('resolves Character only from an exact authoring target', async () => {
    const facts = {
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
    const resolveService = vi.fn(async () => ({
      query: vi.fn(async () => facts),
      fillDraft: vi.fn(async () => facts),
    }));
    const authoring = {
      conversationId: 'conversation:character',
      dshSessionId: 'dsh-session:character',
      binding: {
        kind: 'authoring' as const,
        workspaceId: 'workspace:one',
        workspaceGrantId: 'workspace-grant:one',
        authority: { kind: 'project' as const, projectId: 'project:one' },
        target: { kind: 'character-project' as const, characterProjectId: 'character:one' },
      },
    };
    const resolve = vi.fn(async () => authoring);
    const handlers = createDshDomainToolHandlers({
      contexts: { resolve },
      generation: generationHandlers(),
      canvas: { resolveService: vi.fn() },
      cut: { resolveService: vi.fn() },
      document: { resolveRuntime: vi.fn() },
      character: { resolveService },
    });

    await expect(
      handlers.executeCharacterTool(
        {
          sessionId: 'dsh-session:character',
          turn: 1,
          toolCallId: 'call:character',
          sandboxMode: 'read-only',
          tool: 'openneko.character',
          operation: 'query',
          input: { characterProjectId: 'character:one' },
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ outcome: 'success' });
    expect(resolve).toHaveBeenCalledWith('dsh-session:character');
    expect(resolveService).toHaveBeenCalledWith(authoring);
  });

  it('rejects Character for a Workspace context without resolving a service', async () => {
    const resolveService = vi.fn();
    const handlers = createDshDomainToolHandlers({
      contexts: { resolve: async () => workspaceContext() },
      generation: generationHandlers(),
      canvas: { resolveService: vi.fn() },
      cut: { resolveService: vi.fn() },
      document: { resolveRuntime: vi.fn() },
      character: { resolveService },
    });

    await expect(
      handlers.executeCharacterTool(
        {
          sessionId: 'dsh-session:one',
          turn: 1,
          toolCallId: 'call:character',
          sandboxMode: 'read-only',
          tool: 'openneko.character',
          operation: 'query',
          input: { characterProjectId: 'character:one' },
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'CHARACTER_DSH_CONTEXT_UNSUPPORTED' },
    });
    expect(resolveService).not.toHaveBeenCalled();
  });
});

function workspaceContext() {
  return {
    conversationId: 'conversation:one',
    dshSessionId: 'dsh-session:one',
    binding: {
      kind: 'workspace' as const,
      workspaceId: 'workspace:one',
      workspaceGrantId: 'workspace-grant:one',
    },
  };
}

function authoringContext() {
  return {
    conversationId: 'conversation:one',
    dshSessionId: 'dsh-session:one',
    binding: {
      kind: 'authoring' as const,
      workspaceId: 'workspace:one',
      workspaceGrantId: 'workspace-grant:one',
      authority: { kind: 'project' as const, projectId: 'project:one' },
      target: { kind: 'character-project' as const, characterProjectId: 'character:one' },
    },
  };
}

function generationHandlers(resolveJobs = vi.fn()) {
  return {
    resolveJobs,
    projectSnapshot: vi.fn(async () => ({ status: 'accepted' as const })),
  };
}

function generationRequest(): DshAcpDomainToolRequest {
  return {
    sessionId: 'dsh-session:one',
    turn: 1,
    toolCallId: 'call:one',
    sandboxMode: 'workspace-write',
    tool: 'openneko.generation',
    operation: 'submit',
    input: {
      purpose: 'image.generate',
      lifecycleMode: 'detached',
      generationType: 'text-to-image',
      request: { prompt: 'cat' },
    },
  };
}

function canvasRequest(): DshAcpDomainToolRequest {
  return {
    sessionId: 'dsh-session:assistant',
    turn: 1,
    toolCallId: 'call:canvas',
    sandboxMode: 'workspace-write',
    tool: 'openneko.canvas',
    operation: 'query',
    input: { documentPath: 'boards/main.nkc' },
  };
}

function generationSnapshot() {
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

function succeededGenerationSnapshot() {
  return {
    ...generationSnapshot(),
    phase: 'succeeded' as const,
    progress: { stage: 'completed' as const, percent: 100 },
    resultLocators: [
      { file: { authority: 'workspace' as const, path: 'neko/generated/job-one/image.png' } },
    ],
    updatedAt: 2,
  };
}
