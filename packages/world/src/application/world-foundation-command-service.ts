import type { WorldFoundationCommand } from '@neko/world/contracts';
import type { WorldAuthoringService } from './world-authoring-service';
import type { WorldRuntimeService } from './world-runtime-service';
import type { WorldTransformationStateCommitService } from './world-transformation-state-commit-service';

export interface WorldFoundationCommandPort {
  execute(command: WorldFoundationCommand, signal?: AbortSignal): Promise<void>;
}

export class WorldFoundationCommandService implements WorldFoundationCommandPort {
  constructor(
    private readonly services: {
      readonly authoring: WorldAuthoringService;
      readonly runtime: WorldRuntimeService;
      readonly transformations: Pick<WorldTransformationStateCommitService, 'commit'>;
    },
  ) {}

  async execute(command: WorldFoundationCommand, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    switch (command.operation) {
      case 'world-project-create':
        await this.services.authoring.createProject(command.input, signal);
        return;
      case 'world-project-update-draft':
        await this.services.authoring.updateDraft(command.input, signal);
        return;
      case 'world-project-set-review':
        await this.services.authoring.setReviewStatus(command.input, signal);
        return;
      case 'world-version-publish':
        await this.services.authoring.publish(command.input, signal);
        return;
      case 'world-preview-run-create':
        await this.services.runtime.createRun(command.input, signal);
        return;
      case 'world-transformation-state-commit':
        await this.services.transformations.commit(command.input, signal);
        return;
      case 'world-preview-branch-fork':
        await this.services.runtime.forkBranch(command.input, signal);
        return;
      case 'world-preview-branch-activate':
        await this.services.runtime.activateBranch(command.input, signal);
        return;
    }
  }
}
