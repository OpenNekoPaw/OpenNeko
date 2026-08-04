import { createHash } from 'node:crypto';
import {
  encodeProjectEntityDocument,
  type ProjectEntityDocument,
  type ProjectEntityDocumentRepository,
} from '@neko/entity-domain';
import type { ContentLocator } from '@neko/content';
import { NodeProjectEntityRepository } from './node-project-entity-repository';

export interface ProjectEntityRepresentationReferenceSnapshot {
  readonly documentRevision: number;
  readonly fingerprint: string;
  readonly references: readonly ContentLocator[];
}

export interface NodeProjectEntityRepresentationReferenceOptions {
  readonly workspacePath: string;
  readonly projectId: string;
  readonly repository?: ProjectEntityDocumentRepository;
}

export class NodeProjectEntityRepresentationReferenceService {
  private readonly repository: ProjectEntityDocumentRepository;

  constructor(private readonly options: NodeProjectEntityRepresentationReferenceOptions) {
    this.repository =
      options.repository ??
      new NodeProjectEntityRepository({
        workspacePath: options.workspacePath,
        projectId: options.projectId,
      });
  }

  async inspect(signal?: AbortSignal): Promise<ProjectEntityRepresentationReferenceSnapshot> {
    const document = await this.repository.load(signal);
    return snapshot(document);
  }

  async rewriteWorkspacePaths(
    input: {
      readonly expectedRevision: number;
      readonly replacements: ReadonlyMap<string, string>;
    },
    signal?: AbortSignal,
  ): Promise<ProjectEntityRepresentationReferenceSnapshot> {
    const current = await this.repository.load(signal);
    if (current.revision !== input.expectedRevision) {
      throw new Error(
        `Project Entity representation rewrite expected revision ${String(input.expectedRevision)}, received ${String(current.revision)}.`,
      );
    }
    let rewrittenCount = 0;
    const entities = current.entities.map((entity) => ({
      ...entity,
      representations: entity.representations.map((binding) => {
        if (binding.target.kind !== 'workspace-file') return binding;
        const replacement = input.replacements.get(binding.target.path);
        if (!replacement) return binding;
        rewrittenCount += 1;
        return { ...binding, target: { kind: 'workspace-file' as const, path: replacement } };
      }),
    }));
    if (rewrittenCount === 0) return snapshot(current);
    const next: ProjectEntityDocument = {
      ...current,
      revision: current.revision + 1,
      entities,
    };
    return snapshot(
      await this.repository.commit({ expectedRevision: input.expectedRevision, next }, signal),
    );
  }
}

function snapshot(document: ProjectEntityDocument): ProjectEntityRepresentationReferenceSnapshot {
  return {
    documentRevision: document.revision,
    fingerprint: createHash('sha256').update(encodeProjectEntityDocument(document)).digest('hex'),
    references: document.entities.flatMap((entity) =>
      entity.representations.map((binding) => binding.target),
    ),
  };
}
