import type {
  AssetEntity,
  AssetFile,
  AssetVariant,
  EntityAssetBinding,
  EntityAssetBindingRole,
  RepresentationFileRole,
  RepresentationKind,
  ResolvedRepresentationFile,
} from '@neko/shared';

export interface AssetBindingCandidate {
  readonly assetEntityId: string;
  readonly assetRef: string;
  readonly suggestedRoles: readonly EntityAssetBindingRole[];
  readonly confidence: number;
  readonly reason: string;
}

export interface RepresentationPackageDetail {
  readonly assetEntityId: string;
  readonly assetRef: string;
  readonly representationKinds: readonly RepresentationKind[];
  readonly files: readonly ResolvedRepresentationFile[];
  readonly capabilities: readonly string[];
  readonly missingRoles: readonly RepresentationFileRole[];
}

export interface CancelEntityBindingPlan {
  readonly kind: 'cancel-binding';
  readonly bindingId: string;
  readonly assetRef: string;
  readonly assetEntityId?: string;
  readonly deletesAsset: false;
}

export interface DeleteAssetPlan {
  readonly kind: 'delete-asset';
  readonly assetEntityId: string;
  readonly bindingIds: readonly string[];
  readonly deletesAsset: true;
}

export function buildAssetBindingCandidate(entity: AssetEntity): AssetBindingCandidate {
  const suggestedRoles = inferBindingRoles(entity);
  return {
    assetEntityId: entity.id,
    assetRef: toProjectAssetRef(entity.id),
    suggestedRoles,
    confidence: suggestedRoles.length > 0 ? 0.7 : 0.35,
    reason:
      suggestedRoles.length > 0
        ? `Matches ${suggestedRoles.join(', ')} representation signals`
        : 'No strong representation signal; user confirmation required',
  };
}

export function buildRepresentationPackageDetail(entity: AssetEntity): RepresentationPackageDetail {
  const representationKinds = inferRepresentationKinds(entity);
  const files = entity.variants.flatMap((variant) =>
    variant.files.map((file) => toResolvedRepresentationFile(entity.id, variant, file)),
  );
  const fileRoles = new Set(files.map((file) => file.role));

  return {
    assetEntityId: entity.id,
    assetRef: toProjectAssetRef(entity.id),
    representationKinds,
    files,
    capabilities: inferCapabilities(representationKinds, fileRoles),
    missingRoles: getMissingPackageRoles(representationKinds, fileRoles),
  };
}

export function buildCancelEntityBindingPlan(binding: EntityAssetBinding): CancelEntityBindingPlan {
  return {
    kind: 'cancel-binding',
    bindingId: binding.id,
    assetRef: binding.assetRef,
    assetEntityId: parseProjectAssetEntityId(binding.assetRef),
    deletesAsset: false,
  };
}

export function buildDeleteAssetPlan(
  entity: AssetEntity,
  bindings: readonly EntityAssetBinding[] = [],
): DeleteAssetPlan {
  return {
    kind: 'delete-asset',
    assetEntityId: entity.id,
    bindingIds: bindings
      .filter((binding) => parseProjectAssetEntityId(binding.assetRef) === entity.id)
      .map((binding) => binding.id)
      .sort(),
    deletesAsset: true,
  };
}

export function toProjectAssetRef(assetEntityId: string): string {
  return `project://assets/${encodeURIComponent(assetEntityId)}`;
}

export function parseProjectAssetEntityId(assetRef: string): string | undefined {
  const prefix = 'project://assets/';
  if (!assetRef.startsWith(prefix)) {
    return undefined;
  }

  const raw = assetRef.slice(prefix.length).split('?')[0];
  return raw ? decodeURIComponent(raw) : undefined;
}

function inferBindingRoles(entity: AssetEntity): readonly EntityAssetBindingRole[] {
  const roles = new Set<EntityAssetBindingRole>();
  for (const kind of inferRepresentationKinds(entity)) {
    if (kind !== 'video') {
      roles.add(kind);
    }
  }

  return [...roles].sort(compareBindingRoles);
}

function inferRepresentationKinds(entity: AssetEntity): readonly RepresentationKind[] {
  const kinds = new Set<RepresentationKind>();
  const tokens = collectEntityTokens(entity);

  if (tokens.some((token) => ['live2d', 'nkp', 'moc3', 'inp', 'inx'].includes(token))) {
    kinds.add('live2d');
  }
  if (tokens.some((token) => ['live3d', 'nkm', 'vrm', 'glb', 'gltf'].includes(token))) {
    kinds.add('live3d');
  }
  if (tokens.some((token) => ['voice', 'tts', 'speech', 'audio'].includes(token))) {
    kinds.add('voice');
  }
  if (tokens.some((token) => ['motion', 'animation', 'mocap'].includes(token))) {
    kinds.add('motion');
  }
  if (tokens.some((token) => ['reference', 'refsheet', 'reference-sheet'].includes(token))) {
    kinds.add('reference');
  }
  if (tokens.some((token) => ['portrait', 'avatar', 'headshot'].includes(token))) {
    kinds.add('portrait');
  }

  if (entity.variants.some((variant) => variant.files.some((file) => file.mediaType === 'video'))) {
    kinds.add('video');
  }
  if (entity.variants.some((variant) => variant.files.some((file) => file.mediaType === 'audio'))) {
    kinds.add('voice');
  }
  if (
    entity.category === 'character' &&
    entity.variants.some((variant) => variant.files.some((file) => file.mediaType === 'image'))
  ) {
    kinds.add(kinds.has('reference') ? 'reference' : 'portrait');
  }

  return [...kinds].sort(compareRepresentationKinds);
}

function collectEntityTokens(entity: AssetEntity): readonly string[] {
  const values = [
    entity.name,
    entity.description,
    ...entity.tags,
    ...(entity.aliases ?? []),
    ...entity.variants.flatMap((variant) => [
      variant.name,
      ...(variant.tags ?? []),
      ...variant.files.flatMap((file) => [file.name, file.path, file.purpose]),
    ]),
  ];

  return values
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
    .filter((value) => value.length > 0);
}

function toResolvedRepresentationFile(
  assetEntityId: string,
  variant: AssetVariant,
  file: AssetFile,
): ResolvedRepresentationFile {
  return {
    role: inferFileRole(file),
    assetRef: `${toProjectAssetRef(assetEntityId)}?variant=${encodeURIComponent(variant.id)}&file=${encodeURIComponent(file.id)}`,
    fileId: file.id,
    path: file.path,
    mediaType: file.mediaType,
  };
}

function inferFileRole(file: AssetFile): RepresentationFileRole {
  if (file.purpose === 'thumbnail') return 'thumbnail';
  if (file.purpose === 'texture') return 'texture';

  const lower = `${file.name} ${file.path}`.toLowerCase();
  if (lower.includes('physics')) return 'physics';
  if (lower.includes('expression') || lower.includes('exp3')) return 'expression';
  if (lower.includes('motion')) return 'motion';
  if (lower.includes('texture')) return 'texture';
  if (lower.includes('calibration')) return 'calibration';
  if (lower.includes('tracking')) return 'tracking-profile';
  if (lower.endsWith('.moc3') || lower.endsWith('.vrm') || lower.endsWith('.glb')) return 'model';
  if (file.purpose === 'reference') return 'source';
  if (file.purpose === 'source') return 'source';
  return file.purpose === 'main' ? 'main' : 'source';
}

function inferCapabilities(
  representationKinds: readonly RepresentationKind[],
  fileRoles: ReadonlySet<RepresentationFileRole>,
): readonly string[] {
  const capabilities = new Set<string>();
  if (representationKinds.includes('live2d')) {
    capabilities.add('live2d-runtime');
  }
  if (representationKinds.includes('live3d')) {
    capabilities.add('live3d-runtime');
  }
  if (representationKinds.includes('voice')) {
    capabilities.add('voice');
  }
  if (representationKinds.includes('motion')) {
    capabilities.add('motion');
  }
  if (fileRoles.has('expression')) {
    capabilities.add('expression');
  }
  if (fileRoles.has('tracking-profile') || fileRoles.has('calibration')) {
    capabilities.add('tracking');
  }
  return [...capabilities].sort();
}

function getMissingPackageRoles(
  representationKinds: readonly RepresentationKind[],
  fileRoles: ReadonlySet<RepresentationFileRole>,
): readonly RepresentationFileRole[] {
  const required = new Set<RepresentationFileRole>();
  if (representationKinds.includes('live2d')) {
    required.add('model');
    required.add('texture');
  }
  if (representationKinds.includes('live3d')) {
    required.add('model');
    required.add('material');
  }
  if (representationKinds.includes('voice')) {
    required.add('voice');
  }
  if (representationKinds.includes('motion')) {
    required.add('motion');
  }

  return [...required].filter((role) => !fileRoles.has(role)).sort();
}

function compareBindingRoles(a: EntityAssetBindingRole, b: EntityAssetBindingRole): number {
  return BINDING_ROLE_ORDER.indexOf(a) - BINDING_ROLE_ORDER.indexOf(b);
}

function compareRepresentationKinds(a: RepresentationKind, b: RepresentationKind): number {
  return REPRESENTATION_KIND_ORDER.indexOf(a) - REPRESENTATION_KIND_ORDER.indexOf(b);
}

const BINDING_ROLE_ORDER: readonly EntityAssetBindingRole[] = [
  'portrait',
  'reference',
  'live2d',
  'live3d',
  'voice',
  'motion',
  'style',
] as const;

const REPRESENTATION_KIND_ORDER: readonly RepresentationKind[] = [
  'portrait',
  'reference',
  'live2d',
  'live3d',
  'voice',
  'motion',
  'video',
] as const;
