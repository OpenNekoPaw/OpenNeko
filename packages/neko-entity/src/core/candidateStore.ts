import type {
  CreativeEntityCandidate,
  CreativeEntityCandidateFile,
  CreativeEntityCandidateIdentityBasis,
  CreativeEntityKind,
} from '@neko/shared';
import {
  isCreativeEntityCandidate,
  isCreativeEntityCandidateFile,
  withCreativeEntityCandidateDefaults,
  withCreativeEntityCandidateFileDefaults,
} from '@neko/shared';
import type { EntityRuntimePorts } from './ports';
import { SerialEntityRuntimeLock, nowFromPorts } from './ports';
import { buildEntityId, normalizeAliasList } from './adapters';
import { assertGitTrackedEntityFactPath, resolveEntityCandidateFilePath } from './paths';

export interface EntityCandidateStoreOptions {
  readonly projectRoot: string;
  readonly ports: EntityRuntimePorts;
}

export interface CreateEntityCandidateInput {
  readonly id?: string;
  readonly kind: CreativeEntityKind;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly identityBasis?: CreativeEntityCandidateIdentityBasis;
  readonly confidence?: number;
  readonly provenance: CreativeEntityCandidate['provenance'];
  readonly sourceRefs?: readonly string[];
  readonly suggestedRequirements?: CreativeEntityCandidate['suggestedRequirements'];
  readonly metadata?: Record<string, unknown>;
}

export interface EntityCandidateFactMigrationReport {
  readonly totalCandidates: number;
  readonly automationGeneratedCandidates: number;
  readonly preservedCandidateIds: readonly string[];
}

export class EntityCandidateStore {
  private readonly filePath: string;
  private readonly lock;

  constructor(private readonly options: EntityCandidateStoreOptions) {
    this.filePath = resolveEntityCandidateFilePath(options.projectRoot);
    this.lock = options.ports.lock ?? new SerialEntityRuntimeLock();
    assertGitTrackedEntityFactPath(this.filePath);
  }

  async load(): Promise<CreativeEntityCandidateFile> {
    const parsed = await this.options.ports.files.readJson(this.filePath);
    if (isCreativeEntityCandidateFile(parsed)) {
      return withCreativeEntityCandidateFileDefaults(parsed);
    }
    if (parsed !== undefined) {
      this.options.ports.logger?.warn('Ignoring malformed creative entity candidate file', {
        filePath: this.filePath,
      });
    }
    return createEmptyCreativeEntityCandidateFile();
  }

  async list(
    status?: CreativeEntityCandidate['status'],
  ): Promise<readonly CreativeEntityCandidate[]> {
    const candidates = (await this.load()).candidates;
    return [
      ...(status ? candidates.filter((candidate) => candidate.status === status) : candidates),
    ].sort(compareCandidates);
  }

  async get(id: string): Promise<CreativeEntityCandidate | undefined> {
    return (await this.load()).candidates.find((candidate) => candidate.id === id);
  }

  async propose(input: CreateEntityCandidateInput): Promise<CreativeEntityCandidate> {
    const now = nowFromPorts(this.options.ports);
    const id = input.id ?? `candidate:${input.kind}:${buildEntityId(input.kind, input.name)}`;
    const existing = await this.get(id);
    if (existing && existing.status !== 'open') {
      return existing;
    }

    if (existing) {
      const candidate: CreativeEntityCandidate = {
        ...existing,
        aliases: normalizeAliasList([...(existing.aliases ?? []), ...(input.aliases ?? [])]),
        confidence: maxConfidence(existing.confidence, input.confidence),
        provenance: mergeProvenance(existing.provenance, input.provenance),
        sourceRefs:
          input.sourceRefs && input.sourceRefs.length > 0
            ? uniqueStrings([...existing.sourceRefs, ...input.sourceRefs])
            : uniqueStrings([
                ...existing.sourceRefs,
                ...input.provenance
                  .map((item) => item.sourceRef)
                  .filter((sourceRef): sourceRef is string => Boolean(sourceRef)),
              ]),
        ...(input.suggestedRequirements
          ? {
              suggestedRequirements: [
                ...(existing.suggestedRequirements ?? []),
                ...input.suggestedRequirements,
              ],
            }
          : {}),
        metadata: {
          ...(existing.metadata ?? {}),
          ...(input.metadata ?? {}),
        },
        identityBasis: input.identityBasis ?? existing.identityBasis,
        updatedAt: now,
      };
      await this.upsert(candidate);
      return candidate;
    }

    const candidate: CreativeEntityCandidate = {
      id,
      kind: input.kind,
      name: input.name,
      aliases: normalizeAliasList(input.aliases ?? []),
      status: 'open',
      identityBasis: input.identityBasis ?? 'user-named',
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      provenance: input.provenance,
      sourceRefs:
        input.sourceRefs && input.sourceRefs.length > 0
          ? Array.from(new Set(input.sourceRefs))
          : Array.from(
              new Set(
                input.provenance
                  .map((item) => item.sourceRef)
                  .filter((sourceRef): sourceRef is string => Boolean(sourceRef)),
              ),
            ),
      ...(input.suggestedRequirements
        ? { suggestedRequirements: input.suggestedRequirements }
        : {}),
      createdAt: now,
      updatedAt: now,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    await this.upsert(candidate);
    return candidate;
  }

  async upsert(candidate: CreativeEntityCandidate): Promise<CreativeEntityCandidateFile> {
    if (!isCreativeEntityCandidate(candidate)) {
      throw new Error('Invalid creative entity candidate.');
    }
    return this.mutate((file) => ({
      version: 1,
      candidates: [
        ...file.candidates.filter((existing) => existing.id !== candidate.id),
        withCreativeEntityCandidateDefaults(candidate),
      ].sort(compareCandidates),
    }));
  }

  async update(
    id: string,
    operation: (candidate: CreativeEntityCandidate) => CreativeEntityCandidate,
  ): Promise<CreativeEntityCandidate | undefined> {
    let updated: CreativeEntityCandidate | undefined;
    await this.mutate((file) => {
      const candidates = file.candidates.map((candidate) => {
        if (candidate.id !== id) return candidate;
        updated = operation(candidate);
        return updated;
      });
      return {
        version: 1,
        candidates: candidates.sort(compareCandidates),
      };
    });
    return updated;
  }

  async remove(id: string): Promise<CreativeEntityCandidateFile> {
    return this.mutate((file) => ({
      version: 1,
      candidates: file.candidates.filter((candidate) => candidate.id !== id),
    }));
  }

  private async mutate(
    operation: (file: CreativeEntityCandidateFile) => CreativeEntityCandidateFile,
  ): Promise<CreativeEntityCandidateFile> {
    return this.lock.withLock(this.filePath, async () => {
      const current = await this.load();
      const next = operation(current);
      await this.options.ports.files.writeJson(
        this.filePath,
        withCreativeEntityCandidateFileDefaults(next),
      );
      return next;
    });
  }
}

export function createEmptyCreativeEntityCandidateFile(): CreativeEntityCandidateFile {
  return {
    version: 1,
    candidates: [],
  };
}

export function inspectEntityCandidateFactMigration(
  file: CreativeEntityCandidateFile,
): EntityCandidateFactMigrationReport {
  const automationGeneratedCandidates = file.candidates.filter((candidate) => {
    const source = candidate.metadata?.['automationSource'];
    return typeof source === 'string' && source.length > 0;
  });
  return {
    totalCandidates: file.candidates.length,
    automationGeneratedCandidates: automationGeneratedCandidates.length,
    preservedCandidateIds: file.candidates.map((candidate) => candidate.id),
  };
}

function compareCandidates(a: CreativeEntityCandidate, b: CreativeEntityCandidate): number {
  return a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function maxConfidence(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.max(left, right);
}

function mergeProvenance(
  left: readonly CreativeEntityCandidate['provenance'][number][],
  right: readonly CreativeEntityCandidate['provenance'][number][],
): readonly CreativeEntityCandidate['provenance'][number][] {
  const seen = new Set<string>();
  const merged: CreativeEntityCandidate['provenance'][number][] = [];
  for (const item of [...left, ...right]) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}
