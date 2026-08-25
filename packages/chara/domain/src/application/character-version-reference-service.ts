import {
  characterVersionReferenceKey,
  parseCharacterVersionReference,
  parseCharacterVersionReferenceInventory,
  type CharacterVersionReference,
  type CharacterVersionReferenceInventory,
  type CharacterVersionReferenceOwnerKind,
} from '@neko/chara-domain/contracts';
import type { CharacterDurableCatalogPort } from './character-durable-catalog';
import type { CharacterVersionLineageRepository } from './character-version-lineage-repository';

export interface CharacterStorylineReferenceCatalogPort {
  readCatalog(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<
    readonly {
      readonly draft?: {
        readonly characterStorylineId: string;
        readonly characterVersionId: string;
      };
      readonly versions: readonly {
        readonly characterStorylineVersionId: string;
        readonly characterVersionId: string;
      }[];
    }[]
  >;
}

export interface CharacterVersionReferenceReader {
  readonly ownerKind: CharacterVersionReferenceOwnerKind;
  readReferences(
    characterVersionIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly CharacterVersionReference[]>;
}

export class CharacterVersionReferenceInventoryService {
  constructor(
    private readonly readers: {
      readonly chara: CharacterVersionReferenceReader;
      readonly agent: CharacterVersionReferenceReader;
      readonly project: CharacterVersionReferenceReader;
    },
  ) {
    requireReaderOwner(readers.chara, 'chara');
    requireReaderOwner(readers.agent, 'agent');
    requireReaderOwner(readers.project, 'project');
  }

  async readInventory(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersionReferenceInventory> {
    const [inventory] = await this.readInventories([characterVersionId], signal);
    if (inventory === undefined) {
      throw new Error('CharacterVersion reference inventory projection returned no result.');
    }
    return inventory;
  }

  async readInventories(
    characterVersionIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly CharacterVersionReferenceInventory[]> {
    const exactCharacterVersionIds = characterVersionIds.map((characterVersionId) =>
      requireIdentity(characterVersionId, 'CharacterVersion'),
    );
    if (new Set(exactCharacterVersionIds).size !== exactCharacterVersionIds.length) {
      throw new Error('CharacterVersion reference inventory requires unique version identities.');
    }
    signal?.throwIfAborted();
    const readers = [this.readers.chara, this.readers.agent, this.readers.project] as const;
    const settled = await Promise.allSettled(
      readers.map((reader) => reader.readReferences(exactCharacterVersionIds, signal)),
    );
    signal?.throwIfAborted();
    const references: CharacterVersionReference[] = [];
    const ownerDiagnostics: CharacterVersionReferenceInventory['diagnostics'][number][] = [];
    for (const [index, result] of settled.entries()) {
      const reader = readers[index];
      if (reader === undefined) {
        throw new Error('CharacterVersion reference reader result has no owning reader.');
      }
      if (result.status === 'rejected') {
        if (isAbortError(result.reason)) throw result.reason;
        ownerDiagnostics.push({
          ownerKind: reader.ownerKind,
          message: describeError(result.reason),
        });
        continue;
      }
      try {
        const parsed = result.value.map(parseCharacterVersionReference);
        requireReaderReferences(reader, new Set(exactCharacterVersionIds), parsed);
        references.push(...parsed);
      } catch (error) {
        ownerDiagnostics.push({ ownerKind: reader.ownerKind, message: describeError(error) });
      }
    }
    const duplicate = firstDuplicate(references.map(characterVersionReferenceKey));
    if (duplicate !== undefined) {
      const duplicateReference = references.find(
        (reference) => characterVersionReferenceKey(reference) === duplicate,
      );
      if (duplicateReference === undefined) {
        throw new Error('CharacterVersion duplicate reference diagnostic lost its exact record.');
      }
      ownerDiagnostics.push({
        ownerKind: duplicateReference.ownerKind,
        message: `CharacterVersion reference reader returned duplicate '${duplicate}'.`,
      });
    }
    const failedOwners = new Set(ownerDiagnostics.map((diagnostic) => diagnostic.ownerKind));
    return exactCharacterVersionIds.map((characterVersionId) =>
      parseCharacterVersionReferenceInventory({
        characterVersionId,
        coverage: ownerDiagnostics.length === 0 ? 'complete' : 'incomplete',
        references: references.filter(
          (reference) =>
            reference.characterVersionId === characterVersionId &&
            !failedOwners.has(reference.ownerKind),
        ),
        diagnostics: ownerDiagnostics,
      }),
    );
  }
}

export class CharaOwnedCharacterVersionReferenceReader implements CharacterVersionReferenceReader {
  readonly ownerKind = 'chara' as const;

  constructor(
    private readonly ports: {
      readonly catalog: CharacterDurableCatalogPort;
      readonly lineage: CharacterVersionLineageRepository;
      readonly storylines?: CharacterStorylineReferenceCatalogPort;
    },
  ) {}

  async readReferences(
    characterVersionIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly CharacterVersionReference[]> {
    const exactCharacterVersionIds = new Set(
      characterVersionIds.map((characterVersionId) =>
        requireIdentity(characterVersionId, 'CharacterVersion'),
      ),
    );
    const catalog = await this.ports.catalog.readCatalog(signal);
    signal?.throwIfAborted();
    const references: CharacterVersionReference[] = [];
    const projectByVersionId = new Map(
      catalog.versions.map((version) => [version.characterVersionId, version.characterProjectId]),
    );
    const targetProjectIds = new Set<string>();
    for (const characterVersionId of exactCharacterVersionIds) {
      const characterProjectId = projectByVersionId.get(characterVersionId);
      if (characterProjectId === undefined) {
        throw new Error(
          `CharacterVersion '${characterVersionId}' is unavailable in Chara catalog.`,
        );
      }
      targetProjectIds.add(characterProjectId);
    }
    for (const project of catalog.projects) {
      const basis = project.draftBasisCharacterVersionId;
      if (basis !== undefined && exactCharacterVersionIds.has(basis)) {
        references.push(reference('working-draft-basis', project.characterProjectId, basis));
      }
    }
    for (const characterProjectId of targetProjectIds) {
      const lineage = await this.ports.lineage.readLineage(characterProjectId, signal);
      signal?.throwIfAborted();
      if (lineage === undefined) continue;
      if (lineage.characterProjectId !== characterProjectId) {
        throw new Error(
          `CharacterVersion lineage '${lineage.characterProjectId}' does not belong to exact CharacterProject '${characterProjectId}'.`,
        );
      }
      for (const relation of lineage.relations) {
        const parentCharacterVersionId = relation.parentCharacterVersionIds[0];
        if (
          parentCharacterVersionId !== undefined &&
          exactCharacterVersionIds.has(parentCharacterVersionId)
        ) {
          references.push(
            reference('lineage-child', relation.characterVersionId, parentCharacterVersionId),
          );
        }
      }
    }
    for (const draft of catalog.storylineDrafts) {
      if (exactCharacterVersionIds.has(draft.characterVersionId)) {
        references.push(
          reference('storyline-draft', draft.characterStorylineId, draft.characterVersionId),
        );
      }
    }
    for (const version of catalog.storylineVersions) {
      if (exactCharacterVersionIds.has(version.characterVersionId)) {
        references.push(
          reference(
            'storyline-version',
            version.characterStorylineVersionId,
            version.characterVersionId,
          ),
        );
      }
    }
    for (const run of catalog.characterRuns) {
      if (exactCharacterVersionIds.has(run.characterVersionId)) {
        references.push(reference('character-run', run.characterRunId, run.characterVersionId));
      }
    }
    for (const room of catalog.rooms) {
      for (const participant of room.participantTemplates) {
        if (
          'characterVersionId' in participant &&
          participant.characterVersionId !== undefined &&
          exactCharacterVersionIds.has(participant.characterVersionId)
        ) {
          references.push(
            reference(
              'room-template-participant',
              `${room.characterRoomId}:${participant.participantTemplateId}`,
              participant.characterVersionId,
            ),
          );
        }
      }
    }
    for (const run of catalog.roomRuns) {
      for (const participant of run.participants) {
        if (
          participant.characterVersionId !== undefined &&
          exactCharacterVersionIds.has(participant.characterVersionId)
        ) {
          references.push(
            reference(
              'room-run-participant',
              `${run.roomRunId}:${participant.participantId}`,
              participant.characterVersionId,
            ),
          );
        }
      }
    }
    for (const relationship of catalog.relationships) {
      for (const candidate of relationship.candidates) {
        if (exactCharacterVersionIds.has(candidate.sourceCharacterVersionId)) {
          references.push(
            reference(
              'relationship-memory-candidate',
              candidate.candidateId,
              candidate.sourceCharacterVersionId,
            ),
          );
        }
      }
      for (const memory of relationship.memories) {
        if (exactCharacterVersionIds.has(memory.sourceCharacterVersionId)) {
          references.push(
            reference('relationship-memory', memory.memoryId, memory.sourceCharacterVersionId),
          );
        }
      }
    }
    for (const continuity of catalog.companionContinuities) {
      for (const candidate of continuity.candidates) {
        if (exactCharacterVersionIds.has(candidate.sourceCharacterVersionId)) {
          references.push(
            reference(
              'companion-memory-candidate',
              candidate.companionMemoryCandidateId,
              candidate.sourceCharacterVersionId,
            ),
          );
        }
      }
      for (const memory of continuity.entries) {
        if (exactCharacterVersionIds.has(memory.sourceCharacterVersionId)) {
          references.push(
            reference(
              'companion-memory',
              memory.companionMemoryEntryId,
              memory.sourceCharacterVersionId,
            ),
          );
        }
      }
    }
    if (this.ports.storylines !== undefined) {
      const existingKeys = new Set(references.map(characterVersionReferenceKey));
      for (const characterProjectId of targetProjectIds) {
        const entries = await this.ports.storylines.readCatalog(characterProjectId, signal);
        signal?.throwIfAborted();
        for (const entry of entries) {
          if (
            entry.draft !== undefined &&
            exactCharacterVersionIds.has(entry.draft.characterVersionId)
          ) {
            appendAdditionalReference(
              references,
              existingKeys,
              reference(
                'storyline-draft',
                entry.draft.characterStorylineId,
                entry.draft.characterVersionId,
              ),
            );
          }
          for (const version of entry.versions) {
            if (exactCharacterVersionIds.has(version.characterVersionId)) {
              appendAdditionalReference(
                references,
                existingKeys,
                reference(
                  'storyline-version',
                  version.characterStorylineVersionId,
                  version.characterVersionId,
                ),
              );
            }
          }
        }
      }
    }
    return references;
  }
}

function appendAdditionalReference(
  references: CharacterVersionReference[],
  existingKeys: Set<string>,
  value: CharacterVersionReference,
): void {
  const key = characterVersionReferenceKey(value);
  if (existingKeys.has(key)) return;
  existingKeys.add(key);
  references.push(value);
}

function reference(
  referenceKind: CharacterVersionReference['referenceKind'],
  referenceId: string,
  characterVersionId: string,
): CharacterVersionReference {
  return { ownerKind: 'chara', referenceKind, referenceId, characterVersionId };
}

function requireReaderOwner(
  reader: CharacterVersionReferenceReader,
  ownerKind: CharacterVersionReferenceOwnerKind,
): void {
  if (reader.ownerKind !== ownerKind) {
    throw new Error(`CharacterVersion reference reader must be owned by '${ownerKind}'.`);
  }
}

function requireReaderReferences(
  reader: CharacterVersionReferenceReader,
  characterVersionIds: ReadonlySet<string>,
  references: readonly CharacterVersionReference[],
): void {
  if (references.some((reference) => reference.ownerKind !== reader.ownerKind)) {
    throw new Error(
      `CharacterVersion reference reader '${reader.ownerKind}' returned another owner's fact.`,
    );
  }
  if (references.some((reference) => !characterVersionIds.has(reference.characterVersionId))) {
    throw new Error(
      `CharacterVersion reference reader '${reader.ownerKind}' returned another version's fact.`,
    );
  }
}

function requireIdentity(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} identity must be non-empty.`);
  return value;
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
