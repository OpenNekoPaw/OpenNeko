import { createOpenNekoPiModels } from '@neko/agent/pi';
import { createToolRegistry } from '@neko/agent/tool-registry';
import type { AgentHostToWebviewMessage } from '@neko-agent/types';
import { describe, expect, it, vi } from 'vitest';
import type { DesktopAgentWorkspaceRuntime } from './desktop-agent-app-host-composition';
import {
  auditDesktopAgentStartup,
} from './desktop-agent-bridge-runtime';
import {
  createDesktopAgentControllerComposition,
  projectDesktopAgentSecretSafeConfig,
} from './desktop-agent-controller-composition';
import { createDesktopAgentCredentialRuntime } from './desktop-agent-credential-runtime';

describe('Desktop Agent controller composition', () => {
  it('advertises the complete base effect composition and routes through workspace owners', async () => {
    const workspace = createWorkspace();
    const posted: AgentHostToWebviewMessage[] = [];
    const composition = createDesktopAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      contentInteraction: {
        openContent: vi.fn(),
        revealDocument: vi.fn(),
        selectWorkspaceWriteTarget: vi.fn(),
      },
      configInteraction: {
        openUserConfig: vi.fn(),
        openWorkspaceConfig: vi.fn(),
      },
      reportError: vi.fn(),
    });
    const effects = composition.createEffects({
      workspace,
      identity: {
        applicationInstanceId: 'app-1',
        windowId: 'window-1',
        projectId: 'project-1',
        workspaceId: workspace.workspaceId,
        viewId: 'view-1',
        viewEpoch: 1,
        rendererEpoch: 1,
        connectionId: 'connection-1',
      },
    });
    const context = {
      identity: {
        hostKind: 'electron' as const,
        applicationId: 'neko-desktop',
        windowId: 'window-1',
        viewId: 'view-1',
        workspaceId: workspace.workspaceId,
        rendererEpoch: '1',
        connectionId: 'connection-1',
      },
      post: async (message: AgentHostToWebviewMessage) => {
        posted.push(message);
      },
    };

    expect(composition.requirements).toEqual({
      'conversation-effects': true,
      'config-effects': true,
      'skill-effects': true,
      'content-effects': true,
      'projection-effects': true,
    });
    expect(auditDesktopAgentStartup(composition)).toEqual({ ready: true });

    await effects.conversation.createConversation(context);
    expect(workspace.createConversation).toHaveBeenCalledOnce();
    expect(posted.map((message) => message.type)).toEqual([
      'conversationList',
      'tabState',
      'activeConversation',
    ]);

    await effects.projection.discoverEndpoint(
      {
        type: 'projectionEndpointDiscover',
        protocolVersion: 1,
        realmId: 'realm-1',
      },
      context,
    );
    expect(posted.at(-1)).toEqual({
      type: 'projectionEndpointReady',
      protocolVersion: 1,
      realmId: 'realm-1',
      endpointEpoch: 'connection-1',
    });

    effects.dispose();
    await composition.dispose?.();
  });

  it('removes credential material from renderer config projection', () => {
    const projected = projectDesktopAgentSecretSafeConfig({
      providers: [],
      configuredProviders: [
        {
          id: 'provider-1',
          name: 'Provider',
          type: 'openai',
          enabled: true,
          apiKey: 'must-not-cross-renderer',
          baseUrl: 'https://example.test',
          models: [],
        },
      ],
      selectedProviderId: 'provider-1',
      selectedModelId: 'model-1',
      customSystemPrompt: '',
      autoExecuteTools: false,
      streamResponses: true,
      showToolCalls: true,
      temperature: 0.7,
      maxTokens: 2048,
      executionMode: 'ask',
      chatModelOptions: [],
      modelGroups: [],
      defaultMediaModels: {},
    });

    expect(JSON.stringify(projected)).not.toContain('must-not-cross-renderer');
    expect(projected.configuredProviders[0]).not.toHaveProperty('apiKey');
  });
});

function createWorkspace(): DesktopAgentWorkspaceRuntime & {
  readonly createConversation: ReturnType<typeof vi.fn>;
} {
  const records: Array<{
    workspaceId: string;
    conversationId: string;
    title: string;
    activeBranchId: string;
    createdAt: string;
    updatedAt: string;
  }> = [];
  const createConversation = vi.fn(async (conversationId: string) => {
    records.push({
      workspaceId: 'workspace-1',
      conversationId,
      title: 'New conversation',
      activeBranchId: 'main',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
    });
  });
  return {
    workspaceId: 'workspace-1',
    workspace: {
      workspaceId: 'workspace-1',
      workspacePath: '/workspace/demo',
      displayName: 'Demo',
      locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
    },
    models: createOpenNekoPiModels({
      read: async () => undefined,
      modify: async (_providerId, operation) => operation(undefined),
      delete: async () => undefined,
    }),
    tools: createToolRegistry(),
    createConversation,
    deleteConversation: vi.fn(),
    clearAllConversations: vi.fn(),
    openConversation: vi.fn(),
    startTurn: vi.fn(),
    executeTurn: vi.fn(),
    cancelTurn: vi.fn(),
    readActiveTurn: vi.fn(),
    readConversationEntries: vi.fn(async () => []),
    readContextTokenCount: vi.fn(async () => 0),
    clearContext: vi.fn(),
    compactContext: vi.fn(),
    readSkillCatalog: vi.fn(async () => ({
      records: [],
      diagnostics: [],
      warnings: [],
    })),
    listConversations: () => records,
    readConversationEvidence: vi.fn(),
    readConversationProjection: vi.fn(() => ({
      conversationId: records[0]?.conversationId ?? 'conversation-1',
      projectionVersion: 0,
      turns: [],
    })),
    subscribeConversationProjection: vi.fn(() => () => undefined),
    dispose: vi.fn(),
  };
}

function createHost() {
  return {
    files: {
      readText: vi.fn(),
      readBytes: vi.fn(),
      writeText: vi.fn(),
      writeBytes: vi.fn(),
      rename: vi.fn(),
      readDirectory: vi.fn(),
      stat: vi.fn(),
      createDirectory: vi.fn(),
      delete: vi.fn(),
    },
    paths: {
      resolvePath: vi.fn(),
      contractPath: vi.fn(),
      dirname: vi.fn(),
      basename: vi.fn(),
      join: vi.fn(),
      normalizePath: vi.fn(),
      isAbsolute: vi.fn(),
      isInside: vi.fn(),
    },
    accessPolicy: {
      decide: vi.fn(async () => ({ allowed: true as const })),
    },
    external: {
      openExternal: vi.fn(),
      revealPath: vi.fn(),
    },
  };
}

function createCredentialRuntime() {
  return createDesktopAgentCredentialRuntime({
    secrets: {
      get: async () => undefined,
      set: async () => undefined,
      delete: async () => undefined,
    },
    prompt: {
      text: async () => null,
      select: async () => null,
      notify: () => undefined,
    },
  });
}
