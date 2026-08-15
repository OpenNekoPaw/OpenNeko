import type {
  AgentAuthoringBinding,
  AgentAuthoringTargetRef,
  AgentEntryTargetBinding,
  AgentLaunchConnectionIdentity,
} from '@neko/agent-contracts';
import { createAgentEntryTargetApplicationService } from '@neko/agent-runtime/application';

interface DesktopAgentProjectRef {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly unavailable?: unknown;
}

export function createDesktopAgentEntryTargetService<TWorkspace>(options: {
  readonly resolveWorkspace: (
    windowId: string,
    workspaceGrantId: string,
  ) => Promise<{ readonly workspace: TWorkspace; readonly workspaceId: string }>;
  readonly readProjects: (windowId: string) => Promise<readonly DesktopAgentProjectRef[]>;
  readonly requireProjectTarget: (input: {
    readonly workspace: TWorkspace;
    readonly projectId: string;
    readonly target: AgentAuthoringTargetRef;
  }) => Promise<void>;
  readonly validateCharacterProject: (input: {
    readonly workspace: TWorkspace;
    readonly projectId: string;
    readonly characterProjectId: string;
  }) => Promise<boolean>;
  readonly validateWorldProject: (input: {
    readonly workspace: TWorkspace;
    readonly projectId: string;
    readonly worldProjectId: string;
  }) => Promise<boolean>;
  readonly validateCharacterDialogue: (
    binding: Extract<AgentEntryTargetBinding, { readonly kind: 'character-dialogue' }>,
  ) => Promise<void>;
  readonly validateWorldExperience: (
    binding: Extract<AgentEntryTargetBinding, { readonly kind: 'world-experience' }>,
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
    const project = (await options.readProjects(connection.windowId)).find(
      (candidate) =>
        candidate.projectId === binding.authority.projectId &&
        candidate.workspaceId === binding.workspaceId &&
        !candidate.unavailable,
    );
    if (!project) {
      throw new Error(
        `Project '${binding.authority.projectId}' is not registered for the exact Workspace.`,
      );
    }
    return { workspace: resolution.workspace, project };
  };

  return createAgentEntryTargetApplicationService({
    projectAuthoring: {
      validate: async (connection, binding) => {
        await resolveAuthority(connection, binding);
        return { status: 'ready', binding };
      },
    },
    contentAuthoring: {
      validate: async (connection, binding) => {
        const { workspace, project } = await resolveAuthority(connection, binding);
        try {
          await options.requireProjectTarget({
            workspace,
            projectId: project.projectId,
            target: binding.target,
          });
        } catch (error) {
          return unavailable(
            'content',
            'agent-content-authoring-target-unavailable',
            describeError(error),
          );
        }
        return { status: 'ready', binding };
      },
    },
    characterAuthoring: {
      validate: async (connection, binding) => {
        const { workspace, project } = await resolveAuthority(connection, binding);
        try {
          await options.requireProjectTarget({
            workspace,
            projectId: project.projectId,
            target: binding.target,
          });
        } catch (error) {
          return unavailable(
            'project',
            'agent-project-character-membership-unavailable',
            describeError(error),
          );
        }
        const valid = await options.validateCharacterProject({
          workspace,
          projectId: project.projectId,
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
        try {
          await options.requireProjectTarget({
            workspace,
            projectId: project.projectId,
            target: binding.target,
          });
        } catch (error) {
          return unavailable(
            'project',
            'agent-project-world-membership-unavailable',
            describeError(error),
          );
        }
        const valid = await options.validateWorldProject({
          workspace,
          projectId: project.projectId,
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
    worldExperience: {
      validate: async (_connection, binding) => {
        try {
          await options.validateWorldExperience(binding);
          return { status: 'ready', binding };
        } catch (error) {
          return unavailable(
            'world',
            'agent-world-experience-target-unavailable',
            describeError(error),
          );
        }
      },
    },
    createIdentity: options.createIdentity,
  });
}

function unavailable(owner: string, code: string, message: string) {
  return { status: 'unavailable' as const, diagnostic: { owner, code, message } };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
