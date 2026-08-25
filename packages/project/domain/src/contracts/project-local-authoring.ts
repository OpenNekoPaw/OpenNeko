import type { ProjectLocalTargetRef } from './project-target';

export interface ProjectWorkspaceAuthority {
  readonly projectId: string;
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

export interface ProjectLocalAuthoringOutcome {
  readonly status: 'created';
  readonly target: ProjectLocalTargetRef;
}
