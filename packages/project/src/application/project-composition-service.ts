import type {
  CharacterAuthoringCatalog,
  CharacterAuthoringCatalogPort,
} from '@neko/chara/application';
import type { GlobalCharacterCatalog } from '@neko/chara/contracts';
import type { WorldAuthoringCatalog, WorldAuthoringCatalogPort } from '@neko/world/application';
import type { GlobalWorldCatalog } from '@neko/world/contracts';
import {
  parseProjectMixedDomainTargetProjection,
  type ProjectCompositionDiagnostic,
  type ProjectGlobalReferenceItem,
  type ProjectMixedDomainTargetItem,
  type ProjectMixedDomainTargetProjection,
} from '../contracts/project-composition';
import {
  projectGlobalReferenceKey,
  type ProjectAuthoringTargetRef,
  type ProjectGlobalReference,
} from '../contracts/project-target';

export interface ProjectGlobalReferenceCatalog {
  readonly projectId: string;
  readonly targets: readonly ProjectAuthoringTargetRef[];
  readonly references: readonly ProjectGlobalReference[];
}

export interface ProjectGlobalReferenceReaderPort {
  readGlobalReferences(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ProjectGlobalReferenceCatalog>;
}

export interface ProjectGlobalCharacterCatalogPort {
  readCatalog(signal?: AbortSignal): Promise<GlobalCharacterCatalog>;
}

export interface ProjectGlobalWorldCatalogPort {
  readCatalog(signal?: AbortSignal): Promise<GlobalWorldCatalog>;
}

export interface ProjectContentDocumentCatalogItem {
  readonly documentId: string;
  readonly label: string;
  readonly diagnostic?: string;
}

export interface ProjectContentDocumentCatalog {
  readonly projectId: string;
  readonly documents: readonly ProjectContentDocumentCatalogItem[];
}

export interface ProjectContentDocumentCatalogPort {
  readContentDocuments(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ProjectContentDocumentCatalog>;
}

export type ProjectCharacterCatalogProjection = Pick<
  CharacterAuthoringCatalog,
  'projects' | 'versions' | 'diagnostics'
>;

export type ProjectWorldCatalogProjection = Pick<
  WorldAuthoringCatalog,
  'projects' | 'versions' | 'diagnostics'
>;

export class ProjectCompositionService {
  constructor(
    private readonly ports: {
      readonly content: ProjectContentDocumentCatalogPort;
      readonly characters: CharacterAuthoringCatalogPort;
      readonly worlds: WorldAuthoringCatalogPort;
      readonly references: ProjectGlobalReferenceReaderPort;
      readonly globalCharacters: ProjectGlobalCharacterCatalogPort;
      readonly globalWorlds: ProjectGlobalWorldCatalogPort;
    },
  ) {}

  async read(input: {
    readonly projectId: string;
    readonly signal?: AbortSignal;
  }): Promise<ProjectMixedDomainTargetProjection> {
    input.signal?.throwIfAborted();
    const [content, characters, worlds, references, globalCharacters, globalWorlds] =
      await Promise.all([
        this.ports.content.readContentDocuments(input.projectId, input.signal),
        this.ports.characters.readAuthoringCatalog(input.signal),
        this.ports.worlds.readAuthoringCatalog(input.signal),
        this.ports.references.readGlobalReferences(input.projectId, input.signal),
        this.ports.globalCharacters.readCatalog(input.signal),
        this.ports.globalWorlds.readCatalog(input.signal),
      ]);
    if (content.projectId !== input.projectId) {
      throw new Error(`Content document catalog does not match Project '${input.projectId}'.`);
    }
    if (references.projectId !== input.projectId) {
      throw new Error(`Global reference catalog does not match Project '${input.projectId}'.`);
    }
    return createProjectCompositionProjection({
      projectId: input.projectId,
      content: content.documents,
      characters,
      worlds,
      targets: references.targets,
      references: references.references,
      globalCharacters,
      globalWorlds,
    });
  }
}

export function createProjectCompositionProjection(input: {
  readonly projectId: string;
  readonly content: readonly ProjectContentDocumentCatalogItem[];
  readonly characters: ProjectCharacterCatalogProjection;
  readonly worlds: ProjectWorldCatalogProjection;
  readonly targets: readonly ProjectAuthoringTargetRef[];
  readonly references: readonly ProjectGlobalReference[];
  readonly globalCharacters: GlobalCharacterCatalog;
  readonly globalWorlds: GlobalWorldCatalog;
}): ProjectMixedDomainTargetProjection {
  const diagnostics: ProjectCompositionDiagnostic[] = [];
  const characterVersions = new Map(
    input.globalCharacters.versions.map((version) => [version.characterVersionId, version]),
  );
  const worldVersions = new Map(
    input.globalWorlds.versions.map((version) => [version.worldVersionId, version]),
  );
  const globalCharacters: ProjectGlobalReferenceItem[] = [];
  const globalWorlds: ProjectGlobalReferenceItem[] = [];
  for (const reference of input.references) {
    if (reference.kind === 'character-version') {
      const character = input.globalCharacters.characters.find(
        (candidate) => candidate.globalCharacterId === reference.globalCharacterId,
      );
      const version = characterVersions.get(reference.characterVersionId);
      const available = Boolean(
        character?.characterVersionIds.includes(reference.characterVersionId) && version,
      );
      const item = {
        reference,
        identity: `character-version:${reference.globalCharacterId}:${reference.characterVersionId}`,
        label: version?.label ?? reference.characterVersionId,
        ...(available
          ? {}
          : {
              diagnostic: `CharacterVersion '${reference.characterVersionId}' does not belong to exact GlobalCharacter '${reference.globalCharacterId}'.`,
            }),
      };
      globalCharacters.push(item);
      if (!available) diagnostics.push(unavailableReferenceDiagnostic(reference, item.diagnostic));
      continue;
    }
    const world = input.globalWorlds.worlds.find(
      (candidate) => candidate.globalWorldId === reference.globalWorldId,
    );
    const version = worldVersions.get(reference.worldVersionId);
    const available = Boolean(world?.worldVersionIds.includes(reference.worldVersionId) && version);
    const item = {
      reference,
      identity: `world-version:${reference.globalWorldId}:${reference.worldVersionId}`,
      label: version?.label ?? reference.worldVersionId,
      ...(available
        ? {}
        : {
            diagnostic: `WorldVersion '${reference.worldVersionId}' does not belong to exact GlobalWorld '${reference.globalWorldId}'.`,
          }),
    };
    globalWorlds.push(item);
    if (!available) diagnostics.push(unavailableReferenceDiagnostic(reference, item.diagnostic));
  }
  const availableGlobalCharacters = input.globalCharacters.versions.map((version) => {
    const character = input.globalCharacters.characters.find(
      (candidate) => candidate.globalCharacterId === version.globalCharacterId,
    );
    const reference = {
      kind: 'character-version' as const,
      globalCharacterId: version.globalCharacterId,
      characterVersionId: version.characterVersionId,
    };
    return {
      reference,
      identity: projectGlobalReferenceKey(reference),
      label: `${character?.displayName ?? version.globalCharacterId} · ${version.label}`,
    };
  });
  const availableGlobalWorlds = input.globalWorlds.versions.map((version) => {
    const world = input.globalWorlds.worlds.find(
      (candidate) => candidate.globalWorldId === version.globalWorldId,
    );
    const reference = {
      kind: 'world-version' as const,
      globalWorldId: version.globalWorldId,
      worldVersionId: version.worldVersionId,
    };
    return {
      reference,
      identity: projectGlobalReferenceKey(reference),
      label: `${world?.title ?? version.globalWorldId} · ${version.label}`,
    };
  });
  return parseProjectMixedDomainTargetProjection({
    projectId: input.projectId,
    content: projectContentItems(input.content),
    characters: projectCharacterItems(
      input.characters,
      input.targets,
      input.globalCharacters,
      diagnostics,
    ),
    worlds: projectWorldItems(input.worlds, input.targets, input.globalWorlds, diagnostics),
    globalCharacters,
    globalWorlds,
    availableGlobalCharacters,
    availableGlobalWorlds,
    diagnostics,
  });
}

function unavailableReferenceDiagnostic(
  reference: ProjectGlobalReference,
  message: string | undefined,
): ProjectCompositionDiagnostic {
  return {
    owner: { kind: 'global-reference', reference },
    severity: 'error',
    code: 'global-version-unavailable',
    message: message ?? 'Global version is unavailable.',
  };
}

function projectContentItems(
  documents: readonly ProjectContentDocumentCatalogItem[],
): readonly (ProjectMixedDomainTargetItem & {
  readonly target: { readonly kind: 'content-document'; readonly documentId: string };
})[] {
  return documents.map((document) => ({
    target: { kind: 'content-document', documentId: document.documentId },
    identity: `content-document:${document.documentId}`,
    label: document.label,
    ...(document.diagnostic === undefined ? {} : { diagnostic: document.diagnostic }),
  }));
}

function projectCharacterItems(
  catalog: ProjectCharacterCatalogProjection,
  targets: readonly ProjectAuthoringTargetRef[],
  globalCatalog: GlobalCharacterCatalog,
  diagnostics: ProjectCompositionDiagnostic[],
): readonly (ProjectMixedDomainTargetItem & {
  readonly target: { readonly kind: 'character-project'; readonly characterProjectId: string };
})[] {
  const projects = new Map(
    catalog.projects.map((project) => [project.characterProjectId, project]),
  );
  const ids = new Set(
    targets.flatMap((target) =>
      target.kind === 'character-project' ? [target.characterProjectId] : [],
    ),
  );
  return [...ids].map((characterProjectId) => {
    const project = projects.get(characterProjectId);
    const diagnostic = catalog.diagnostics.find(
      (item) => item.recordKind === 'character-project' && item.recordId === characterProjectId,
    );
    const message =
      diagnostic?.message ??
      (project ? undefined : `CharacterProject '${characterProjectId}' is unavailable.`);
    const link = globalCatalog.links.find(
      (candidate) => candidate.characterProjectId === characterProjectId,
    );
    const linkedCharacter = link
      ? globalCatalog.characters.find(
          (candidate) => candidate.globalCharacterId === link.globalCharacterId,
        )
      : undefined;
    if (message) {
      diagnostics.push({
        owner: { kind: 'character-project', characterProjectId },
        severity: 'error',
        code: 'project-member-unavailable',
        message,
      });
    }
    return {
      target: { kind: 'character-project', characterProjectId },
      identity: `character-project:${characterProjectId}`,
      label: project?.displayName ?? characterProjectId,
      ...(message ? { diagnostic: message } : {}),
      ...(link && linkedCharacter
        ? {
            synchronization: {
              kind: 'character' as const,
              globalObjectId: link.globalCharacterId,
              lastSyncedVersionId: link.lastSyncedCharacterVersionId,
              currentVersionId: linkedCharacter.currentCharacterVersionId,
            },
          }
        : {}),
    };
  });
}

function projectWorldItems(
  catalog: ProjectWorldCatalogProjection,
  targets: readonly ProjectAuthoringTargetRef[],
  globalCatalog: GlobalWorldCatalog,
  diagnostics: ProjectCompositionDiagnostic[],
): readonly (ProjectMixedDomainTargetItem & {
  readonly target: { readonly kind: 'world-project'; readonly worldProjectId: string };
})[] {
  const projects = new Map(catalog.projects.map((project) => [project.worldProjectId, project]));
  const ids = new Set(
    targets.flatMap((target) => (target.kind === 'world-project' ? [target.worldProjectId] : [])),
  );
  return [...ids].map((worldProjectId) => {
    const project = projects.get(worldProjectId);
    const diagnostic = catalog.diagnostics.find(
      (item) => item.recordKind === 'world-project' && item.recordId === worldProjectId,
    );
    const message =
      diagnostic?.message ??
      (project ? undefined : `WorldProject '${worldProjectId}' is unavailable.`);
    const link = globalCatalog.links.find(
      (candidate) => candidate.worldProjectId === worldProjectId,
    );
    const linkedWorld = link
      ? globalCatalog.worlds.find((candidate) => candidate.globalWorldId === link.globalWorldId)
      : undefined;
    if (message) {
      diagnostics.push({
        owner: { kind: 'world-project', worldProjectId },
        severity: 'error',
        code: 'project-member-unavailable',
        message,
      });
    }
    return {
      target: { kind: 'world-project', worldProjectId },
      identity: `world-project:${worldProjectId}`,
      label: project?.title ?? worldProjectId,
      ...(message ? { diagnostic: message } : {}),
      ...(link && linkedWorld
        ? {
            synchronization: {
              kind: 'world' as const,
              globalObjectId: link.globalWorldId,
              lastSyncedVersionId: link.lastSyncedWorldVersionId,
              currentVersionId: linkedWorld.currentWorldVersionId,
            },
          }
        : {}),
    };
  });
}
