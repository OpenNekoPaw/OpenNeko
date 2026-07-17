import type {
  AssetFederationCapabilityProvider,
  AssetRefResolver,
  CreativeEntityRegistry,
  EntityAssetBinding,
  EntityAssetBindingRole,
  RepresentationKind,
  RepresentationResolveRequest,
  RepresentationResolveResult,
  ResolvedAssetRef,
  ResolvedRepresentationFile,
} from '@neko/shared';
import { DEFAULT_REPRESENTATION_FALLBACKS } from '@neko/shared';

export interface RepresentationBindingReader {
  list(): Promise<readonly EntityAssetBinding[]>;
}

export interface RepresentationResolverOptions {
  readonly entities: CreativeEntityRegistry;
  readonly bindings: RepresentationBindingReader;
  readonly assetRefs: AssetRefResolver;
  readonly federation?: AssetFederationCapabilityProvider;
}

export class RepresentationResolver {
  constructor(private readonly options: RepresentationResolverOptions) {}

  async resolve(request: RepresentationResolveRequest): Promise<RepresentationResolveResult> {
    const entity = await this.options.entities.get(request.entityId);
    const allBindings = await this.options.bindings.list();
    const candidates = allBindings.filter(
      (binding) =>
        binding.entityId === request.entityId &&
        (!entity || binding.entityKind === entity.kind) &&
        binding.status === 'confirmed',
    );

    const order = getRepresentationFallbackOrder(request);
    for (const kind of order) {
      const binding = pickBindingForKind(candidates, kind);
      if (!binding) {
        continue;
      }

      const resolvedRef = await this.options.assetRefs.resolve(binding.assetRef);
      const federationSemantics = await this.options.federation?.describeAsset(resolvedRef);
      return {
        status: 'resolved',
        entityId: request.entityId,
        assetRef: binding.assetRef,
        assetEntityId: resolvedRef.assetEntityId,
        resolvedKind: kind,
        fallback: request.preferredKind ? kind !== request.preferredKind : false,
        role: binding.role,
        files:
          federationSemantics?.files && federationSemantics.files.length > 0
            ? federationSemantics.files
            : buildResolvedRepresentationFiles(binding, resolvedRef, kind),
        capabilities: mergeCapabilities(
          resolvedRef.capabilities,
          federationSemantics?.capabilities,
        ),
      };
    }

    return {
      status: 'missing-representation',
      entityId: request.entityId,
      missingKinds: order,
      suggestedActions: ['generate', 'import', 'bind-existing', 'dismiss'],
    };
  }
}

function getRepresentationFallbackOrder(
  request: RepresentationResolveRequest,
): readonly RepresentationKind[] {
  if (request.allowFallback === false && request.preferredKind) {
    return [request.preferredKind];
  }

  const baseOrder =
    request.fallbackOrder ??
    (request.preferredKind
      ? [
          request.preferredKind,
          ...DEFAULT_REPRESENTATION_FALLBACKS[request.target].filter(
            (kind) => kind !== request.preferredKind,
          ),
        ]
      : DEFAULT_REPRESENTATION_FALLBACKS[request.target]);

  return Array.from(new Set(baseOrder));
}

function pickBindingForKind(
  bindings: readonly EntityAssetBinding[],
  kind: RepresentationKind,
): EntityAssetBinding | undefined {
  const roleBindings = bindings.filter((binding) => binding.role === kind);
  return roleBindings.find((binding) => binding.isDefault) ?? roleBindings[0];
}

function buildResolvedRepresentationFiles(
  binding: EntityAssetBinding,
  resolvedRef: ResolvedAssetRef,
  kind: RepresentationKind,
): readonly ResolvedRepresentationFile[] {
  return [
    {
      role: kind === 'voice' ? 'voice' : kind === 'motion' ? 'motion' : 'main',
      assetRef: binding.assetRef,
      path: resolvedRef.localPath,
      mediaType: kind,
    },
  ];
}

function mergeCapabilities(
  ...capabilityGroups: Array<readonly string[] | undefined>
): readonly string[] {
  return Array.from(new Set(capabilityGroups.flatMap((group) => group ?? []))).sort();
}

export function representationKindToBindingRole(
  kind: RepresentationKind,
): EntityAssetBindingRole | undefined {
  switch (kind) {
    case 'portrait':
    case 'reference':
    case 'live2d':
    case 'live3d':
    case 'voice':
    case 'motion':
      return kind;
    case 'video':
      return 'motion';
  }
}
