import {
  parseContentProjectComposition,
  projectLocalTargetKey,
  projectPublicationDependencyKey,
  type ContentProjectComposition,
  type ContentProjectId,
  type ProjectLocalTargetRef,
  type ProjectPublicationDependencyRef,
} from '../contracts/project-composition';

export interface ProjectCompositionRepository {
  read(signal?: AbortSignal): Promise<ContentProjectComposition | undefined>;
  save(composition: ContentProjectComposition, signal?: AbortSignal): Promise<void>;
}

export type ProjectCompositionErrorCode =
  | 'project-composition-not-found'
  | 'project-composition-already-exists'
  | 'project-composition-identity-mismatch'
  | 'project-local-target-already-linked'
  | 'project-local-target-not-linked'
  | 'project-dependency-already-bound'
  | 'project-dependency-not-bound';

export class ProjectCompositionError extends Error {
  constructor(
    readonly code: ProjectCompositionErrorCode,
    message: string,
    readonly contentProjectId: string,
  ) {
    super(message);
    this.name = 'ProjectCompositionError';
  }
}

export class ProjectCompositionService {
  constructor(private readonly repository: ProjectCompositionRepository) {}

  async create(
    contentProjectId: ContentProjectId,
    signal?: AbortSignal,
  ): Promise<ContentProjectComposition> {
    signal?.throwIfAborted();
    if (await this.repository.read(signal)) {
      throw error(
        'project-composition-already-exists',
        `Content Project composition '${contentProjectId}' already exists.`,
        contentProjectId,
      );
    }
    const composition = parseContentProjectComposition({
      contentProjectId,
      localTargets: [],
      dependencies: [],
    });
    await this.repository.save(composition, signal);
    return structuredClone(composition);
  }

  async addLocalTarget(
    contentProjectId: ContentProjectId,
    target: ProjectLocalTargetRef,
    signal?: AbortSignal,
  ): Promise<ContentProjectComposition> {
    return this.update(
      contentProjectId,
      (composition) => {
        const key = projectLocalTargetKey(target);
        if (composition.localTargets.some((item) => projectLocalTargetKey(item) === key)) {
          throw error(
            'project-local-target-already-linked',
            `Project local target '${key}' is already linked.`,
            contentProjectId,
          );
        }
        return { ...composition, localTargets: [...composition.localTargets, target] };
      },
      signal,
    );
  }

  async removeLocalTarget(
    contentProjectId: ContentProjectId,
    target: ProjectLocalTargetRef,
    signal?: AbortSignal,
  ): Promise<ContentProjectComposition> {
    return this.update(
      contentProjectId,
      (composition) => {
        const key = projectLocalTargetKey(target);
        if (!composition.localTargets.some((item) => projectLocalTargetKey(item) === key)) {
          throw error(
            'project-local-target-not-linked',
            `Project local target '${key}' is not linked.`,
            contentProjectId,
          );
        }
        return {
          ...composition,
          localTargets: composition.localTargets.filter(
            (item) => projectLocalTargetKey(item) !== key,
          ),
        };
      },
      signal,
    );
  }

  async bindDependency(
    contentProjectId: ContentProjectId,
    dependency: ProjectPublicationDependencyRef,
    signal?: AbortSignal,
  ): Promise<ContentProjectComposition> {
    return this.update(
      contentProjectId,
      (composition) => {
        const key = projectPublicationDependencyKey(dependency);
        if (
          composition.dependencies.some((item) => projectPublicationDependencyKey(item) === key)
        ) {
          throw error(
            'project-dependency-already-bound',
            `Project dependency '${key}' is already bound.`,
            contentProjectId,
          );
        }
        return { ...composition, dependencies: [...composition.dependencies, dependency] };
      },
      signal,
    );
  }

  async unbindDependency(
    contentProjectId: ContentProjectId,
    dependency: ProjectPublicationDependencyRef,
    signal?: AbortSignal,
  ): Promise<ContentProjectComposition> {
    return this.update(
      contentProjectId,
      (composition) => {
        const key = projectPublicationDependencyKey(dependency);
        if (
          !composition.dependencies.some((item) => projectPublicationDependencyKey(item) === key)
        ) {
          throw error(
            'project-dependency-not-bound',
            `Project dependency '${key}' is not bound.`,
            contentProjectId,
          );
        }
        return {
          ...composition,
          dependencies: composition.dependencies.filter(
            (item) => projectPublicationDependencyKey(item) !== key,
          ),
        };
      },
      signal,
    );
  }

  async require(
    contentProjectId: ContentProjectId,
    signal?: AbortSignal,
  ): Promise<ContentProjectComposition> {
    signal?.throwIfAborted();
    const composition = await this.repository.read(signal);
    if (!composition) {
      throw error(
        'project-composition-not-found',
        `Content Project composition '${contentProjectId}' does not exist.`,
        contentProjectId,
      );
    }
    const parsed = parseContentProjectComposition(composition);
    if (parsed.contentProjectId !== contentProjectId) {
      throw error(
        'project-composition-identity-mismatch',
        `Content Project composition '${parsed.contentProjectId}' does not match '${contentProjectId}'.`,
        contentProjectId,
      );
    }
    return parsed;
  }

  async requireLocalTarget(
    contentProjectId: ContentProjectId,
    target: ProjectLocalTargetRef,
    signal?: AbortSignal,
  ): Promise<ProjectLocalTargetRef> {
    const composition = await this.require(contentProjectId, signal);
    const key = projectLocalTargetKey(target);
    const linked = composition.localTargets.find((item) => projectLocalTargetKey(item) === key);
    if (!linked) {
      throw error(
        'project-local-target-not-linked',
        `Project local target '${key}' is not linked.`,
        contentProjectId,
      );
    }
    return structuredClone(linked);
  }

  private async update(
    contentProjectId: ContentProjectId,
    mutation: (composition: ContentProjectComposition) => ContentProjectComposition,
    signal?: AbortSignal,
  ): Promise<ContentProjectComposition> {
    const current = await this.require(contentProjectId, signal);
    const next = parseContentProjectComposition(mutation(structuredClone(current)));
    if (next.contentProjectId !== current.contentProjectId) {
      throw error(
        'project-composition-identity-mismatch',
        'Project composition mutation changed its authoritative identity.',
        contentProjectId,
      );
    }
    await this.repository.save(next, signal);
    return structuredClone(next);
  }
}

function error(
  code: ProjectCompositionErrorCode,
  message: string,
  contentProjectId: string,
): ProjectCompositionError {
  return new ProjectCompositionError(code, message, contentProjectId);
}
