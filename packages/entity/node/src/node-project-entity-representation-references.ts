import { createHash } from 'node:crypto';
import {
  encodeProjectEntityDocument,
  type ProjectEntityDocument,
  type ProjectEntityDocumentRepository,
  type ProjectEntityDiagnostic,
} from '@neko/entity-domain';
import { contentLocatorKey, type ContentLocator } from '@neko/content-domain';
import {
  NodeProjectEntityRepository,
  type ProjectEntityAvailableDocumentReader,
} from './node-project-entity-repository';

export interface ProjectEntityRepresentationReferenceSnapshot {
  readonly fingerprint: string;
  readonly references: readonly ContentLocator[];
  readonly diagnostics: readonly ProjectEntityDiagnostic[];
}

export interface NodeProjectEntityRepresentationReferenceOptions {
  readonly workspacePath: string;
  readonly projectId: string;
  readonly repository?: ProjectEntityDocumentRepository & ProjectEntityAvailableDocumentReader;
}

export class NodeProjectEntityRepresentationReferenceService {
  private readonly repository: ProjectEntityDocumentRepository &
    ProjectEntityAvailableDocumentReader;

  constructor(private readonly options: NodeProjectEntityRepresentationReferenceOptions) {
    this.repository =
      options.repository ??
      new NodeProjectEntityRepository({
        workspacePath: options.workspacePath,
        projectId: options.projectId,
      });
  }

  async inspect(signal?: AbortSignal): Promise<ProjectEntityRepresentationReferenceSnapshot> {
    const result = await this.repository.readAvailable(signal);
    return snapshot(result.document, result.diagnostics);
  }

  async rewriteContentLocators(
    input: {
      readonly replacements: ReadonlyMap<string, string>;
    },
    signal?: AbortSignal,
  ): Promise<ProjectEntityRepresentationReferenceSnapshot> {
    return snapshot(
      await this.repository.mutate((current) => {
        let rewrittenCount = 0;
        const entities = current.entities.map((entity) => ({
          ...entity,
          representations: entity.representations.map((binding) => {
            const replacement = input.replacements.get(contentLocatorKey(binding.target));
            if (!replacement) return binding;
            rewrittenCount += 1;
            return {
              ...binding,
              target: { file: { authority: 'workspace' as const, path: replacement } },
            };
          }),
        }));
        if (rewrittenCount === 0) return current;
        return { ...current, entities };
      }, signal),
      [],
    );
  }
}

function snapshot(
  document: ProjectEntityDocument,
  diagnostics: readonly ProjectEntityDiagnostic[],
): ProjectEntityRepresentationReferenceSnapshot {
  return {
    fingerprint: createHash('sha256').update(encodeProjectEntityDocument(document)).digest('hex'),
    references: document.entities.flatMap((entity) =>
      entity.representations.map((binding) => binding.target),
    ),
    diagnostics,
  };
}
