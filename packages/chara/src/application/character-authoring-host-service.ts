import {
  parseCharacterAuthoringSnapshot,
  type CharacterAuthoringCommand,
  type CharacterAuthoringSnapshot,
} from '@neko/chara/contracts';
import type {
  CharacterAuthoringCatalogPort,
  CharacterAuthoringCatalogScope,
} from './character-durable-catalog';
import type { CharacterAuthoringService } from './character-authoring-service';
import type { CharacterStorylineService } from './character-storyline-service';
import type { CharacterVersionDeletionService } from './character-version-deletion-service';
import type { CharacterVersionLineageRepository } from './character-version-lineage-repository';
import type { CharacterVersionReferenceInventoryService } from './character-version-reference-service';

export class CharacterAuthoringHostService {
  constructor(
    private readonly options: {
      readonly scope: CharacterAuthoringCatalogScope;
      readonly characterProjectId: string;
      readonly catalog: CharacterAuthoringCatalogPort;
      readonly authoring: CharacterAuthoringService;
      readonly storylines: CharacterStorylineService;
      readonly lineage: CharacterVersionLineageRepository;
      readonly references: CharacterVersionReferenceInventoryService;
      readonly deletion: CharacterVersionDeletionService;
    },
  ) {}

  async getSnapshot(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<CharacterAuthoringSnapshot> {
    signal?.throwIfAborted();
    if (characterProjectId !== this.options.characterProjectId) {
      throw new Error('Character authoring snapshot targets another CharacterProject.');
    }
    const catalog = await this.options.catalog.readAuthoringCatalog(signal);
    if (!sameScope(catalog.scope, this.options.scope)) {
      throw new Error('Character authoring catalog does not match its exact authority.');
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
    const versions = catalog.versions.filter(
      (version) => version.characterProjectId === characterProjectId,
    );
    const [storylineCatalog, lineageResult, referenceInventories] = await Promise.all([
      this.options.storylines.readCatalog(characterProjectId, signal),
      this.readLineage(characterProjectId, signal),
      this.options.references.readInventories(
        versions.map((version) => version.characterVersionId),
        signal,
      ),
    ]);
    return parseCharacterAuthoringSnapshot({
      project,
      versions,
      authoringTestSnapshots: catalog.authoringTestSnapshots.filter(
        (snapshot) => snapshot.characterProjectId === characterProjectId,
      ),
      storylines: storylineCatalog.map((entry) => entry.storyline),
      storylineDrafts: storylineCatalog.flatMap((entry) =>
        entry.draft === undefined ? [] : [entry.draft],
      ),
      storylineVersions: storylineCatalog.flatMap((entry) => entry.versions),
      lineage: lineageResult.lineage,
      referenceInventories,
      diagnostics: [
        ...catalog.diagnostics
          .filter(
            (diagnostic) =>
              diagnostic.recordId === characterProjectId ||
              versions.some((version) => version.characterVersionId === diagnostic.recordId),
          )
          .filter(
            (diagnostic) =>
              diagnostic.recordKind === 'character-project' ||
              diagnostic.recordKind === 'character-version' ||
              diagnostic.recordKind === 'authoring-test-snapshot' ||
              diagnostic.recordKind === 'character-storyline' ||
              diagnostic.recordKind === 'character-storyline-draft' ||
              diagnostic.recordKind === 'character-storyline-version',
          )
          .map((diagnostic) => ({ owner: 'character' as const, ...diagnostic })),
        ...(lineageResult.diagnostic === undefined
          ? []
          : [
              {
                owner: 'character' as const,
                recordKind: 'character-version-lineage' as const,
                recordId: characterProjectId,
                message: lineageResult.diagnostic,
              },
            ]),
      ],
    });
  }

  async execute(
    command: CharacterAuthoringCommand,
    signal?: AbortSignal,
  ): Promise<CharacterAuthoringSnapshot> {
    signal?.throwIfAborted();
    if (
      'characterProjectId' in command.input &&
      command.input.characterProjectId !== this.options.characterProjectId
    ) {
      throw new Error('Character authoring command targets another CharacterProject.');
    }
    if (!('characterProjectId' in command.input)) {
      const snapshot = await this.getSnapshot(this.options.characterProjectId, signal);
      const characterStorylineId = command.input.characterStorylineId;
      if (
        !snapshot.storylines.some(
          (storyline) => storyline.characterStorylineId === characterStorylineId,
        )
      ) {
        throw new Error(
          `CharacterStoryline '${characterStorylineId}' does not belong to the exact authoring target.`,
        );
      }
    }
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
      case 'character-version-continue':
        await this.options.authoring.continueFromVersion(command.input, signal);
        break;
      case 'character-version-delete':
        await this.options.deletion.deleteVersion(command.input, signal);
        break;
      case 'character-authoring-test-capture':
        await this.options.authoring.captureAuthoringTest(command.input, signal);
        break;
      case 'character-storyline-create':
        await this.options.storylines.create(command.input, signal);
        break;
      case 'character-storyline-update-draft':
        await this.options.storylines.updateDraft(command.input, signal);
        break;
      case 'character-storyline-restore-as-draft':
        await this.options.storylines.restoreAsDraft(command.input, signal);
        break;
      case 'character-storyline-delete':
        await this.options.storylines.delete(command.input.characterStorylineId, signal);
        break;
      case 'character-storyline-publish':
        await this.options.storylines.publish(command.input, signal);
        break;
    }
    return this.getSnapshot(this.options.characterProjectId, signal);
  }

  private async readLineage(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly lineage: Awaited<ReturnType<CharacterVersionLineageRepository['readLineage']>> | null;
    readonly diagnostic?: string;
  }> {
    try {
      return {
        lineage: (await this.options.lineage.readLineage(characterProjectId, signal)) ?? null,
      };
    } catch (error) {
      signal?.throwIfAborted();
      return {
        lineage: null,
        diagnostic: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function sameScope(
  actual: CharacterAuthoringCatalogScope,
  expected: CharacterAuthoringCatalogScope,
): boolean {
  return (
    actual.kind === expected.kind &&
    (actual.kind === 'standalone-library' ||
      (expected.kind === 'content-project' &&
        actual.contentProjectId === expected.contentProjectId))
  );
}
