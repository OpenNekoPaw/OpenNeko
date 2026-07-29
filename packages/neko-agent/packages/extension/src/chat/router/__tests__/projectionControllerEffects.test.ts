import { describe, expect, it, vi } from 'vitest';
import { createVSCodeProjectionControllerEffects } from '../projectionControllerEffects';
import type { VSCodeAgentHostControllerDeps } from '../types';

const key = {
  endpointEpoch: 'endpoint-1',
  attachmentId: 'attachment-1',
  tabId: 'tab-1',
  conversationId: 'conversation-1',
};

function createDeps(): VSCodeAgentHostControllerDeps {
  return {
    projectionAttachments: {
      attach: vi.fn().mockResolvedValue(undefined),
      acknowledge: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
    },
    announceProjectionEndpoint: vi.fn(),
    reportProjectionProtocolError: vi.fn(),
  } as unknown as VSCodeAgentHostControllerDeps;
}

describe('VS Code projection controller effects', () => {
  it('maps endpoint and attachment operations to the existing projection owner', async () => {
    const deps = createDeps();
    const effects = createVSCodeProjectionControllerEffects(deps);
    const context = {} as never;
    const attach = { type: 'projectionAttach' as const, key };
    const acknowledgement = {
      type: 'projectionSnapshotAck' as const,
      key,
      sequence: 0,
      projectionVersion: 2,
    };
    const detach = {
      type: 'projectionDetach' as const,
      key,
      reason: 'tab-closed' as const,
    };

    await effects.discoverEndpoint(
      {
        type: 'projectionEndpointDiscover',
        protocolVersion: 1,
        realmId: 'realm-1',
      },
      context,
    );
    await effects.attach(attach, context);
    await effects.acknowledge(acknowledgement, context);
    await effects.detach(detach, context);

    expect(deps.announceProjectionEndpoint).toHaveBeenCalledWith(1, 'realm-1');
    expect(deps.projectionAttachments.attach).toHaveBeenCalledWith(attach);
    expect(deps.projectionAttachments.acknowledge).toHaveBeenCalledWith(acknowledgement);
    expect(deps.projectionAttachments.detach).toHaveBeenCalledWith(detach);
  });

  it('projects rejected attachment operations through the protocol diagnostic owner', async () => {
    const deps = createDeps();
    const effects = createVSCodeProjectionControllerEffects(deps);
    const failure = new Error('Stale endpoint');
    vi.mocked(deps.projectionAttachments.acknowledge).mockRejectedValueOnce(failure);

    await effects.acknowledge(
      {
        type: 'projectionSnapshotAck',
        key,
        sequence: 0,
        projectionVersion: 2,
      },
      {} as never,
    );

    expect(deps.reportProjectionProtocolError).toHaveBeenCalledWith(failure, key);
  });
});
