import {
  parseWorldDefinition,
  type WorldDefinition,
  type WorldProject,
  type WorldReviewStatus,
} from '@neko/world-domain/contracts';
import type {
  WorldAuthoringCatalogPort,
  WorldAuthoringCatalogScope,
} from './world-durable-catalog';
import { isFreshWorldCreationTarget, type WorldAuthoringService } from './world-authoring-service';

export const WORLD_DSH_TOOL_NAME = 'openneko.world' as const;
export const WORLD_DSH_TOOL_OPERATIONS = ['query', 'fill-draft'] as const;
export const WORLD_DSH_MAX_PROJECTED_VERSIONS = 32;

export const WORLD_DSH_TOOL_PARAMETERS = {
  operation: { type: 'string', enum: [...WORLD_DSH_TOOL_OPERATIONS], required: true },
  input: {
    type: 'object',
    properties: {
      worldProjectId: { type: 'string', required: true },
      title: { type: 'string' },
      draft: { type: 'json' },
    },
    additionalProperties: false,
    required: true,
  },
} as const;

export type WorldDshToolInput =
  | { readonly operation: 'query'; readonly input: { readonly worldProjectId: string } }
  | {
      readonly operation: 'fill-draft';
      readonly input: {
        readonly worldProjectId: string;
        readonly title: string;
        readonly draft: WorldDefinition;
      };
    };

export interface WorldDshVersionFacts {
  readonly worldVersionId: string;
  readonly label: string;
  readonly lifecycle: 'published';
  readonly publishedAt: string;
}

export interface WorldDshProjectFacts {
  readonly worldProjectId: string;
  readonly title: string;
  readonly reviewStatus: WorldReviewStatus;
  readonly isFreshTarget: boolean;
  readonly draft: {
    readonly hasBackground: boolean;
    readonly worldBookCount: number;
    readonly locationCount: number;
    readonly organizationCount: number;
    readonly ruleCount: number;
    readonly initialFactCount: number;
  };
  readonly sourceCount: number;
  readonly versionCount: number;
  readonly versions: readonly WorldDshVersionFacts[];
  readonly versionsTruncated: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function decodeWorldDshToolInput(operation: unknown, input: unknown): WorldDshToolInput {
  const record = requireRecord(input, 'input');
  if (operation === 'query') {
    requireOnlyKeys(record, ['worldProjectId'], 'input');
    return {
      operation,
      input: { worldProjectId: requireIdentity(record.worldProjectId, 'input.worldProjectId') },
    };
  }
  if (operation === 'fill-draft') {
    requireOnlyKeys(record, ['worldProjectId', 'title', 'draft'], 'input');
    return {
      operation,
      input: {
        worldProjectId: requireIdentity(record.worldProjectId, 'input.worldProjectId'),
        title: requireIdentity(record.title, 'input.title'),
        draft: parseWorldDefinition(record.draft),
      },
    };
  }
  throw new Error(
    `World DSH tool operation must be one of ${WORLD_DSH_TOOL_OPERATIONS.join(', ')}.`,
  );
}

export class WorldDshAuthoringService {
  constructor(
    private readonly options: {
      readonly scope: Extract<WorldAuthoringCatalogScope, { readonly kind: 'project' }>;
      readonly worldProjectId: string;
      readonly catalog: WorldAuthoringCatalogPort;
      readonly authoring: Pick<WorldAuthoringService, 'fillFreshDraft'>;
    },
  ) {}

  async query(
    input: { readonly worldProjectId: string },
    signal?: AbortSignal,
  ): Promise<WorldDshProjectFacts> {
    this.requireExactTarget(input.worldProjectId);
    signal?.throwIfAborted();
    const catalog = await this.options.catalog.readAuthoringCatalog(signal);
    if (!sameScope(catalog.scope, this.options.scope)) {
      throw diagnosticError(
        'WORLD_DSH_AUTHORITY_MISMATCH',
        'World authoring catalog does not match its exact Project authority.',
      );
    }
    const project = catalog.projects.find(
      (candidate) => candidate.worldProjectId === input.worldProjectId,
    );
    if (!project) {
      const diagnostic = catalog.diagnostics.find(
        (candidate) =>
          candidate.recordKind === 'world-project' && candidate.recordId === input.worldProjectId,
      );
      throw diagnosticError(
        'WORLD_DSH_PROJECT_UNAVAILABLE',
        diagnostic?.message ?? `WorldProject '${input.worldProjectId}' is unavailable.`,
      );
    }
    return projectWorldDshFacts(project, catalog.versions);
  }

  async fillDraft(
    input: {
      readonly worldProjectId: string;
      readonly title: string;
      readonly draft: WorldDefinition;
    },
    signal?: AbortSignal,
  ): Promise<WorldDshProjectFacts> {
    this.requireExactTarget(input.worldProjectId);
    await this.options.authoring.fillFreshDraft(input, signal);
    return this.query({ worldProjectId: input.worldProjectId }, signal);
  }

  private requireExactTarget(worldProjectId: string): void {
    if (worldProjectId !== this.options.worldProjectId) {
      throw diagnosticError(
        'WORLD_DSH_TARGET_MISMATCH',
        'World Tool input targets another WorldProject.',
      );
    }
  }
}

export function projectWorldDshFacts(
  project: WorldProject,
  versions: readonly {
    readonly worldVersionId: string;
    readonly worldProjectId: string;
    readonly label: string;
    readonly publishedAt: string;
  }[],
): WorldDshProjectFacts {
  const matching = versions.filter((item) => item.worldProjectId === project.worldProjectId);
  return {
    worldProjectId: project.worldProjectId,
    title: project.title,
    reviewStatus: project.reviewStatus,
    isFreshTarget: isFreshWorldCreationTarget(project),
    draft: {
      hasBackground: project.draft.background.length > 0,
      worldBookCount: project.draft.worldBook.length,
      locationCount: project.draft.locations.length,
      organizationCount: project.draft.organizations.length,
      ruleCount: project.draft.rules.length,
      initialFactCount: project.draft.initialFacts.length,
    },
    sourceCount: project.sourceRefs.length,
    versionCount: matching.length,
    versions: matching.slice(0, WORLD_DSH_MAX_PROJECTED_VERSIONS).map((item) => ({
      worldVersionId: item.worldVersionId,
      label: item.label,
      lifecycle: 'published',
      publishedAt: item.publishedAt,
    })),
    versionsTruncated: matching.length > WORLD_DSH_MAX_PROJECTED_VERSIONS,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireOnlyKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  field: string,
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record))
    if (!allowed.has(key)) throw new Error(`${field}.${key} is not supported.`);
}

function requireIdentity(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${field} must be a non-empty string.`);
  return value;
}

function sameScope(left: WorldAuthoringCatalogScope, right: WorldAuthoringCatalogScope): boolean {
  return left.kind === 'project' && right.kind === 'project' && left.projectId === right.projectId;
}

function diagnosticError(code: string, message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code });
}
