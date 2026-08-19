import {
  projectAgentConversationSurfaceBinding,
  sameAgentDomainBinding,
  type AgentBoundDomainBinding,
  type AgentConversationContext,
} from '@neko/agent-contracts';
import type { DshConversationCreationTarget } from '@neko/agent-contracts/dsh-session-host';
import type { DesktopWorkbenchMainSurfaceRef } from '@neko/host/desktop-scene-contract';

export interface DesktopDshConversationContextResolution {
  readonly context: AgentConversationContext;
  readonly surfaceBinding: AgentBoundDomainBinding;
}

export async function resolveDesktopDshConversationContext(options: {
  readonly windowId: string;
  readonly target: DshConversationCreationTarget;
  readonly surfaceBinding: AgentBoundDomainBinding;
  readonly surfaceContext?: AgentConversationContext;
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
}): Promise<DesktopDshConversationContextResolution> {
  if (options.target.kind === 'surface') {
    const context = options.surfaceContext ?? options.surfaceBinding;
    if (
      !sameAgentDomainBinding(
        projectAgentConversationSurfaceBinding(context),
        options.surfaceBinding,
      )
    ) {
      throw new Error('DSH Conversation context does not match its authorized Agent Surface.');
    }
    return {
      context,
      surfaceBinding: options.surfaceBinding,
    };
  }
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
    context: {
      kind: 'authoring',
      workspaceId: authorized.workspace.workspaceId,
      workspaceGrantId: authorized.grant.workspaceGrantId,
      authority: { kind: 'project', projectId: options.target.projectId },
      target: null,
    },
    surfaceBinding: {
      kind: 'workspace',
      workspaceId: authorized.workspace.workspaceId,
      workspaceGrantId: authorized.grant.workspaceGrantId,
    },
  };
}

export function resolveDesktopDshSurfaceConversationContext(options: {
  readonly surfaceBinding: AgentBoundDomainBinding;
  readonly workbench: {
    readonly scene: {
      readonly slots: {
        readonly main?: DesktopWorkbenchMainSurfaceRef;
        readonly secondaryMain?: DesktopWorkbenchMainSurfaceRef;
      };
    };
  };
}): AgentConversationContext {
  if (options.surfaceBinding.kind !== 'workspace') return options.surfaceBinding;
  const authoringSurfaces = [
    options.workbench.scene.slots.main,
    options.workbench.scene.slots.secondaryMain,
  ].filter(isAuthoringSurface);
  if (authoringSurfaces.length > 1) {
    throw new Error(
      'DSH Conversation creation requires exactly one visible Character or World authoring surface.',
    );
  }
  const authoring = authoringSurfaces[0];
  if (!authoring) return options.surfaceBinding;
  if (authoring.workspaceId !== options.surfaceBinding.workspaceId) {
    throw new Error('DSH authoring surface does not match its authorized Workspace.');
  }
  return {
    kind: 'authoring',
    workspaceId: options.surfaceBinding.workspaceId,
    workspaceGrantId: options.surfaceBinding.workspaceGrantId,
    authority: authoring.authority,
    target:
      authoring.kind === 'character-authoring'
        ? { kind: 'character-project', characterProjectId: authoring.characterProjectId }
        : { kind: 'world-project', worldProjectId: authoring.worldProjectId },
  };
}

function isAuthoringSurface(
  value: DesktopWorkbenchMainSurfaceRef | undefined,
): value is Extract<
  DesktopWorkbenchMainSurfaceRef,
  { readonly kind: 'character-authoring' | 'world-authoring' }
> {
  return value?.kind === 'character-authoring' || value?.kind === 'world-authoring';
}
