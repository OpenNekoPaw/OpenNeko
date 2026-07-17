import type {
  CreativeEntityCandidate,
  CreativeEntityKind,
  CreativeEntityOccurrenceProjection,
  CreativeEntityProviderStatus,
} from '@neko/shared';
import type { CreativeEntityProvider, CreativeEntityProviderContext } from './index';
import { buildEntityId } from '../core/adapters';

export interface StoryEntityCandidateInput {
  readonly kind?: CreativeEntityKind;
  readonly name: string;
  readonly sourceRef?: string;
  readonly confidence?: number;
  readonly aliases?: readonly string[];
}

export interface StoryEntityOccurrenceInput {
  readonly name: string;
  readonly kind?: CreativeEntityKind;
  readonly entityId?: string;
  readonly candidateId?: string;
  readonly sourceRef: string;
  readonly role?: 'definition' | 'reference';
  readonly label?: string;
  readonly detail?: string;
}

export interface StoryEntityProviderAdapterOptions {
  readonly providerId?: string;
  readonly listCharacterNames: () => readonly string[];
  readonly listCandidates?: () =>
    | readonly StoryEntityCandidateInput[]
    | Promise<readonly StoryEntityCandidateInput[]>;
  readonly listOccurrences?: () =>
    | readonly StoryEntityOccurrenceInput[]
    | Promise<readonly StoryEntityOccurrenceInput[]>;
  readonly available?: () => boolean;
  readonly now?: () => string;
}

export class StoryEntityProviderAdapter implements CreativeEntityProvider {
  readonly providerId: string;

  constructor(private readonly options: StoryEntityProviderAdapterOptions) {
    this.providerId = options.providerId ?? 'neko-story';
  }

  async getStatus(): Promise<CreativeEntityProviderStatus> {
    const available = this.options.available?.() ?? true;
    return {
      providerId: this.providerId,
      sourceKind: 'story',
      available,
      freshness: available ? 'fresh' : 'stale',
      updatedAt: this.now(),
      ...(available ? {} : { error: 'Story provider unavailable' }),
    };
  }

  async listCandidates(
    context: CreativeEntityProviderContext,
  ): Promise<readonly CreativeEntityCandidate[]> {
    if (this.options.available?.() === false) {
      return [];
    }

    const explicit = (await this.options.listCandidates?.()) ?? [];
    const names = this.options
      .listCharacterNames()
      .map((name): StoryEntityCandidateInput => ({ kind: 'character', name }));
    return dedupeById([...explicit, ...names].map((input) => this.toCandidate(input, context)));
  }

  async listOccurrences(): Promise<readonly CreativeEntityOccurrenceProjection[]> {
    if (this.options.available?.() === false) {
      return [];
    }

    const occurrences = (await this.options.listOccurrences?.()) ?? [];
    return occurrences.map((input) => ({
      entityRef: input.entityId
        ? {
            entityId: input.entityId,
            entityKind: input.kind ?? 'character',
            source: this.providerId,
          }
        : undefined,
      candidateId: input.candidateId,
      label: input.label ?? input.name,
      source: {
        sourceId: this.providerId,
        sourceKind: 'story',
        sourceRef: input.sourceRef,
        providerId: this.providerId,
        freshness: 'fresh',
        updatedAt: this.now(),
      },
      role: input.role ?? 'reference',
      location: input.sourceRef,
      ...(input.detail ? { detail: input.detail } : {}),
    }));
  }

  private toCandidate(
    input: StoryEntityCandidateInput,
    context: CreativeEntityProviderContext,
  ): CreativeEntityCandidate {
    const kind = input.kind ?? 'character';
    const id = `candidate:story:${kind}:${buildEntityId(kind, input.name)}`;
    return {
      id,
      kind,
      name: input.name,
      aliases: input.aliases ?? [],
      status: 'open',
      identityBasis: 'user-named',
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      provenance: [
        {
          providerId: this.providerId,
          sourceKind: 'story',
          sourceRef: input.sourceRef,
          confidence: input.confidence,
          observedAt: this.now(),
        },
      ],
      sourceRefs: input.sourceRef ? [input.sourceRef] : [],
      createdAt: this.now(),
      updatedAt: this.now(),
      metadata: { projectRoot: context.projectRoot },
    };
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }
}

function dedupeById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}
