import {
  parseAgentExtensionManagementHostRequest,
  type AgentExtensionManagementHostResult,
} from '@neko/agent-contracts/extension-management-host';
import type { DshAcpExtensionSkill } from '@neko/agent-contracts/dsh-acp';
import type { DesktopDshAgentClient, DesktopDshAgentRuntime } from './desktop-dsh-agent-runtime';
import type { DesktopSenderIdentity } from './window-registry';

export class DesktopDshExtensionManagementHost {
  constructor(
    private readonly options: {
      readonly runtime: Pick<DesktopDshAgentRuntime, 'getStatus' | 'refreshConfiguration'> & {
        readonly client: Pick<
          DesktopDshAgentClient,
          | 'readExtensions'
          | 'setSkillEnabled'
          | 'removeSkill'
          | 'addMcp'
          | 'setMcpEnabled'
          | 'removeMcp'
        >;
      };
      readonly skills: {
        add(sender: DesktopSenderIdentity): Promise<boolean>;
      };
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
    switch (request.route) {
      case 'snapshot.get':
        break;
      case 'skill.add':
        if (await this.options.skills.add(sender)) {
          await this.options.runtime.refreshConfiguration();
        }
        break;
      case 'skill.enablement.update':
        await this.options.runtime.client.setSkillEnabled({
          name: request.name,
          source: request.source,
          enabled: request.enabled,
        });
        await this.options.runtime.refreshConfiguration();
        break;
      case 'skill.remove':
        await this.options.runtime.client.removeSkill({
          name: request.name,
          source: request.source,
        });
        await this.options.runtime.refreshConfiguration();
        break;
      case 'mcp.add':
        await this.options.runtime.client.addMcp(request.server);
        break;
      case 'mcp.enablement.update':
        await this.options.runtime.client.setMcpEnabled({
          id: request.id,
          enabled: request.enabled,
        });
        break;
      case 'mcp.remove':
        await this.options.runtime.client.removeMcp(request.id);
        break;
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
    id: `dsh-skill:${skill.source}:${skill.name}`,
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
    source: skill.source,
    provider: skill.provider,
    userInvocable: skill.userInvocable,
    modelInvocable: skill.modelInvocable,
    enabled: skill.enabled,
    manageable: skill.manageable,
    removable: skill.removable,
  };
}
