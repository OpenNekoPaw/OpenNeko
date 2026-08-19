import {
  parseDshPermissionHostRequest,
  type DshPermissionChangedEvent,
  type DshPermissionHostResult,
} from '@neko/agent-contracts/dsh-permission-host';
import type { DshPermissionOwner } from '@neko/agent-runtime/application';

import type { DesktopSenderIdentity } from './window-registry';

export interface DesktopDshPermissionHostWindowPort {
  resolveSender(sender: DesktopSenderIdentity): {
    readonly windowId: string;
    readonly rendererSessionId: string;
  };
}

export class DesktopDshPermissionHost {
  constructor(
    private readonly options: {
      readonly permissions: Pick<DshPermissionOwner, 'list' | 'decide' | 'cancel'>;
      readonly windows: DesktopDshPermissionHostWindowPort;
      readonly publishChanged: (event: DshPermissionChangedEvent) => void;
    },
  ) {}

  async execute(sender: DesktopSenderIdentity, value: unknown): Promise<DshPermissionHostResult> {
    const request = parseDshPermissionHostRequest(value);
    const window = this.options.windows.resolveSender(sender);
    if (
      window.windowId !== request.windowId ||
      window.rendererSessionId !== request.rendererSessionId
    ) {
      throw new Error('DSH permission request does not match its sender-bound renderer session.');
    }
    if (request.operation === 'decide') {
      await this.options.permissions.decide(request);
    } else if (request.operation === 'cancel') {
      await this.options.permissions.cancel(request);
    }
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      pending: this.options.permissions.list(request.conversationId),
    };
  }

  publishChanged(conversationId: string): void {
    this.options.publishChanged({ conversationId });
  }
}
