import {
  parseCharacterAuthoringSnapshot,
  type CharacterAuthoringCommand,
  type CharacterAuthoringSnapshot,
} from '@neko/chara/contracts';
import type { CharacterAuthoringCatalogPort } from './character-durable-catalog';
import type { CharacterAuthoringService } from './character-authoring-service';

export class CharacterAuthoringHostService {
  constructor(
    private readonly options: {
      readonly contentProjectId: string;
      readonly catalog: CharacterAuthoringCatalogPort;
      readonly authoring: CharacterAuthoringService;
    },
  ) {}

  async getSnapshot(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<CharacterAuthoringSnapshot> {
    signal?.throwIfAborted();
    const catalog = await this.options.catalog.readAuthoringCatalog(signal);
    if (
      catalog.scope.kind !== 'content-project' ||
      catalog.scope.contentProjectId !== this.options.contentProjectId
    ) {
      throw new Error(
        `Character authoring catalog does not match Content Project '${this.options.contentProjectId}'.`,
      );
    }
    const project = catalog.projects.find(
      (candidate) => candidate.characterProjectId === characterProjectId,
    );
    if (!project) {
      const diagnostic = catalog.diagnostics.find(
        (candidate) =>
          candidate.recordKind === 'character-project' && candidate.recordId === characterProjectId,
      );
      throw new Error(
        diagnostic?.message ?? `CharacterProject '${characterProjectId}' is unavailable.`,
      );
    }
    return parseCharacterAuthoringSnapshot({
      project,
      versions: catalog.versions.filter(
        (version) => version.characterProjectId === characterProjectId,
      ),
      diagnostics: catalog.diagnostics
        .filter(
          (diagnostic) =>
            diagnostic.recordId === characterProjectId ||
            catalog.versions.some(
              (version) =>
                version.characterProjectId === characterProjectId &&
                version.characterVersionId === diagnostic.recordId,
            ),
        )
        .filter(
          (diagnostic) =>
            diagnostic.recordKind === 'character-project' ||
            diagnostic.recordKind === 'character-version' ||
            diagnostic.recordKind === 'authoring-test-snapshot',
        )
        .map((diagnostic) => ({ owner: 'character' as const, ...diagnostic })),
    });
  }

  async execute(
    command: CharacterAuthoringCommand,
    signal?: AbortSignal,
  ): Promise<CharacterAuthoringSnapshot> {
    signal?.throwIfAborted();
    switch (command.operation) {
      case 'character-project-update-draft':
        await this.options.authoring.updateDraft(command.input, signal);
        break;
      case 'character-project-set-review':
        await this.options.authoring.setReviewStatus(command.input, signal);
        break;
      case 'character-version-publish':
        await this.options.authoring.publish(command.input, signal);
        break;
    }
    return this.getSnapshot(command.input.characterProjectId, signal);
  }
}
