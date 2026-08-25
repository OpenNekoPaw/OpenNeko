import type { GlobalCharacterCatalog } from '@neko/chara-domain/contracts';
import type { GlobalWorldCatalog } from '@neko/world-domain/contracts';
import {
  parseProjectGlobalReferenceMutation,
  type ProjectGlobalReferenceMutation,
} from '../contracts/project-composition';
import {
  projectGlobalObjectKey,
  projectGlobalReferenceKey,
  type ProjectGlobalReference,
} from '../contracts/project-target';
import type {
  ProjectGlobalCharacterCatalogPort,
  ProjectGlobalReferenceReaderPort,
  ProjectGlobalWorldCatalogPort,
} from './project-composition-service';
import type { ProjectCompositionCommitService } from './project-composition-commit-service';

export class ProjectGlobalReferenceMutationService {
  constructor(
    private readonly ports: {
      readonly references: ProjectGlobalReferenceReaderPort;
      readonly globalCharacters: ProjectGlobalCharacterCatalogPort;
      readonly globalWorlds: ProjectGlobalWorldCatalogPort;
      readonly commits: Pick<
        ProjectCompositionCommitService,
        'addGlobalReference' | 'updateGlobalReference' | 'removeGlobalReference'
      >;
    },
  ) {}

  async execute(input: {
    readonly projectId: string;
    readonly mutation: ProjectGlobalReferenceMutation;
    readonly signal?: AbortSignal;
  }): Promise<void> {
    input.signal?.throwIfAborted();
    const mutation = parseProjectGlobalReferenceMutation(input.mutation);
    const [catalog, globalCharacters, globalWorlds] = await Promise.all([
      this.ports.references.readGlobalReferences(input.projectId, input.signal),
      this.ports.globalCharacters.readCatalog(input.signal),
      this.ports.globalWorlds.readCatalog(input.signal),
    ]);
    if (catalog.projectId !== input.projectId) {
      throw new Error(`Global reference catalog does not match Project '${input.projectId}'.`);
    }
    const existing = catalog.references.find(
      (reference) =>
        projectGlobalObjectKey(reference) === projectGlobalObjectKey(mutation.reference),
    );
    if (mutation.kind === 'add') {
      if (existing) {
        throw new Error('Project already contains a reference for this global object.');
      }
      requireAvailableReference(mutation.reference, globalCharacters, globalWorlds);
      await this.ports.commits.addGlobalReference(
        { projectId: input.projectId, reference: mutation.reference },
        input.signal,
      );
      return;
    }
    if (
      !existing ||
      projectGlobalReferenceKey(existing) !==
        projectGlobalReferenceKey(
          mutation.kind === 'update' ? mutation.previousReference : mutation.reference,
        )
    ) {
      throw new Error('Project global reference changed before the requested mutation.');
    }
    if (mutation.kind === 'remove') {
      await this.ports.commits.removeGlobalReference(
        { projectId: input.projectId, reference: mutation.reference },
        input.signal,
      );
      return;
    }
    if (
      projectGlobalObjectKey(mutation.previousReference) !==
      projectGlobalObjectKey(mutation.reference)
    ) {
      throw new Error('Project global reference update must retain the exact global object.');
    }
    requireAvailableReference(mutation.reference, globalCharacters, globalWorlds);
    await this.ports.commits.updateGlobalReference(
      {
        previous: { projectId: input.projectId, reference: mutation.previousReference },
        next: { projectId: input.projectId, reference: mutation.reference },
      },
      input.signal,
    );
  }
}

function requireAvailableReference(
  reference: ProjectGlobalReference,
  characters: GlobalCharacterCatalog,
  worlds: GlobalWorldCatalog,
): void {
  if (reference.kind === 'character-version') {
    const character = characters.characters.find(
      (candidate) => candidate.globalCharacterId === reference.globalCharacterId,
    );
    const version = characters.versions.find(
      (candidate) => candidate.characterVersionId === reference.characterVersionId,
    );
    if (
      !character?.characterVersionIds.includes(reference.characterVersionId) ||
      version?.globalCharacterId !== reference.globalCharacterId
    ) {
      throw new Error(
        `CharacterVersion '${reference.characterVersionId}' does not belong to exact GlobalCharacter '${reference.globalCharacterId}'.`,
      );
    }
    return;
  }
  const world = worlds.worlds.find(
    (candidate) => candidate.globalWorldId === reference.globalWorldId,
  );
  const version = worlds.versions.find(
    (candidate) => candidate.worldVersionId === reference.worldVersionId,
  );
  if (
    !world?.worldVersionIds.includes(reference.worldVersionId) ||
    version?.globalWorldId !== reference.globalWorldId
  ) {
    throw new Error(
      `WorldVersion '${reference.worldVersionId}' does not belong to exact GlobalWorld '${reference.globalWorldId}'.`,
    );
  }
}
