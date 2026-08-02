import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_SHARED_CONTROLLER_ROUTE_TYPES,
  createAgentHostMessageController,
  type AgentHostControllerEffectPorts,
  type AgentHostRouteEffectContext,
} from '..';

function createEffects(): AgentHostControllerEffectPorts {
  return {
    conversation: {
      submitTurn: vi.fn(),
      confirmTool: vi.fn(),
      cancelTurn: vi.fn(),
      createConversation: vi.fn(),
      activateConversation: vi.fn(),
      deleteConversation: vi.fn(),
      listConversations: vi.fn(),
      readActiveConversation: vi.fn(),
      readAgentStates: vi.fn(),
      readConversationSnapshot: vi.fn(),
      readMessageQueue: vi.fn(),
      promoteQueuedMessage: vi.fn(),
      cancelQueuedMessage: vi.fn(),
      editQueuedMessage: vi.fn(),
      clearHistory: vi.fn(),
      clearAllConversations: vi.fn(),
    },
    config: {
      readSettings: vi.fn(),
      readConfig: vi.fn(),
      refreshConfig: vi.fn(),
      openUserConfig: vi.fn(),
      openHostConfig: vi.fn(),
      readTabState: vi.fn(),
      updateSettings: vi.fn(),
      updateTabState: vi.fn(),
    },
    skill: {
      listSkills: vi.fn(),
      invokeSlashCommand: vi.fn(),
      invokeSkill: vi.fn(),
      readContextTokenCount: vi.fn(),
      compressContext: vi.fn(),
    },
    content: {
      searchProjectFiles: vi.fn(),
      openFile: vi.fn(),
      revealDocumentLocator: vi.fn(),
      revealFile: vi.fn(),
      openExternalUrl: vi.fn(),
      revealContextSource: vi.fn(),
      downloadSvg: vi.fn(),
    },
    projection: {
      discoverEndpoint: vi.fn(),
      attach: vi.fn(),
      acknowledge: vi.fn(),
      detach: vi.fn(),
    },
  };
}

function createContext(): AgentHostRouteEffectContext {
  return {
    identity: {
      hostKind: 'electron',
      applicationId: 'app-1',
      windowId: 'window-1',
      viewId: 'view-1',
      workspaceId: 'workspace-1',
      rendererEpoch: 'renderer-1',
      connectionId: 'connection-1',
    },
    post: vi.fn(),
  };
}

describe('Agent Host message controller', () => {
  it('owns one connection identity and composes every responsibility partition', async () => {
    const effects = createEffects();
    const context = createContext();
    const controller = createAgentHostMessageController(effects, context);

    expect(controller.identity).toBe(context.identity);
    expect(AGENT_SHARED_CONTROLLER_ROUTE_TYPES).toHaveLength(41);

    await controller.tryHandle({ type: 'getConversations' });
    await controller.tryHandle({ type: 'getConfig' });
    await controller.tryHandle({ type: 'getSkills' });
    await controller.tryHandle({
      type: 'openFile',
      contentLocator: { kind: 'workspace-file', path: 'docs/readme.md' },
    });
    await controller.tryHandle({
      type: 'projectionEndpointDiscover',
      protocolVersion: 1,
      realmId: 'realm-1',
    });

    expect(effects.conversation.listConversations).toHaveBeenCalledWith(context);
    expect(effects.config.readConfig).toHaveBeenCalledWith(context);
    expect(effects.skill.listSkills).toHaveBeenCalledWith(context);
    expect(effects.content.openFile).toHaveBeenCalledWith(
      {
        contentLocator: { kind: 'workspace-file', path: 'docs/readme.md' },
      },
      context,
    );
    expect(effects.projection.discoverEndpoint).toHaveBeenCalledWith(
      {
        type: 'projectionEndpointDiscover',
        protocolVersion: 1,
        realmId: 'realm-1',
      },
      context,
    );
  });

  it('returns null for Host-specific routes instead of claiming an implementation', () => {
    const controller = createAgentHostMessageController(createEffects(), createContext());

    expect(
      controller.tryHandle({
        type: 'dnd:start',
        asset: {
          path: 'image.png',
          name: 'image.png',
          mediaType: 'image',
        },
      }),
    ).toBeNull();
  });

  it('propagates the selected effect failure without trying another partition', async () => {
    const effects = createEffects();
    const failure = new Error('Config unavailable');
    effects.config.readConfig = vi.fn().mockRejectedValue(failure);
    const controller = createAgentHostMessageController(effects, createContext());

    await expect(controller.tryHandle({ type: 'getConfig' })).rejects.toBe(failure);
    expect(effects.skill.listSkills).not.toHaveBeenCalled();
    expect(effects.content.openFile).not.toHaveBeenCalled();
  });
});
