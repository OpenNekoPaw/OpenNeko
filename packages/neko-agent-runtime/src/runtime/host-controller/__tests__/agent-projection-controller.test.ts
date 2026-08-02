import { describe, expect, it, vi } from 'vitest';
import type { AgentWebviewToHostMessage } from '@neko-agent/contracts';
import {
  tryHandleAgentProjectionControllerRoute,
  type AgentHostRouteEffectContext,
  type AgentProjectionControllerEffectPort,
} from '..';

const key = {
  endpointEpoch: 'endpoint-1',
  attachmentId: 'attachment-1',
  tabId: 'tab-1',
  conversationId: 'conversation-1',
};

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

function createEffects(): AgentProjectionControllerEffectPort {
  return {
    discoverEndpoint: vi.fn(),
    attach: vi.fn(),
    acknowledge: vi.fn(),
    detach: vi.fn(),
  };
}

async function dispatch(
  message: AgentWebviewToHostMessage,
  effects: AgentProjectionControllerEffectPort,
  context: AgentHostRouteEffectContext,
): Promise<void> {
  const operation = tryHandleAgentProjectionControllerRoute(message, effects, context);
  if (!operation) {
    throw new Error(`Expected shared projection controller to handle ${message.type}.`);
  }
  await operation;
}

describe('Agent projection controller', () => {
  it('routes endpoint discovery and attachment lifecycle with connection context', async () => {
    const effects = createEffects();
    const context = createContext();
    const discovery = {
      type: 'projectionEndpointDiscover' as const,
      protocolVersion: 1 as const,
      realmId: 'realm-1',
    };
    const attach = { type: 'projectionAttach' as const, key };
    const acknowledgement = {
      type: 'projectionSnapshotAck' as const,
      key,
      sequence: 0 as const,
      projectionVersion: 2,
    };
    const detach = {
      type: 'projectionDetach' as const,
      key,
      reason: 'tab-closed' as const,
    };

    await dispatch(discovery, effects, context);
    await dispatch(attach, effects, context);
    await dispatch(acknowledgement, effects, context);
    await dispatch(detach, effects, context);

    expect(effects.discoverEndpoint).toHaveBeenCalledWith(discovery, context);
    expect(effects.attach).toHaveBeenCalledWith(attach, context);
    expect(effects.acknowledge).toHaveBeenCalledWith(acknowledgement, context);
    expect(effects.detach).toHaveBeenCalledWith(detach, context);
  });

  it('returns projection effect failures to the Host composition', async () => {
    const effects = createEffects();
    const context = createContext();
    const failure = new Error('Stale endpoint');
    effects.acknowledge = vi.fn().mockRejectedValue(failure);

    const operation = tryHandleAgentProjectionControllerRoute(
      {
        type: 'projectionSnapshotAck',
        key,
        sequence: 0,
        projectionVersion: 2,
      },
      effects,
      context,
    );

    await expect(operation).rejects.toBe(failure);
  });

  it('does not claim routes owned by another controller', () => {
    expect(
      tryHandleAgentProjectionControllerRoute(
        { type: 'getConfig' },
        createEffects(),
        createContext(),
      ),
    ).toBeNull();
  });
});
