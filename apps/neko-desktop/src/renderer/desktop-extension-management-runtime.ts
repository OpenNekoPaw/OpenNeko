import type {
  AgentExtensionManagementProjection,
  AgentExtensionManagementRuntime,
  AgentExtensionManagementSessionIdentity,
  AgentManagedSkillDetail,
} from '@neko/agent-contracts/extension-management';
import {
  createAgentExtensionManagementHostRequest,
  type AgentExtensionManagementHostRequest,
  type OpenNekoAgentExtensionManagementBridge,
} from '@neko/agent-contracts/extension-management-host';

type AgentExtensionManagementRequestInput<
  Request extends AgentExtensionManagementHostRequest = AgentExtensionManagementHostRequest,
> = Request extends unknown ? Omit<Request, 'requestId' | 'identity'> : never;

export class DesktopExtensionManagementRuntime implements AgentExtensionManagementRuntime {
  private disposed = false;

  constructor(
    readonly identity: AgentExtensionManagementSessionIdentity,
    private readonly bridge: OpenNekoAgentExtensionManagementBridge,
  ) {}

  async getSnapshot(): Promise<AgentExtensionManagementProjection> {
    this.requireActive();
    return this.execute({ route: 'snapshot.get' });
  }

  async getSkillDetail(input: {
    readonly name: string;
    readonly source: string;
  }): Promise<AgentManagedSkillDetail> {
    this.requireActive();
    const request = createAgentExtensionManagementHostRequest({
      requestId: crypto.randomUUID(),
      identity: this.identity,
      route: 'skill.detail.get',
      ...input,
    });
    const result = await this.bridge.extensionManagement.execute(request);
    if (result.route !== 'skill.detail.get') {
      throw new Error('Desktop Extension Management returned the wrong Skill detail route.');
    }
    return result.detail;
  }

  async addSkill(): Promise<AgentExtensionManagementProjection> {
    return this.execute({ route: 'skill.add' });
  }

  async setSkillEnabled(input: {
    readonly name: string;
    readonly source: string;
    readonly enabled: boolean;
  }): Promise<AgentExtensionManagementProjection> {
    return this.execute({ route: 'skill.enablement.update', ...input });
  }

  async removeSkill(input: {
    readonly name: string;
    readonly source: string;
  }): Promise<AgentExtensionManagementProjection> {
    return this.execute({ route: 'skill.remove', ...input });
  }

  async addMcp(
    server: Parameters<AgentExtensionManagementRuntime['addMcp']>[0],
  ): Promise<AgentExtensionManagementProjection> {
    return this.execute({ route: 'mcp.add', server });
  }

  async setMcpEnabled(input: {
    readonly id: string;
    readonly enabled: boolean;
  }): Promise<AgentExtensionManagementProjection> {
    return this.execute({ route: 'mcp.enablement.update', ...input });
  }

  async removeMcp(id: string): Promise<AgentExtensionManagementProjection> {
    return this.execute({ route: 'mcp.remove', id });
  }

  dispose(): void {
    this.disposed = true;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Extension Management runtime is disposed.');
  }

  private async execute(
    input: Exclude<AgentExtensionManagementRequestInput, { readonly route: 'skill.detail.get' }>,
  ): Promise<AgentExtensionManagementProjection> {
    this.requireActive();
    const request = createAgentExtensionManagementHostRequest({
      requestId: crypto.randomUUID(),
      identity: this.identity,
      ...input,
    });
    const result = await this.bridge.extensionManagement.execute(request);
    if (result.route === 'skill.detail.get') {
      throw new Error('Desktop Extension Management returned Skill detail for a catalog request.');
    }
    return result.projection;
  }
}
