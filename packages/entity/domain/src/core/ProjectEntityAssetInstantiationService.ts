import {
  ProjectEntityContractError,
  assertProjectEntityDocument,
  type ProjectEntityAssetRevisionReader,
  type ProjectEntityAssetRevisionRef,
  type ProjectEntityDocumentRepository,
  type ProjectEntityFactValue,
  type ProjectEntityOperationCommitPort,
  type ProjectEntityRecord,
  type ProjectEntitySemanticSnapshot,
} from '../contracts/index';

export interface InstantiateProjectEntityAssetRequest {
  readonly expectedRevision: number;
  readonly asset: ProjectEntityAssetRevisionRef;
  readonly createdAt: string;
}

export interface ProjectEntityAssetInstantiationServiceOptions {
  readonly repository: ProjectEntityDocumentRepository;
  readonly assets: ProjectEntityAssetRevisionReader;
  readonly commits: ProjectEntityOperationCommitPort;
  readonly createEntityId: () => string;
  readonly createBindingId: (entityId: string, assetBindingId: string) => string;
}

export class ProjectEntityAssetInstantiationService {
  constructor(private readonly options: ProjectEntityAssetInstantiationServiceOptions) {}

  async instantiate(
    request: InstantiateProjectEntityAssetRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityRecord> {
    const current = await this.options.repository.load(signal);
    if (current.revision !== request.expectedRevision) {
      throw assetError(
        'project-entity-revision-conflict',
        `Project Entity revision conflict: expected ${String(request.expectedRevision)}, received ${String(current.revision)}.`,
      );
    }
    const asset = await this.options.assets.readExact(request.asset, signal);
    if (!asset) {
      throw assetError(
        'project-entity-asset-not-found',
        `Entity Asset '${request.asset.assetId}' revision '${request.asset.revision}' is not installed.`,
      );
    }
    if (!sameAssetRevision(asset.revision, request.asset)) {
      throw assetError(
        'invalid-project-entity-asset-snapshot',
        'Entity Asset reader returned a different revision than requested.',
      );
    }
    const entityId = this.options.createEntityId();
    if (
      !isStableIdentity(entityId) ||
      entityId === request.asset.assetId ||
      current.entities.some((entity) => entity.entityId === entityId)
    ) {
      throw assetError(
        'project-entity-operation-invalid',
        'Entity Asset instantiation requires a new independent Project Entity identity.',
      );
    }
    const semantic = instantiateSemantic(
      asset.semantic,
      entityId,
      current,
      this.options.createBindingId,
    );
    const record: ProjectEntityRecord = {
      entityId,
      ...semantic,
      lifecycle: { state: 'active' },
      provenance: {
        origin: { ...request.asset },
        applied: { ...request.asset },
        importBase: cloneSemantic(asset.semantic),
      },
      createdAt: request.createdAt,
      updatedAt: request.createdAt,
    };
    const next = assertProjectEntityDocument({
      ...current,
      revision: current.revision + 1,
      entities: [...current.entities, record],
    });
    const committed = await this.options.commits.commit(
      { expectedRevision: current.revision, next },
      signal,
    );
    const committedRecord = committed.entities.find((entity) => entity.entityId === entityId);
    if (!committedRecord) {
      throw assetError(
        'invalid-project-entity-asset-snapshot',
        'Entity Asset instantiation commit omitted the new Project Entity.',
      );
    }
    return committedRecord;
  }
}

function instantiateSemantic(
  snapshot: ProjectEntitySemanticSnapshot,
  entityId: string,
  document: Awaited<ReturnType<ProjectEntityDocumentRepository['load']>>,
  createBindingId: (entityId: string, assetBindingId: string) => string,
): ProjectEntitySemanticSnapshot {
  const existingBindingIds = new Set(
    document.entities.flatMap((entity) =>
      entity.representations.map((binding) => binding.bindingId),
    ),
  );
  const generatedBindingIds = new Set<string>();
  const semantic = cloneSemantic(snapshot);
  const representations = semantic.representations.map((binding) => {
    const bindingId = createBindingId(entityId, binding.bindingId);
    if (
      !isStableIdentity(bindingId) ||
      bindingId === binding.bindingId ||
      existingBindingIds.has(bindingId) ||
      generatedBindingIds.has(bindingId)
    ) {
      throw assetError(
        'project-entity-operation-invalid',
        'Entity Asset instantiation requires independent Project binding identities.',
      );
    }
    generatedBindingIds.add(bindingId);
    return { ...binding, bindingId };
  });
  return { ...semantic, representations };
}

function cloneSemantic(snapshot: ProjectEntitySemanticSnapshot): ProjectEntitySemanticSnapshot {
  return {
    kind: snapshot.kind,
    names: {
      canonical: snapshot.names.canonical,
      ...(snapshot.names.display ? { display: snapshot.names.display } : {}),
      aliases: [...snapshot.names.aliases],
    },
    facts: cloneFacts(snapshot.facts),
    representations: snapshot.representations.map((binding) => ({
      ...binding,
      target: structuredClone(binding.target),
    })),
  };
}

function cloneFacts(
  facts: Readonly<Record<string, ProjectEntityFactValue>>,
): Readonly<Record<string, ProjectEntityFactValue>> {
  return structuredClone(facts);
}

function sameAssetRevision(
  left: ProjectEntityAssetRevisionRef,
  right: ProjectEntityAssetRevisionRef,
): boolean {
  return (
    left.assetId === right.assetId &&
    left.revision === right.revision &&
    left.digest === right.digest
  );
}

function isStableIdentity(value: string): boolean {
  return value.trim().length > 0 && value.length <= 256 && !/[\\/\0]/u.test(value);
}

function assetError(
  code: ConstructorParameters<typeof ProjectEntityContractError>[0][number]['code'],
  message: string,
): ProjectEntityContractError {
  return new ProjectEntityContractError([{ code, message }]);
}
