import { validateContentLocator } from '@neko/content';
import {
  ProjectEntityContractError,
  type ProjectEntityAssetPortableSnapshot,
  type ProjectEntityAssetPreparedResource,
  type ProjectEntityAssetPublicationAdapter,
  type ProjectEntityAssetRepresentationPublicationPlan,
  type ProjectEntityAssetRevisionRef,
  type ProjectEntityDocumentRepository,
  type ProjectEntityRecord,
  type ProjectEntityRepresentationBinding,
  type ProjectEntitySemanticSnapshot,
} from '../contracts/index';

export interface PublishProjectEntityAssetRequest {
  readonly operationId: string;
  readonly entityId: string;
  readonly target: { readonly assetId: string; readonly revision: string };
  readonly representations: readonly ProjectEntityAssetRepresentationPublicationPlan[];
}

export interface ProjectEntityAssetPublicationServiceOptions {
  readonly repository: ProjectEntityDocumentRepository;
  readonly assets: ProjectEntityAssetPublicationAdapter;
}

export class ProjectEntityAssetPublicationService {
  constructor(private readonly options: ProjectEntityAssetPublicationServiceOptions) {}

  async publish(
    request: PublishProjectEntityAssetRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityAssetRevisionRef> {
    const document = await this.options.repository.load(signal);
    const entity = document.entities.find((candidate) => candidate.entityId === request.entityId);
    if (!entity || entity.lifecycle.state !== 'active') {
      throw publicationError(
        'project-entity-not-found',
        `Active Project Entity '${request.entityId}' does not exist.`,
      );
    }
    assertPublicationIdentity(request);
    const plans = indexRepresentationPlans(entity, request.representations);
    const preparedResources: ProjectEntityAssetPreparedResource[] = [];
    let stagingStarted = false;
    try {
      const semantic = await convertSemantic(
        entity,
        request,
        plans,
        preparedResources,
        async (binding, resourcePath) => {
          stagingStarted = true;
          return this.options.assets.prepareResource(
            { operationId: request.operationId, source: binding.target, resourcePath },
            signal,
          );
        },
      );
      const dependencies = dependencyRevisions(entity, plans);
      const snapshot: ProjectEntityAssetPortableSnapshot = {
        assetId: request.target.assetId,
        revision: request.target.revision,
        semantic,
        dependencies,
        resources: preparedResources.map(({ resourcePath, digest }) => ({
          resourcePath,
          digest,
        })),
      };
      stagingStarted = true;
      const published = await this.options.assets.publish(
        { operationId: request.operationId, snapshot, preparedResources },
        signal,
      );
      if (
        published.assetId !== request.target.assetId ||
        published.revision !== request.target.revision ||
        !isDigest(published.digest)
      ) {
        throw publicationError(
          'invalid-project-entity-asset-snapshot',
          'Asset publication returned a different or invalid immutable revision.',
        );
      }
      return published;
    } catch (error: unknown) {
      if (stagingStarted) await abortPublication(this.options.assets, request.operationId, error);
      throw error;
    }
  }
}

async function convertSemantic(
  entity: ProjectEntityRecord,
  request: PublishProjectEntityAssetRequest,
  plans: ReadonlyMap<string, ProjectEntityAssetRepresentationPublicationPlan>,
  preparedResources: ProjectEntityAssetPreparedResource[],
  prepare: (
    binding: ProjectEntityRepresentationBinding,
    resourcePath: string,
  ) => Promise<ProjectEntityAssetPreparedResource>,
): Promise<ProjectEntitySemanticSnapshot> {
  const representations: ProjectEntityRepresentationBinding[] = [];
  for (const binding of entity.representations) {
    const plan = plans.get(binding.bindingId);
    if (!plan) throw publicationError('invalid-project-entity-asset-snapshot', '');
    if (plan.mode === 'omit') continue;
    if (plan.mode === 'dependency') {
      if (
        binding.target.kind !== 'package-resource' ||
        !binding.target.digest ||
        (binding.target.packageId === request.target.assetId &&
          binding.target.revision === request.target.revision)
      ) {
        throw publicationError(
          'invalid-project-entity-asset-snapshot',
          `Project Entity binding '${binding.bindingId}' is not an exact external Asset dependency.`,
        );
      }
      representations.push({ ...binding, target: { ...binding.target } });
      continue;
    }
    const prepared = await prepare(binding, plan.resourcePath);
    if (
      prepared.resourcePath !== plan.resourcePath ||
      !isStableIdentity(prepared.resourceId) ||
      !isDigest(prepared.digest) ||
      !isPortableResourcePath(prepared.resourcePath)
    ) {
      throw publicationError(
        'invalid-project-entity-asset-snapshot',
        `Prepared Project Entity resource '${binding.bindingId}' is invalid.`,
      );
    }
    preparedResources.push(prepared);
    const target = validateContentLocator({
      kind: 'package-resource',
      packageId: request.target.assetId,
      revision: request.target.revision,
      resourcePath: prepared.resourcePath,
      digest: prepared.digest,
    });
    if (!target.ok || target.locator.kind !== 'package-resource') {
      throw publicationError(
        'invalid-project-entity-asset-snapshot',
        `Prepared Project Entity resource '${binding.bindingId}' is not portable.`,
      );
    }
    representations.push({ ...binding, target: target.locator });
  }
  return {
    kind: entity.kind,
    names: structuredClone(entity.names),
    facts: structuredClone(entity.facts),
    representations,
  };
}

function indexRepresentationPlans(
  entity: ProjectEntityRecord,
  plans: readonly ProjectEntityAssetRepresentationPublicationPlan[],
): ReadonlyMap<string, ProjectEntityAssetRepresentationPublicationPlan> {
  const byId = new Map(plans.map((plan) => [plan.bindingId, plan]));
  const bindingIds = new Set(entity.representations.map((binding) => binding.bindingId));
  const embeddedPaths = plans.flatMap((plan) => (plan.mode === 'embed' ? [plan.resourcePath] : []));
  if (
    byId.size !== plans.length ||
    byId.size !== bindingIds.size ||
    new Set(embeddedPaths).size !== embeddedPaths.length ||
    plans.some((plan) => !bindingIds.has(plan.bindingId)) ||
    plans.some((plan) => plan.mode === 'embed' && !isPortableResourcePath(plan.resourcePath))
  ) {
    throw publicationError(
      'invalid-project-entity-asset-snapshot',
      'Entity Asset publication requires one explicit portable plan for every binding.',
    );
  }
  return byId;
}

function dependencyRevisions(
  entity: ProjectEntityRecord,
  plans: ReadonlyMap<string, ProjectEntityAssetRepresentationPublicationPlan>,
): readonly ProjectEntityAssetRevisionRef[] {
  const dependencies = new Map<string, ProjectEntityAssetRevisionRef>();
  for (const binding of entity.representations) {
    if (plans.get(binding.bindingId)?.mode !== 'dependency') continue;
    if (binding.target.kind !== 'package-resource' || !binding.target.digest) continue;
    const revision = {
      assetId: binding.target.packageId,
      revision: binding.target.revision,
      digest: binding.target.digest,
    };
    dependencies.set(`${revision.assetId}\0${revision.revision}\0${revision.digest}`, revision);
  }
  return [...dependencies.values()];
}

function assertPublicationIdentity(request: PublishProjectEntityAssetRequest): void {
  if (
    !isStableIdentity(request.operationId) ||
    !isStableIdentity(request.target.assetId) ||
    !isStableIdentity(request.target.revision)
  ) {
    throw publicationError(
      'invalid-project-entity-asset-snapshot',
      'Entity Asset publication requires stable operation, Asset, and revision identities.',
    );
  }
}

function isPortableResourcePath(value: string): boolean {
  const result = validateContentLocator({
    kind: 'package-resource',
    packageId: 'publication-target',
    revision: 'publication-revision',
    resourcePath: value,
    digest: 'a'.repeat(64),
  });
  return result.ok;
}

function isStableIdentity(value: string): boolean {
  return value.trim().length > 0 && value.length <= 256 && !/[\\/\0]/u.test(value);
}

function isDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

async function abortPublication(
  assets: ProjectEntityAssetPublicationAdapter,
  operationId: string,
  originalError: unknown,
): Promise<void> {
  try {
    await assets.abort(operationId);
  } catch (abortError: unknown) {
    throw new AggregateError(
      [originalError, abortError],
      'Entity Asset publication failed and its staging operation could not be aborted.',
    );
  }
}

function publicationError(
  code: ConstructorParameters<typeof ProjectEntityContractError>[0][number]['code'],
  message: string,
): ProjectEntityContractError {
  return new ProjectEntityContractError([{ code, message }]);
}
