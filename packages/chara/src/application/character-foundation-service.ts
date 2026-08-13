import {
  parseCharacterConversationLaunchCatalog,
  parseCharacterFoundationSnapshot,
  type CharacterConversationLaunchCatalog,
  type CharacterFoundationSnapshot,
} from '@neko/chara/contracts';
import type { CharacterDurableCatalogPort } from './character-durable-catalog';
import type { CharacterManagementService } from './character-management-service';
import { projectCharacterVersionGraph } from './character-version-graph-service';
import type { CharacterVersionLineageRepository } from './character-version-lineage-repository';

export class CharacterFoundationService {
  constructor(
    private readonly options: {
      readonly characterCatalog: CharacterDurableCatalogPort;
      readonly management?: CharacterManagementService;
      readonly lineage?: Pick<CharacterVersionLineageRepository, 'readLineage'>;
    },
  ) {}

  async getSnapshot(signal?: AbortSignal): Promise<CharacterFoundationSnapshot> {
    signal?.throwIfAborted();
    const character = await this.options.characterCatalog.readCatalog(signal);
    const managementDetails = await this.options.management?.projectDetails(character, signal);
    return parseCharacterFoundationSnapshot({
      character: {
        projects: character.projects,
        versions: character.versions,
        relationships: character.relationships,
        characterRuns: character.characterRuns,
        dialogueRuns: character.dialogueRuns,
        rooms: character.rooms,
        roomRuns: character.roomRuns,
        storylines: character.storylines,
        storylineDrafts: character.storylineDrafts,
        storylineVersions: character.storylineVersions,
        companionContinuities: character.companionContinuities,
        presentationConfigurations: character.presentationConfigurations,
      },
      ...(managementDetails === undefined ? {} : { managementDetails }),
      diagnostics: character.diagnostics.map((diagnostic) => ({
        owner: 'character',
        ...diagnostic,
      })),
    });
  }

  async getConversationLaunchCatalog(
    signal?: AbortSignal,
  ): Promise<CharacterConversationLaunchCatalog> {
    signal?.throwIfAborted();
    const character = await this.options.characterCatalog.readCatalog(signal);
    const projects = new Map(
      character.projects.map((project) => [project.characterProjectId, project] as const),
    );
    const storylinesByPublicationId = new Map<string, typeof character.storylineVersions>();
    for (const storyline of character.storylineVersions) {
      const current = storylinesByPublicationId.get(storyline.characterVersionId) ?? [];
      storylinesByPublicationId.set(storyline.characterVersionId, [...current, storyline]);
    }
    const lineageByVersionId = new Map<
      string,
      CharacterConversationLaunchCatalog['targets'][number]['lineage']
    >();
    for (const project of character.projects) {
      const versions = character.versions.filter(
        (version) => version.characterProjectId === project.characterProjectId,
      );
      try {
        const lineage = await this.options.lineage?.readLineage(project.characterProjectId, signal);
        const graph = projectCharacterVersionGraph({
          project,
          versions,
          ...(lineage === undefined ? {} : { lineage }),
        });
        const versionsById = new Map(
          versions.map((version) => [version.characterVersionId, version] as const),
        );
        for (const node of graph.nodes) {
          const path = [...node.ancestorCharacterVersionIds, node.characterVersionId].map(
            (characterVersionId) => {
              const version = versionsById.get(characterVersionId);
              if (!version) {
                throw new Error(
                  `Character lineage path references unavailable CharacterVersion '${characterVersionId}'.`,
                );
              }
              return { characterVersionId, label: version.label };
            },
          );
          lineageByVersionId.set(node.characterVersionId, {
            coverage: 'complete',
            state: node.state,
            isHead: node.isHead,
            path,
          });
        }
      } catch (error) {
        const message = describeError(error);
        for (const version of versions) {
          lineageByVersionId.set(version.characterVersionId, {
            coverage: 'unavailable',
            message,
          });
        }
      }
    }
    const targets: CharacterConversationLaunchCatalog['targets'][number][] = [];
    const diagnostics: CharacterConversationLaunchCatalog['diagnostics'][number][] = [];
    for (const publication of character.versions) {
      const project = projects.get(publication.characterProjectId);
      if (!project) {
        diagnostics.push({
          characterVersionId: publication.characterVersionId,
          message: `CharacterVersion '${publication.characterVersionId}' references unavailable CharacterProject '${publication.characterProjectId}'.`,
        });
        continue;
      }
      targets.push({
        characterProjectId: project.characterProjectId,
        characterVersionId: publication.characterVersionId,
        displayName: project.displayName,
        versionLabel: publication.label,
        lineage: lineageByVersionId.get(publication.characterVersionId) ?? {
          coverage: 'unavailable',
          message: `CharacterVersion '${publication.characterVersionId}' has no lineage projection.`,
        },
        storylines: (storylinesByPublicationId.get(publication.characterVersionId) ?? []).map(
          (storyline) => ({
            characterStorylineVersionId: storyline.characterStorylineVersionId,
            label: storyline.label,
          }),
        ),
      });
    }
    return parseCharacterConversationLaunchCatalog({ targets, diagnostics });
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
