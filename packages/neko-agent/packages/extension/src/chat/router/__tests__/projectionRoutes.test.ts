import { describe, expect, it, vi } from 'vitest';
import type {
  ProjectionAttachRequest,
  ProjectionDetachMessage,
  ProjectionSnapshotAcknowledgement,
} from '@neko-agent/types';
import { tryHandleProjectionRoute } from '../projectionRoutes';
import type { ChatWebviewMessageRouterDeps } from '../types';

const key = {
  endpointEpoch: 'endpoint-1',
  attachmentId: 'attachment-1',
  tabId: 'tab-1',
  conversationId: 'conv-1',
};

function createDeps() {
  const projectionAttachments = {
    attach: vi.fn().mockResolvedValue(undefined),
    acknowledge: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
    abandon: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
  const announceProjectionEndpoint = vi.fn();
  const reportProjectionProtocolError = vi.fn();
  return {
    deps: {
      projectionAttachments,
      announceProjectionEndpoint,
      reportProjectionProtocolError,
    } as unknown as ChatWebviewMessageRouterDeps,
    projectionAttachments,
    announceProjectionEndpoint,
    reportProjectionProtocolError,
  };
}

describe('projection routes', () => {
  it('announces the endpoint for explicit discovery without touching attachment state', () => {
    const { deps, projectionAttachments, announceProjectionEndpoint } = createDeps();

    expect(
      tryHandleProjectionRoute(
        { type: 'projectionEndpointDiscover', protocolVersion: 1, realmId: 'realm-1' },
        deps,
      ),
    ).toBe(true);

    expect(announceProjectionEndpoint).toHaveBeenCalledWith(1, 'realm-1');
    expect(projectionAttachments.attach).not.toHaveBeenCalled();
    expect(projectionAttachments.acknowledge).not.toHaveBeenCalled();
    expect(projectionAttachments.detach).not.toHaveBeenCalled();
  });

  it('routes attach, snapshot acknowledgement, and detach to the endpoint server', () => {
    const { deps, projectionAttachments } = createDeps();
    const attach: ProjectionAttachRequest = { type: 'projectionAttach', key };
    const acknowledgement: ProjectionSnapshotAcknowledgement = {
      type: 'projectionSnapshotAck',
      key,
      sequence: 0,
      projectionVersion: 2,
    };
    const detach: ProjectionDetachMessage = {
      type: 'projectionDetach',
      key,
      reason: 'tab-closed',
    };

    expect(tryHandleProjectionRoute(attach, deps)).toBe(true);
    expect(tryHandleProjectionRoute(acknowledgement, deps)).toBe(true);
    expect(tryHandleProjectionRoute(detach, deps)).toBe(true);

    expect(projectionAttachments.attach).toHaveBeenCalledWith(attach);
    expect(projectionAttachments.acknowledge).toHaveBeenCalledWith(acknowledgement);
    expect(projectionAttachments.detach).toHaveBeenCalledWith(detach);
  });

  it('reports rejected attachment operations with the exact attachment identity', async () => {
    const { deps, projectionAttachments, reportProjectionProtocolError } = createDeps();
    const error = new Error('stale endpoint');
    projectionAttachments.acknowledge.mockRejectedValueOnce(error);

    expect(
      tryHandleProjectionRoute(
        {
          type: 'projectionSnapshotAck',
          key,
          sequence: 0,
          projectionVersion: 2,
        },
        deps,
      ),
    ).toBe(true);
    await Promise.resolve();

    expect(reportProjectionProtocolError).toHaveBeenCalledWith(error, key);
  });
});
