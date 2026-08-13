import type {
  AgentAuthoringBinding,
  AgentAuthoringTargetRef,
  AgentEntryTargetBinding,
  AgentLaunchConnectionIdentity,
} from '@neko/agent-contracts';
import { createAgentEntryTargetApplicationService } from '@neko/agent-runtime/application';

interface DesktopAgentContentProjectRef {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly unavailable?: unknown;
}

export function createDesktopAgentEntryTargetService<TWorkspace>(options: {
  readonly resolveWorkspace: (
    windowId: string,
    workspaceGrantId: string,
  ) => Promise<{ readonly workspace: TWorkspace; readonly workspaceId: string }>;
  readonly readContentProjects: (
    windowId: string,
  ) => Promise<readonly DesktopAgentContentProjectRef[]>;
  readonly requireProjectLocalTarget: (input: {
    readonly workspace: TWorkspace;
    readonly contentProjectId: string;
    readonly target: Extract<
      AgentAuthoringTargetRef,
      { readonly kind: 'character-project' | 'world-project' }
    >;
  }) => Promise<void>;
  readonly validateCharacterProject: (input: {
    readonly workspace: TWorkspace;
    readonly contentProjectId?: string;
    readonly characterProjectId: string;
  }) => Promise<boolean>;
  readonly validateWorldProject: (input: {
    readonly workspace: TWorkspace;
    readonly contentProjectId?: string;
    readonly worldProjectId: string;
  }) => Promise<boolean>;
  readonly validateCharacterDialogue: (
    binding: Extract<AgentEntryTargetBinding, { readonly kind: 'character-dialogue' }>,
  ) => Promise<void>;
  readonly createIdentity: () => string;
}) {
  const resolveAuthority = async (
    connection: AgentLaunchConnectionIdentity,
    binding: AgentAuthoringBinding,
  ) => {
    const resolution = await options.resolveWorkspace(
      connection.windowId,
      binding.workspaceGrantId,
    );
    if (resolution.workspaceId !== binding.workspaceId) {
      throw new Error('Agent authoring grant resolves to another Workspace.');
    }
    const authority = binding.authority;
    const project =
      authority.kind === 'content-project'
        ? (await options.readContentProjects(connection.windowId)).find(
            (candidate) =>
              candidate.projectId === authority.contentProjectId &&
              candidate.workspaceId === binding.workspaceId &&
              !candidate.unavailable,
          )
        : undefined;
    if (authority.kind === 'content-project' && !project) {
      throw new Error(
        `Content Project '${authority.contentProjectId}' is not registered for the exact Workspace.`,
      );
    }
    return { workspace: resolution.workspace, project };
  };

  return createAgentEntryTargetApplicationService({
    contentAuthoring: {
      validate: async (connection, binding) => {
        const { project } = await resolveAuthority(connection, binding);
        if (!project || project.projectId !== binding.target.contentProjectId) {
          return unavailable(
            'content',
            'agent-content-authoring-target-unavailable',
            `Content Project '${binding.target.contentProjectId}' is not registered for the exact Workspace.`,
          );
        }
        return { status: 'ready', binding };
      },
    },
    characterAuthoring: {
      validate: async (connection, binding) => {
        const { workspace, project } = await resolveAuthority(connection, binding);
        if (project) {
          try {
            await options.requireProjectLocalTarget({
              workspace,
              contentProjectId: project.projectId,
              target: binding.target,
            });
          } catch (error) {
            return unavailable(
              'project',
              'agent-project-character-membership-unavailable',
              describeError(error),
            );
          }
        }
        const valid = await options.validateCharacterProject({
          workspace,
          ...(project ? { contentProjectId: project.projectId } : {}),
          characterProjectId: binding.target.characterProjectId,
        });
        return valid
          ? { status: 'ready', binding }
          : unavailable(
              'character',
              'agent-character-authoring-target-unavailable',
              `CharacterProject '${binding.target.characterProjectId}' is unavailable in the exact Workspace.`,
            );
      },
    },
    worldAuthoring: {
      validate: async (connection, binding) => {
        const { workspace, project } = await resolveAuthority(connection, binding);
        if (project) {
          try {
            await options.requireProjectLocalTarget({
              workspace,
              contentProjectId: project.projectId,
              target: binding.target,
            });
          } catch (error) {
            return unavailable(
              'project',
              'agent-project-world-membership-unavailable',
              describeError(error),
            );
          }
        }
        const valid = await options.validateWorldProject({
          workspace,
          ...(project ? { contentProjectId: project.projectId } : {}),
          worldProjectId: binding.target.worldProjectId,
        });
        return valid
          ? { status: 'ready', binding }
          : unavailable(
              'world',
              'agent-world-authoring-target-unavailable',
              `WorldProject '${binding.target.worldProjectId}' is unavailable in the exact Workspace.`,
            );
      },
    },
    characterDialogue: {
      validate: async (_connection, binding) => {
        try {
          await options.validateCharacterDialogue(binding);
          return { status: 'ready', binding };
        } catch (error) {
          return unavailable(
            'character',
            'agent-character-dialogue-target-unavailable',
            describeError(error),
          );
        }
      },
    },
    worldExperience: unavailableRuntimeProvider(
      'world',
      'agent-world-experience-provider-unavailable',
      'World Experience launch is unavailable.',
    ),
    createIdentity: options.createIdentity,
  });
}

function unavailableRuntimeProvider(owner: string, code: string, message: string) {
  return {
    validate: async (
      _connection: AgentLaunchConnectionIdentity,
      _binding: AgentEntryTargetBinding,
    ) => unavailable(owner, code, message),
  };
}

function unavailable(owner: string, code: string, message: string) {
  return { status: 'unavailable' as const, diagnostic: { owner, code, message } };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
