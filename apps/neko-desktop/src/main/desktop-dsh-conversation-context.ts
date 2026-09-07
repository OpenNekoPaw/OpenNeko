import {
  projectAgentConversationSurfaceBinding,
  sameAgentDomainBinding,
  type AgentAuthoringTargetRef,
  type AgentBoundDomainBinding,
  type AgentConversationContext,
} from '@neko/agent-contracts';
import type { DshConversationCreationTarget } from '@neko/agent-contracts/dsh-session-host';
import type { DesktopWorkbenchMainSurfaceRef } from '@neko/host/desktop-scene-contract';

export interface DesktopDshConversationContextResolution {
  readonly context: AgentConversationContext;
  readonly surfaceBinding: AgentBoundDomainBinding;
}

export async function resolveDesktopDshConversationContext<
  TWorkspace extends { readonly workspaceId: string },
>(options: {
  readonly windowId: string;
  readonly target: DshConversationCreationTarget;
  readonly surfaceBinding: AgentBoundDomainBinding;
  readonly surfaceContext?: AgentConversationContext;
  readonly surfaceIsUnbound: boolean;
  readonly projects: {
    resolveProjectWorkspace(projectId: string): Promise<{ readonly workspaceId: string }>;
  };
  readonly workspaceGrants: {
    resolve(
      windowId: string,
      workspaceGrantId: string,
    ): Promise<{ readonly workspace: TWorkspace }>;
  };
  readonly authoringTargets: {
    require(input: {
      readonly workspace: TWorkspace;
      readonly projectId: string;
      readonly target: AgentAuthoringTargetRef;
    }): Promise<void>;
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
  if (options.target.kind === 'character-dialogue') {
    throw new Error('Character Dialogue context must be created by the Chara launch owner.');
  }
  if (!options.surfaceIsUnbound) {
    throw new Error('Entry Project selection requires an unbound Agent Draft.');
  }
  const projectWorkspace = await options.projects.resolveProjectWorkspace(
    options.target.authority.projectId,
  );
  if (projectWorkspace.workspaceId !== options.target.workspaceId) {
    throw new Error(
      `Desktop Project '${options.target.authority.projectId}' belongs to another Workspace.`,
    );
  }
  const authorized = await options.workspaceGrants.resolve(
    options.windowId,
    options.target.workspaceGrantId,
  );
  if (authorized.workspace.workspaceId !== options.target.workspaceId) {
    throw new Error('Agent authoring grant resolves to another Workspace.');
  }
  if (options.target.target !== null) {
    await options.authoringTargets.require({
      workspace: authorized.workspace,
      projectId: options.target.authority.projectId,
      target: options.target.target,
    });
  }
  return {
    context: options.target,
    surfaceBinding: {
      kind: 'workspace',
      workspaceId: options.target.workspaceId,
      workspaceGrantId: options.target.workspaceGrantId,
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
