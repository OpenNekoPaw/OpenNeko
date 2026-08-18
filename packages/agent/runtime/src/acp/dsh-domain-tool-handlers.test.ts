import type { DshAcpDomainToolRequest } from '@neko/agent-contracts/dsh-acp';
import { describe, expect, it, vi } from 'vitest';

import { createDshDomainToolHandlers } from './dsh-domain-tool-handlers';

describe('DSH domain Tool handlers', () => {
  it('uses the request Session identity to resolve Generation jobs', async () => {
    const resolve = vi.fn(async () => workspaceContext());
    const resolveJobs = vi.fn(async () => ({
      submitGeneration: vi.fn(async () => generationSnapshot()),
      describeGeneration: vi.fn(),
      observeGeneration: vi.fn(),
      cancelGeneration: vi.fn(),
      retryGeneration: vi.fn(),
      regenerateGeneration: vi.fn(),
      reconcileGeneration: vi.fn(),
    }));
    const handlers = createDshDomainToolHandlers({
      contexts: { resolve },
      generation: { resolveJobs },
      canvas: { resolveService: vi.fn() },
      cut: { resolveService: vi.fn() },
    });

    await expect(
      handlers.executeGenerationTool(generationRequest(), new AbortController().signal),
    ).resolves.toMatchObject({ outcome: 'success', jobId: 'job:one' });
    expect(resolve).toHaveBeenCalledWith('dsh-session:one');
    expect(resolveJobs).toHaveBeenCalledWith(workspaceContext());
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
      generation: { resolveJobs: vi.fn() },
      canvas: { resolveService },
      cut: { resolveService: vi.fn() },
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
      generation: { resolveJobs },
      canvas: { resolveService: vi.fn() },
      cut: { resolveService: vi.fn() },
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
      generation: { resolveJobs: vi.fn() },
      canvas: { resolveService: vi.fn() },
      cut: { resolveService },
    });

    await expect(
      handlers.executeCutTool(
        {
          sessionId: 'dsh-session:assistant',
          turn: 1,
          toolCallId: 'call:cut',
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

function generationRequest(): DshAcpDomainToolRequest {
  return {
    sessionId: 'dsh-session:one',
    turn: 1,
    toolCallId: 'call:one',
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
    tool: 'openneko.canvas',
    operation: 'query',
    input: { documentPath: 'boards/main.nkc' },
  };
}

function generationSnapshot() {
  return {
    ref: { kind: 'generation' as const, jobId: 'job:one' },
    phase: 'queued' as const,
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
