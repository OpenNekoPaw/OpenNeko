import type { ProjectLocalTargetRef } from './project-target';

export interface ProjectWorkspaceAuthority {
  readonly contentProjectId: string;
  readonly workspaceId: string;
}

export type ProjectLocalCharacterEntitySelection =
  | {
      readonly kind: 'create';
      readonly entityId: string;
      readonly name: string;
    }
  | {
      readonly kind: 'existing';
      readonly entityId: string;
    };

export type ProjectLocalCharacterCreationStep =
  'character-project' | 'project-entity' | 'entity-character-association';

export interface ProjectLocalCharacterCreationReceipt {
  readonly authority: ProjectWorkspaceAuthority;
  readonly target: Extract<ProjectLocalTargetRef, { readonly kind: 'character-project' }>;
  readonly entityId: string;
  readonly completedSteps: readonly ProjectLocalCharacterCreationStep[];
  readonly nextStep?: Exclude<ProjectLocalCharacterCreationStep, 'character-project'>;
}

export type ProjectLocalAuthoringOutcome =
  | {
      readonly status: 'created';
      readonly target: ProjectLocalTargetRef;
    }
  | {
      readonly status: 'incomplete';
      readonly target: Extract<ProjectLocalTargetRef, { readonly kind: 'character-project' }>;
      readonly receipt: ProjectLocalCharacterCreationReceipt & {
        readonly nextStep: Exclude<ProjectLocalCharacterCreationStep, 'character-project'>;
      };
    };
