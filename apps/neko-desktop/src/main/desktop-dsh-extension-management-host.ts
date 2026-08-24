import {
  parseAgentExtensionManagementHostRequest,
  type AgentExtensionManagementHostResult,
} from '@neko/agent-contracts/extension-management-host';
import type { DshAcpExtensionSkill } from '@neko/agent-contracts/dsh-acp';
import type { DesktopDshAgentRuntime } from './desktop-dsh-agent-runtime';
import type { DesktopSenderIdentity } from './window-registry';

export class DesktopDshExtensionManagementHost {
  constructor(
    private readonly options: {
      readonly runtime: Pick<DesktopDshAgentRuntime, 'getStatus' | 'client'>;
      readonly windows: {
        resolveSender(sender: DesktopSenderIdentity): {
          readonly windowId: string;
          readonly rendererSessionId: string;
        };
      };
    },
  ) {}

  async execute(
    sender: DesktopSenderIdentity,
    value: unknown,
  ): Promise<AgentExtensionManagementHostResult> {
    const request = parseAgentExtensionManagementHostRequest(value);
    const window = this.options.windows.resolveSender(sender);
    if (window.windowId !== request.identity.windowId) {
      throw new Error('DSH extension management request does not match its sender-bound window.');
    }
    const projection = await this.project(request.identity.windowId);
    return { requestId: request.requestId, route: request.route, projection };
  }

  private async project(windowId: string) {
    const status = this.options.runtime.getStatus();
    if (status.status !== 'running') {
      return {
        identity: { windowId },
        catalogScope: 'global' as const,
        skills: [],
        mcp: [],
        diagnostics: [{ code: 'runtime_unavailable' as const, count: 1 }],
      };
    }
    const snapshot = await this.options.runtime.client.readExtensions();
    return {
      identity: { windowId },
      catalogScope: snapshot.catalogScope,
      skills: snapshot.skills.map(toSkill),
      mcp: snapshot.mcp,
      diagnostics: snapshot.diagnostics,
    };
  }
}

function toSkill(skill: DshAcpExtensionSkill) {
  return {
    id: `dsh-skill:${skill.name}`,
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
    source: skill.source,
    provider: skill.provider,
    userInvocable: skill.userInvocable,
    modelInvocable: skill.modelInvocable,
  };
}
