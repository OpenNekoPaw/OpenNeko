import type { AgentBoundDomainBinding } from '@neko/agent-contracts';
import type { DshConversationCreationTarget } from '@neko/agent-contracts/dsh-session-host';

export async function resolveDesktopDshConversationContext(options: {
  readonly windowId: string;
  readonly target: DshConversationCreationTarget;
  readonly surfaceBinding: AgentBoundDomainBinding;
  readonly surfaceIsUnbound: boolean;
  readonly projects: {
    resolveProjectWorkspace(projectId: string): Promise<{ readonly workspaceId: string }>;
  };
  readonly workspaceGrants: {
    authorizeWorkspace(input: {
      readonly windowId: string;
      readonly workspaceId: string;
    }): Promise<{
      readonly grant: { readonly workspaceGrantId: string };
      readonly workspace: { readonly workspaceId: string };
    }>;
  };
}): Promise<AgentBoundDomainBinding> {
  if (options.target.kind === 'surface') return options.surfaceBinding;
  if (!options.surfaceIsUnbound) {
    throw new Error('Entry Project selection requires an unbound Agent Draft.');
  }
  const workspace = await options.projects.resolveProjectWorkspace(options.target.projectId);
  const authorized = await options.workspaceGrants.authorizeWorkspace({
    windowId: options.windowId,
    workspaceId: workspace.workspaceId,
  });
  if (authorized.workspace.workspaceId !== workspace.workspaceId) {
    throw new Error(`Desktop Project '${options.target.projectId}' resolved to another Workspace.`);
  }
  return {
    kind: 'workspace',
    workspaceId: authorized.workspace.workspaceId,
    workspaceGrantId: authorized.grant.workspaceGrantId,
  };
}
