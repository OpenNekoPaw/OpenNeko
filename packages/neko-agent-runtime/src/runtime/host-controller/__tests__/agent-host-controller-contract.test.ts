import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_CONFIG_CONTROLLER_ROUTE_TYPES,
  AGENT_CONTENT_CONTROLLER_ROUTE_TYPES,
  AGENT_CONVERSATION_CONTROLLER_ROUTE_TYPES,
  AGENT_PROJECTION_CONTROLLER_ROUTE_TYPES,
  AGENT_SHARED_CONTROLLER_ROUTE_TYPES,
  AGENT_SKILL_CONTROLLER_ROUTE_TYPES,
  type AgentHostControllerConnection,
} from '../agent-host-controller-contract';
import { ELECTRON_AGENT_HOST_ROUTE_COVERAGE } from '@neko-agent/contracts';

describe('Agent Host controller contract', () => {
  it('partitions every Electron implemented route exactly once', () => {
    const partitions = [
      AGENT_CONVERSATION_CONTROLLER_ROUTE_TYPES,
      AGENT_CONFIG_CONTROLLER_ROUTE_TYPES,
      AGENT_SKILL_CONTROLLER_ROUTE_TYPES,
      AGENT_CONTENT_CONTROLLER_ROUTE_TYPES,
      AGENT_PROJECTION_CONTROLLER_ROUTE_TYPES,
    ];
    const implementedRoutes = Object.entries(ELECTRON_AGENT_HOST_ROUTE_COVERAGE)
      .filter(([, support]) => support === 'implemented')
      .map(([route]) => route)
      .sort();

    expect(AGENT_SHARED_CONTROLLER_ROUTE_TYPES).toHaveLength(41);
    expect(new Set(AGENT_SHARED_CONTROLLER_ROUTE_TYPES).size).toBe(41);
    expect(partitions.flat().sort()).toEqual(implementedRoutes);
  });

  it('keeps connection identity and transport instance-scoped', () => {
    const listener = vi.fn();
    const dispose = vi.fn();
    const post = vi.fn();
    const connection: AgentHostControllerConnection = {
      identity: {
        hostKind: 'electron',
        applicationId: 'app-1',
        windowId: 'window-1',
        viewId: 'view-1',
        workspaceId: 'workspace-1',
        rendererEpoch: 'renderer-1',
        connectionId: 'connection-1',
      },
      post,
      subscribe(next) {
        next({ type: 'getSettings', conversationId: 'conversation-1' });
        return { dispose };
      },
    };

    const subscription = connection.subscribe(listener);
    connection.post({ type: 'globalError', message: 'test diagnostic' });
    subscription.dispose();

    expect(listener).toHaveBeenCalledWith({
      type: 'getSettings',
      conversationId: 'conversation-1',
    });
    expect(post).toHaveBeenCalledWith({
      type: 'globalError',
      message: 'test diagnostic',
    });
    expect(dispose).toHaveBeenCalledOnce();
  });
});
