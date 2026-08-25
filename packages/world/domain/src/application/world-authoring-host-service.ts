import {
  parseWorldAuthoringSnapshot,
  type WorldAuthoringCommand,
  type WorldAuthoringSnapshot,
} from '@neko/world-domain/contracts';
import type {
  WorldAuthoringCatalogPort,
  WorldAuthoringCatalogScope,
} from './world-durable-catalog';
import type { WorldAuthoringService } from './world-authoring-service';

export class WorldAuthoringHostService {
  constructor(
    private readonly options: {
      readonly scope: Extract<WorldAuthoringCatalogScope, { readonly kind: 'project' }>;
      readonly catalog: WorldAuthoringCatalogPort;
      readonly authoring: WorldAuthoringService;
    },
  ) {}

  async getSnapshot(worldProjectId: string, signal?: AbortSignal): Promise<WorldAuthoringSnapshot> {
    signal?.throwIfAborted();
    const catalog = await this.options.catalog.readAuthoringCatalog(signal);
    if (!sameScope(catalog.scope, this.options.scope)) {
      throw new Error('World authoring catalog does not match its exact authority.');
    }
    const project = catalog.projects.find(
      (candidate) => candidate.worldProjectId === worldProjectId,
    );
    if (!project) {
      const diagnostic = catalog.diagnostics.find(
        (candidate) =>
          candidate.recordKind === 'world-project' && candidate.recordId === worldProjectId,
      );
      throw new Error(diagnostic?.message ?? `WorldProject '${worldProjectId}' is unavailable.`);
    }
    return parseWorldAuthoringSnapshot({
      project,
      versions: catalog.versions.filter((version) => version.worldProjectId === worldProjectId),
      diagnostics: catalog.diagnostics
        .filter(
          (diagnostic) =>
            diagnostic.recordId === worldProjectId ||
            catalog.versions.some(
              (version) =>
                version.worldProjectId === worldProjectId &&
                version.worldVersionId === diagnostic.recordId,
            ),
        )
        .filter(
          (diagnostic) =>
            diagnostic.recordKind === 'world-project' || diagnostic.recordKind === 'world-version',
        )
        .map((diagnostic) => ({ owner: 'world' as const, ...diagnostic })),
    });
  }

  async execute(
    command: WorldAuthoringCommand,
    signal?: AbortSignal,
  ): Promise<WorldAuthoringSnapshot> {
    signal?.throwIfAborted();
    switch (command.operation) {
      case 'world-project-create':
        await this.options.authoring.createProject(command.input, signal);
        break;
      case 'world-project-update-draft':
        await this.options.authoring.updateDraft(command.input, signal);
        break;
      case 'world-project-set-review':
        await this.options.authoring.setReviewStatus(command.input, signal);
        break;
      case 'world-version-publish':
        await this.options.authoring.publish(command.input, signal);
        break;
    }
    return this.getSnapshot(command.input.worldProjectId, signal);
  }
}

function sameScope(
  left: WorldAuthoringCatalogScope,
  right: Extract<WorldAuthoringCatalogScope, { readonly kind: 'project' }>,
): boolean {
  return left.kind === 'project' && left.projectId === right.projectId;
}
