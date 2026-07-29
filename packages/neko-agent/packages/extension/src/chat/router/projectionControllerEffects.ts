import type { AgentProjectionControllerEffectPort } from '@neko/agent/runtime';
import type { ProjectionAttachmentKey } from '@neko-agent/types';
import type { VSCodeAgentHostControllerDeps } from './types';

export function createVSCodeProjectionControllerEffects(
  deps: VSCodeAgentHostControllerDeps,
): AgentProjectionControllerEffectPort {
  return {
    discoverEndpoint: ({ protocolVersion, realmId }) =>
      deps.announceProjectionEndpoint(protocolVersion, realmId),
    attach: (message) =>
      runProjectionAttachmentOperation(
        () => deps.projectionAttachments.attach(message),
        message.key,
        deps,
      ),
    acknowledge: (message) =>
      runProjectionAttachmentOperation(
        () => deps.projectionAttachments.acknowledge(message),
        message.key,
        deps,
      ),
    detach: (message) =>
      runProjectionAttachmentOperation(
        () => deps.projectionAttachments.detach(message),
        message.key,
        deps,
      ),
  };
}

async function runProjectionAttachmentOperation(
  operation: () => Promise<void>,
  key: ProjectionAttachmentKey,
  deps: VSCodeAgentHostControllerDeps,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    deps.reportProjectionProtocolError(toError(error), key);
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
