import type { DesktopAgentConnectionIdentity } from '@neko/agent-contracts';
import type {
  AutomationTargetSelectionDecision,
  AutomationTargetSelectionProjection,
  AutomationTargetSelectionRuntime,
} from '@neko/automation-contracts/target-selection';
import type { OpenNekoDesktopAutomationTargetSelectionBridge } from '../shared/automation-target-selection-contract';

export function createDesktopAutomationTargetSelectionRuntime(options: {
  readonly connection: DesktopAgentConnectionIdentity;
  readonly conversationId: string;
  readonly bridge: OpenNekoDesktopAutomationTargetSelectionBridge['automationTargetSelection'];
  readonly createRequestId?: () => string;
}): AutomationTargetSelectionRuntime {
  const identity = Object.freeze({
    workspaceId: exactIdentity(options.connection.workspaceId, 'Workspace'),
    conversationId: exactIdentity(options.conversationId, 'Conversation'),
  });
  const createRequestId = options.createRequestId ?? createDefaultRequestId;
  let disposed = false;

  const listPending = async (): Promise<readonly AutomationTargetSelectionProjection[]> => {
    requireActive();
    const result = await options.bridge.execute({
      requestId: exactIdentity(createRequestId(), 'Automation target selection request'),
      connection: options.connection,
      conversationId: identity.conversationId,
      route: 'pending.list',
    });
    requireExactOwners(result.pending, identity);
    return result.pending;
  };
  const requireActive = (): void => {
    if (disposed) throw new Error('Desktop Automation target selection runtime is disposed.');
  };

  return {
    identity,
    listPending,
    async resolve(decision: AutomationTargetSelectionDecision) {
      requireActive();
      const result = await options.bridge.execute({
        requestId: exactIdentity(createRequestId(), 'Automation target selection request'),
        connection: options.connection,
        conversationId: identity.conversationId,
        route: 'selection.resolve',
        decision,
      });
      requireExactOwners(result.pending, identity);
    },
    subscribe(listener) {
      requireActive();
      return options.bridge.subscribe(listener);
    },
    dispose() {
      disposed = true;
    },
  };
}

function requireExactOwners(
  pending: readonly AutomationTargetSelectionProjection[],
  owner: { readonly workspaceId: string; readonly conversationId: string },
): void {
  if (
    pending.some(
      (projection) =>
        projection.owner.workspaceId !== owner.workspaceId ||
        projection.owner.conversationId !== owner.conversationId,
    )
  ) {
    throw new Error('Desktop Automation target selection returned a foreign owner projection.');
  }
}

let requestSequence = 0;

function createDefaultRequestId(): string {
  requestSequence += 1;
  return `automation-target-selection:${Date.now()}:${requestSequence}`;
}

function exactIdentity(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  ) {
    throw new Error(`Desktop Automation ${label} identity is invalid.`);
  }
  return value;
}
