import type { DesktopAgentConnectionIdentity } from '@neko/agent-contracts';
import type {
  AutomationSessionControlCommand,
  AutomationSessionControlProjection,
  AutomationSessionControlRuntime,
} from '@neko/automation-contracts/session-control';
import type { OpenNekoDesktopAutomationSessionControlBridge } from '../shared/automation-session-control-contract';

export function createDesktopAutomationSessionControlRuntime(options: {
  readonly connection: DesktopAgentConnectionIdentity;
  readonly conversationId: string;
  readonly bridge: OpenNekoDesktopAutomationSessionControlBridge['automationSessionControl'];
  readonly createRequestId?: () => string;
}): AutomationSessionControlRuntime {
  const identity = Object.freeze({
    workspaceId: exactIdentity(options.connection.workspaceId, 'Workspace'),
    conversationId: exactIdentity(options.conversationId, 'Conversation'),
  });
  const createRequestId = options.createRequestId ?? createDefaultRequestId;
  let disposed = false;

  const requireActive = (): void => {
    if (disposed) throw new Error('Desktop Automation session control runtime is disposed.');
  };
  const requireExactOwners = (controls: readonly AutomationSessionControlProjection[]): void => {
    if (
      controls.some((projection) => projection.owner.conversationId !== identity.conversationId)
    ) {
      throw new Error('Desktop Automation session control returned a foreign owner projection.');
    }
  };

  return {
    identity,
    async list() {
      requireActive();
      const result = await options.bridge.execute({
        requestId: exactIdentity(createRequestId(), 'Automation session control request'),
        connection: options.connection,
        conversationId: identity.conversationId,
        route: 'controls.list',
      });
      requireExactOwners(result.controls);
      return result.controls;
    },
    async control(command: AutomationSessionControlCommand) {
      requireActive();
      if (command.owner.conversationId !== identity.conversationId) {
        throw new Error('Desktop Automation session control command has a foreign owner.');
      }
      const result = await options.bridge.execute({
        requestId: exactIdentity(createRequestId(), 'Automation session control request'),
        connection: options.connection,
        conversationId: identity.conversationId,
        route: 'session.control',
        command,
      });
      requireExactOwners(result.controls);
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

let requestSequence = 0;

function createDefaultRequestId(): string {
  requestSequence += 1;
  return `automation-session-control:${Date.now()}:${requestSequence}`;
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
