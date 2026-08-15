import {
  parseCharacterManagementDetailProjection,
  type CharacterManagementDetailProjection,
  type CharacterManagementPlacement,
} from '@neko/chara/contracts';
import type {
  CharacterDurableCatalog,
  CharacterDurableCatalogPort,
} from './character-durable-catalog';
import type { CharacterVersionLineageRepository } from './character-version-lineage-repository';
import { projectCharacterVersionGraph } from './character-version-graph-service';
import type { CharacterVersionReferenceInventoryService } from './character-version-reference-service';

const MANAGEMENT_LINEAGE_NODE_LIMIT = 4;

export class CharacterManagementService {
  constructor(
    private readonly options: {
      readonly catalog: CharacterDurableCatalogPort;
      readonly lineage: CharacterVersionLineageRepository;
      readonly references: CharacterVersionReferenceInventoryService;
      readonly placement: CharacterManagementPlacement;
    },
  ) {}

  async readDetails(signal?: AbortSignal): Promise<readonly CharacterManagementDetailProjection[]> {
    signal?.throwIfAborted();
    const catalog = await this.options.catalog.readCatalog(signal);
    return await this.projectDetails(catalog, signal);
  }

  async projectDetails(
    catalog: CharacterDurableCatalog,
    signal?: AbortSignal,
  ): Promise<readonly CharacterManagementDetailProjection[]> {
    signal?.throwIfAborted();
    return await Promise.all(
      catalog.projects.map(async (project) => {
        const versions = catalog.versions.filter(
          (version) => version.characterProjectId === project.characterProjectId,
        );
        const [lineage, referenceInventories] = await Promise.all([
          this.readLineage(project, versions, signal),
          this.options.references.readInventories(
            versions.map((version) => version.characterVersionId),
            signal,
          ),
        ]);
        return parseCharacterManagementDetailProjection({
          characterProjectId: project.characterProjectId,
          placement: this.options.placement,
          storylineCount: catalog.storylines.filter(
            (storyline) => storyline.characterProjectId === project.characterProjectId,
          ).length,
          lineage,
          referenceInventories,
        });
      }),
    );
  }

  private async readLineage(
    project: Parameters<typeof projectCharacterVersionGraph>[0]['project'],
    versions: Parameters<typeof projectCharacterVersionGraph>[0]['versions'],
    signal?: AbortSignal,
  ): Promise<CharacterManagementDetailProjection['lineage']> {
    try {
      const lineage = await this.options.lineage.readLineage(project.characterProjectId, signal);
      const graph = projectCharacterVersionGraph({ project, versions, lineage });
      const nodes = graph.nodes.slice(0, MANAGEMENT_LINEAGE_NODE_LIMIT).map((node) => ({
        characterVersionId: node.characterVersionId,
        label: node.label,
        state: node.state,
        isHead: node.isHead,
        isDraftBasis: node.isDraftBasis,
        ...(node.parentCharacterVersionId === undefined
          ? {}
          : { parentCharacterVersionId: node.parentCharacterVersionId }),
      }));
      return {
        status: 'available',
        rootCount: graph.rootCharacterVersionIds.length,
        headCount: graph.headCharacterVersionIds.length,
        unlinkedCount: graph.unlinkedCharacterVersionIds.length,
        nodes,
        hiddenNodeCount: graph.nodes.length - nodes.length,
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      return { status: 'unavailable', message: describeError(error) };
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
