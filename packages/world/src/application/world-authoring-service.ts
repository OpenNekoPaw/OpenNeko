import {
  parseWorldProject,
  parseWorldVersion,
  type WorldDefinition,
  type WorldProject,
  type WorldReviewStatus,
  type WorldSourceRef,
  type WorldVersion,
} from '@neko/world/contracts';

export interface WorldAuthoringRepository {
  readProject(worldProjectId: string, signal?: AbortSignal): Promise<WorldProject | undefined>;
  saveProject(project: WorldProject, signal?: AbortSignal): Promise<void>;
  storePublication(publication: WorldVersion, signal?: AbortSignal): Promise<void>;
}

export interface WorldAuthoringServiceOptions {
  readonly repository: WorldAuthoringRepository;
  readonly now?: () => string;
}

export interface UpdateWorldDraftInput {
  readonly worldProjectId: string;
  readonly draft: WorldDefinition;
}

export interface FillFreshWorldInput extends UpdateWorldDraftInput {
  readonly title: string;
}

export type WorldAuthoringDiagnosticCode =
  | 'world-project-not-found'
  | 'world-project-already-exists'
  | 'world-source-already-exists'
  | 'world-publication-not-ready'
  | 'world-authoring-operation-invalid';

export class WorldAuthoringError extends Error {
  constructor(
    readonly code: WorldAuthoringDiagnosticCode,
    message: string,
    readonly worldProjectId?: string,
  ) {
    super(message);
    this.name = 'WorldAuthoringError';
  }
}

export class WorldAuthoringService {
  private readonly now: () => string;

  constructor(private readonly options: WorldAuthoringServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createProject(
    input: {
      readonly worldProjectId: string;
      readonly title: string;
      readonly draft: WorldDefinition;
    },
    signal?: AbortSignal,
  ): Promise<WorldProject> {
    const project = await this.prepareProject(input, signal);
    await this.options.repository.saveProject(project, signal);
    return structuredClone(project);
  }

  async prepareProject(
    input: {
      readonly worldProjectId: string;
      readonly title: string;
      readonly draft: WorldDefinition;
    },
    signal?: AbortSignal,
  ): Promise<WorldProject> {
    if (await this.options.repository.readProject(input.worldProjectId, signal)) {
      throw worldAuthoringError(
        'world-project-already-exists',
        `WorldProject '${input.worldProjectId}' already exists.`,
        input.worldProjectId,
      );
    }
    const timestamp = this.now();
    const project = parseWorldProject({
      worldProjectId: input.worldProjectId,
      title: input.title,
      draft: input.draft,
      sourceRefs: [],
      reviewStatus: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return structuredClone(project);
  }

  async updateDraft(input: UpdateWorldDraftInput, signal?: AbortSignal): Promise<WorldProject> {
    return this.updateProject(
      input.worldProjectId,
      (project) => ({ ...project, draft: structuredClone(input.draft), reviewStatus: 'draft' }),
      signal,
    );
  }

  async fillFreshDraft(input: FillFreshWorldInput, signal?: AbortSignal): Promise<WorldProject> {
    return this.updateProject(
      input.worldProjectId,
      (project) => {
        if (!isFreshWorldCreationTarget(project)) {
          throw worldAuthoringError(
            'world-authoring-operation-invalid',
            `WorldProject '${project.worldProjectId}' is not a fresh world creation target.`,
            project.worldProjectId,
          );
        }
        return {
          ...project,
          title: input.title,
          draft: structuredClone(input.draft),
          reviewStatus: 'draft',
        };
      },
      signal,
    );
  }

  async addReviewedSource(
    input: { readonly worldProjectId: string; readonly sourceRef: WorldSourceRef },
    signal?: AbortSignal,
  ): Promise<WorldProject> {
    return this.updateProject(
      input.worldProjectId,
      (project) => {
        if (project.sourceRefs.some((item) => item.sourceRefId === input.sourceRef.sourceRefId)) {
          throw worldAuthoringError(
            'world-source-already-exists',
            `World source '${input.sourceRef.sourceRefId}' already exists.`,
            project.worldProjectId,
          );
        }
        return {
          ...project,
          sourceRefs: [...project.sourceRefs, structuredClone(input.sourceRef)],
          reviewStatus: 'draft',
        };
      },
      signal,
    );
  }

  async setReviewStatus(
    input: { readonly worldProjectId: string; readonly reviewStatus: WorldReviewStatus },
    signal?: AbortSignal,
  ): Promise<WorldProject> {
    return this.updateProject(
      input.worldProjectId,
      (project) => ({ ...project, reviewStatus: input.reviewStatus }),
      signal,
    );
  }

  async publish(
    input: {
      readonly worldProjectId: string;
      readonly worldVersionId: string;
      readonly label: string;
    },
    signal?: AbortSignal,
  ): Promise<WorldVersion> {
    const project = await this.requireProject(input.worldProjectId, signal);
    if (project.reviewStatus !== 'ready') {
      throw worldAuthoringError(
        'world-publication-not-ready',
        `WorldProject '${project.worldProjectId}' is not ready for publication.`,
        project.worldProjectId,
      );
    }
    const publication = deepFreeze(
      parseWorldVersion({
        worldVersionId: input.worldVersionId,
        worldProjectId: project.worldProjectId,
        label: input.label,
        definition: project.draft,
        acceptedSourceRefIds: project.sourceRefs.map((source) => source.sourceRefId),
        publishedAt: this.now(),
      }),
    );
    await this.options.repository.storePublication(publication, signal);
    return publication;
  }

  async requireProject(worldProjectId: string, signal?: AbortSignal): Promise<WorldProject> {
    const project = await this.options.repository.readProject(worldProjectId, signal);
    if (!project) {
      throw worldAuthoringError(
        'world-project-not-found',
        `WorldProject '${worldProjectId}' does not exist.`,
        worldProjectId,
      );
    }
    return parseWorldProject(project);
  }

  private async updateProject(
    worldProjectId: string,
    update: (project: WorldProject) => WorldProject,
    signal?: AbortSignal,
  ): Promise<WorldProject> {
    const current = await this.requireProject(worldProjectId, signal);
    const updated = parseWorldProject({ ...update(current), updatedAt: this.now() });
    await this.options.repository.saveProject(updated, signal);
    return structuredClone(updated);
  }
}

function isFreshWorldCreationTarget(project: WorldProject): boolean {
  const { draft } = project;
  return (
    project.reviewStatus === 'draft' &&
    project.sourceRefs.length === 0 &&
    draft.background.length === 0 &&
    draft.worldBook.length === 0 &&
    draft.locations.length === 0 &&
    draft.organizations.length === 0 &&
    draft.rules.length === 0 &&
    draft.initialFacts.length === 0
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function worldAuthoringError(
  code: WorldAuthoringDiagnosticCode,
  message: string,
  worldProjectId?: string,
): WorldAuthoringError {
  return new WorldAuthoringError(code, message, worldProjectId);
}
