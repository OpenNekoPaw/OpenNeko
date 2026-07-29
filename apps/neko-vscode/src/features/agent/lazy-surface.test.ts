import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { DisposableStore } from '../../kernel/disposable-store';
import { createCapabilityContribution } from '../../kernel/capability-contribution';
import { createLazyCapability } from '../../kernel/lazy-capability';
import type { FeatureRuntimeContext } from '../../feature-runtime-context';
import type { NekoAgentRuntime } from './index';
import { registerLazyNekoAgentSurface } from './lazy-surface';

vi.mock('vscode', async () => await import('./__mocks__/vscode'));

describe('lazy Agent production surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers lightweight surfaces without starting the runtime and starts once on command use', async () => {
    let starts = 0;
    const runtime = createRuntime();
    const capability = createLazyCapability({
      id: 'neko.capability.agent-runtime',
      dependencies: {},
      async start() {
        starts += 1;
        return runtime.value;
      },
    });
    const owner = new DisposableStore();
    const contribution = await createCapabilityContribution({
      capability,
      owner,
      availability: {
        project: vi.fn(),
        reportProjectionFailure: vi.fn(),
      },
      reportUnavailable: vi.fn(),
    });

    registerLazyNekoAgentSurface({
      context: createContext(),
      capabilityId: capability.id,
      contribution,
    });

    expect(starts).toBe(0);
    expect(capability.state().status).toBe('idle');
    const sendMessage = command('neko.ai.sendMessage');
    await sendMessage?.('hello');
    await sendMessage?.('again');

    expect(starts).toBe(1);
    expect(runtime.sendMessageToAssistant).toHaveBeenNthCalledWith(1, 'hello', true);
    expect(runtime.sendMessageToAssistant).toHaveBeenNthCalledWith(2, 'again', true);
    expect(capability.state().status).toBe('ready');
    await owner.dispose();
  });

  it('renders and reports the causal diagnostic while an independent surface remains callable', async () => {
    const reportUnavailable = vi.fn();
    const capability = createLazyCapability({
      id: 'neko.capability.agent-runtime',
      dependencies: {},
      async start() {
        throw new Error('provider configuration is invalid');
      },
    });
    const owner = new DisposableStore();
    const contribution = await createCapabilityContribution({
      capability,
      owner,
      availability: {
        project: vi.fn(),
        reportProjectionFailure: vi.fn(),
      },
      reportUnavailable,
    });
    registerLazyNekoAgentSurface({
      context: createContext(),
      capabilityId: capability.id,
      contribution,
    });

    const webview = { html: '' };
    const provider = vi.mocked(vscode.window.registerWebviewViewProvider).mock.calls[0]?.[1];
    await provider?.resolveWebviewView(
      { webview } as vscode.WebviewView,
      {} as vscode.WebviewViewResolveContext,
      cancellationToken(),
    );

    expect(webview.html).toContain('neko.capability.agent-runtime/initialization-failed');
    expect(webview.html).toContain('provider configuration is invalid');
    expect(reportUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: 'neko.capability.agent-runtime',
        code: 'initialization-failed',
        causalChain: ['neko.capability.agent-runtime'],
      }),
    );

    await command('neko.ai.chat')?.();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('neko.aiAssistant.focus');
    expect(capability.state().status).toBe('unavailable');
    await owner.dispose();
  });
});

function command(id: string): ((...args: unknown[]) => unknown) | undefined {
  return vi
    .mocked(vscode.commands.registerCommand)
    .mock.calls.find(([registeredId]) => registeredId === id)?.[1];
}

function createContext(): FeatureRuntimeContext {
  return {
    signal: new AbortController().signal,
    subscriptions: [],
    workspaceState: {
      keys: () => [],
      get: (_key: string, defaultValue?: unknown) => defaultValue,
      update: async () => undefined,
    },
    globalStorageUri: vscode.Uri.file('/global/agent'),
    resourceUri: vscode.Uri.file('/extension/dist/features/neko-agent'),
    extensionMode: 1,
  };
}

function createRuntime(): {
  readonly value: NekoAgentRuntime;
  readonly sendMessageToAssistant: ReturnType<typeof vi.fn>;
} {
  const sendMessageToAssistant = vi.fn(async () => undefined);
  const chatViewProvider = {
    resolveWebviewView: vi.fn(),
    sendMessageToAssistant,
    sendContextPayload: vi.fn(async () => undefined),
    startCharacterDialogue: vi.fn(async () => null),
    startEmbodyCharacter: vi.fn(async () => ({ ok: true as const, sessionId: 'session-1' })),
    sendPluginSlashCommands: vi.fn(),
    setPluginCommandsGetter: vi.fn(),
    dndBroker: {
      getPayload: vi.fn(() => null),
      clearPayload: vi.fn(),
    },
  };
  return {
    value: {
      api: {
        getSkills: () => [],
        resolveGeneratedOutput: async () => ({
          status: 'unavailable',
          diagnostic: 'not part of this test',
        }),
      },
      chatViewProvider: chatViewProvider as NekoAgentRuntime['chatViewProvider'],
      refreshModels: async () => undefined,
    },
    sendMessageToAssistant,
  };
}

function cancellationToken(): vscode.CancellationToken {
  return {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => undefined }),
  };
}
