import {
  parseDshRuntimeHostRequest,
  type DshRuntimeHostProjection,
  type DshRuntimeHostResult,
} from '@neko/agent-contracts/dsh-runtime-host';

import type { DesktopDshAgentRuntime } from './desktop-dsh-agent-runtime';
import type { DesktopSenderIdentity } from './window-registry';

export class DesktopDshRuntimeHost {
  constructor(
    private readonly options: {
      readonly runtime: Pick<DesktopDshAgentRuntime, 'getStatus' | 'restart'>;
      readonly windows: {
        resolveSender(sender: DesktopSenderIdentity): {
          readonly windowId: string;
          readonly rendererSessionId: string;
        };
      };
    },
  ) {}

  async execute(sender: DesktopSenderIdentity, value: unknown): Promise<DshRuntimeHostResult> {
    const request = parseDshRuntimeHostRequest(value);
    const window = this.options.windows.resolveSender(sender);
    if (
      window.windowId !== request.windowId ||
      window.rendererSessionId !== request.rendererSessionId
    ) {
      throw new Error('DSH runtime request does not match its sender-bound renderer session.');
    }
    if (request.operation === 'restart') {
      try {
        await this.options.runtime.restart();
      } catch (error) {
        if (this.options.runtime.getStatus().status !== 'unavailable') throw error;
      }
    }
    return { requestId: request.requestId, projection: this.options.runtime.getStatus() };
  }
}
