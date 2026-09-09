import type { DshAcpPermissionRequest } from '@neko/agent-runtime/acp';
import { describe, expect, it, vi } from 'vitest';

import { createDesktopDshProductHandlers } from './desktop-dsh-product-handlers';

describe('Desktop DSH product handlers', () => {
  it('owns exact pending permission until the advertised option is selected', async () => {
    const onPermissionChanged = vi.fn();
    const assembly = createDesktopDshProductHandlers({
      bindings: bindings(),
      contexts: {
        async readContext() {
          return undefined;
        },
      },
      workspaceGrants: { resolveAuthorizedWorkspace: vi.fn() },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection: {
        projectSnapshot: vi.fn(async () => ({ status: 'accepted' as const })),
      },
      configuration: {
        resolveModelRefForPurpose: vi.fn(),
        getProvider: vi.fn(),
        getModel: vi.fn(),
      },
      assistant: { assistantSpaceId: 'assistant:one', root: '/tmp/assistant' },
      skillAuthoring: { create: vi.fn() },
      cutRuntime: cutRuntime(),
      onPermissionChanged,
      onSessionUpdate: vi.fn(),
      onSessionEvent: vi.fn(),
      onContextPressure: vi.fn(),
    });
    const pending = assembly.handlers.requestPermission(permission(), {
      sessionId: 'dsh-session:one',
      turn: 2,
      toolCallId: 'tool:one',
    });
    await vi.waitFor(() => expect(assembly.permissions.list('conversation:one')).toHaveLength(1));
    await assembly.permissions.decide({
      conversationId: 'conversation:one',
      dshSessionId: 'dsh-session:one',
      turn: 2,
      toolCallId: 'tool:one',
      optionId: 'allow',
    });

    await expect(pending).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'allow' },
    });
    expect(onPermissionChanged).toHaveBeenCalledWith('conversation:one');
  });

  it('cancels only pending permissions when the handler assembly is disposed', async () => {
    const assembly = createDesktopDshProductHandlers({
      bindings: bindings(),
      contexts: {
        async readContext() {
          return undefined;
        },
      },
      workspaceGrants: { resolveAuthorizedWorkspace: vi.fn() },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection: {
        projectSnapshot: vi.fn(async () => ({ status: 'accepted' as const })),
      },
      configuration: {
        resolveModelRefForPurpose: vi.fn(),
        getProvider: vi.fn(),
        getModel: vi.fn(),
      },
      assistant: { assistantSpaceId: 'assistant:one', root: '/tmp/assistant' },
      skillAuthoring: { create: vi.fn() },
      cutRuntime: cutRuntime(),
      onPermissionChanged: vi.fn(),
      onSessionUpdate: vi.fn(),
      onSessionEvent: vi.fn(),
      onContextPressure: vi.fn(),
    });
    const pending = assembly.handlers.requestPermission(permission(), {
      sessionId: 'dsh-session:one',
      turn: 2,
      toolCallId: 'tool:one',
    });
    await vi.waitFor(() => expect(assembly.permissions.list('conversation:one')).toHaveLength(1));
    await assembly.dispose();

    await expect(pending).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('resets pending permissions while keeping the handler assembly reusable', async () => {
    const assembly = createDesktopDshProductHandlers({
      bindings: bindings(),
      contexts: {
        async readContext() {
          return undefined;
        },
      },
      workspaceGrants: { resolveAuthorizedWorkspace: vi.fn() },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection: {
        projectSnapshot: vi.fn(async () => ({ status: 'accepted' as const })),
      },
      configuration: {
        resolveModelRefForPurpose: vi.fn(),
        getProvider: vi.fn(),
        getModel: vi.fn(),
      },
      assistant: { assistantSpaceId: 'assistant:one', root: '/tmp/assistant' },
      skillAuthoring: { create: vi.fn() },
      cutRuntime: cutRuntime(),
      onPermissionChanged: vi.fn(),
      onSessionUpdate: vi.fn(),
      onSessionEvent: vi.fn(),
      onContextPressure: vi.fn(),
    });
    const first = assembly.handlers.requestPermission(permission(), {
      sessionId: 'dsh-session:one',
      turn: 2,
      toolCallId: 'tool:one',
    });
    await vi.waitFor(() => expect(assembly.permissions.list('conversation:one')).toHaveLength(1));
    await assembly.reset();
    await expect(first).resolves.toEqual({ outcome: { outcome: 'cancelled' } });

    const second = assembly.handlers.requestPermission(permission(), {
      sessionId: 'dsh-session:one',
      turn: 3,
      toolCallId: 'tool:one',
    });
    await vi.waitFor(() => expect(assembly.permissions.list('conversation:one')).toHaveLength(1));
    await assembly.reset();
    await expect(second).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('rejects an unregistered domain Tool at the Desktop composition boundary', async () => {
    const assembly = createDesktopDshProductHandlers({
      bindings: bindings(),
      contexts: { readContext: vi.fn() },
      workspaceGrants: { resolveAuthorizedWorkspace: vi.fn() },
      coordinateCanvasMutation,
      generationRuntime: { getJobs: vi.fn() },
      generationProjection: {
        projectSnapshot: vi.fn(async () => ({ status: 'accepted' as const })),
      },
      configuration: {
        resolveModelRefForPurpose: vi.fn(),
        getProvider: vi.fn(),
        getModel: vi.fn(),
      },
      assistant: { assistantSpaceId: 'assistant:one', root: '/tmp/assistant' },
      skillAuthoring: { create: vi.fn() },
      cutRuntime: cutRuntime(),
      onPermissionChanged: vi.fn(),
      onSessionUpdate: vi.fn(),
      onSessionEvent: vi.fn(),
      onContextPressure: vi.fn(),
    });

    await expect(
      assembly.handlers.executeDomainTool(
        {
          sessionId: 'dsh-session:one',
          turn: 1,
          toolCallId: 'tool:unknown',
          sandboxMode: 'read-only',
          tool: 'openneko_unknown',
          operation: 'query',
          input: {},
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('unsupported domain tool openneko_unknown');
  });
});

async function coordinateCanvasMutation<TResult>(
  _target: unknown,
  operation: () => Promise<TResult>,
): Promise<TResult> {
  return operation();
}

function bindings() {
  return {
    async get() {
      return undefined;
    },
    async getByDshSessionId(dshSessionId: string) {
      return { conversationId: 'conversation:one', dshSessionId };
    },
    async bind(): Promise<never> {
      throw new Error('Not used.');
    },
    async unbind(): Promise<never> {
      throw new Error('Not used.');
    },
  };
}

function permission(): DshAcpPermissionRequest {
  return {
    sessionId: 'dsh-session:one',
    toolCall: { toolCallId: 'tool:one', title: 'Write file' },
    options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }],
  };
}

function cutRuntime() {
  return {
    resolveExportService: vi.fn(() => ({
      submit: vi.fn(),
      describe: vi.fn(),
      cancel: vi.fn(),
    })) as never,
  };
}
