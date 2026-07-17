import type {
  EntityAssetRequirement,
  EntityAssetRequirementSource,
  RepresentationKind,
  VisualIdentityDraft,
  VisualIdentityDraftSource,
} from '../types/creative-entity-asset-composition';
import type { GeneratedAsset } from '../types/generated-asset';

export type GeneratedMediaLineageAsset = Pick<
  GeneratedAsset,
  'id' | 'type' | 'prompt' | 'sourceNodeId' | 'characterIds'
>;

export interface BuildVisualIdentityDraftsFromGeneratedMediaInput {
  readonly assets: readonly GeneratedMediaLineageAsset[];
  readonly source: VisualIdentityDraftSource;
}

export interface BuildEntityAssetRequirementsFromGeneratedMediaInput {
  readonly assets: readonly GeneratedMediaLineageAsset[];
  readonly source: EntityAssetRequirementSource;
  readonly requiredKinds: readonly RepresentationKind[];
}

interface CharacterLineageGroup {
  readonly characterId: string;
  readonly sourceRef: string;
  readonly assetIds: string[];
  readonly prompts: string[];
}

export function buildVisualIdentityDraftsFromGeneratedMediaLineage(
  input: BuildVisualIdentityDraftsFromGeneratedMediaInput,
): readonly VisualIdentityDraft[] {
  return groupGeneratedAssetsByCharacter(
    input.assets.filter((asset) => asset.type === 'generated-image'),
  )
    .map(
      (group): VisualIdentityDraft => ({
        id: buildLineageId('visual-draft', input.source, group.characterId, group.sourceRef),
        characterId: group.characterId,
        source: input.source,
        prompt: group.prompts[0] ?? '',
        generatedAssetIds: group.assetIds,
        status: 'drafting',
      }),
    )
    .sort(compareVisualDrafts);
}

export function buildEntityAssetRequirementsFromGeneratedMediaLineage(
  input: BuildEntityAssetRequirementsFromGeneratedMediaInput,
): readonly EntityAssetRequirement[] {
  if (input.requiredKinds.length === 0) {
    return [];
  }

  return groupGeneratedAssetsByCharacter(input.assets)
    .map(
      (group): EntityAssetRequirement => ({
        id: buildLineageId('asset-requirement', input.source, group.characterId, group.sourceRef),
        entityId: group.characterId,
        entityKind: 'character',
        source: input.source,
        sourceRef: group.sourceRef,
        requiredKinds: input.requiredKinds,
        status: 'generated',
      }),
    )
    .sort(compareRequirements);
}

function groupGeneratedAssetsByCharacter(
  assets: readonly GeneratedMediaLineageAsset[],
): readonly CharacterLineageGroup[] {
  const groups = new Map<string, CharacterLineageGroup>();

  for (const asset of assets) {
    if (!asset.characterIds?.length) {
      continue;
    }

    const sourceRef = buildGeneratedMediaSourceRef(asset);
    for (const characterId of uniqueStrings(asset.characterIds)) {
      const key = `${characterId}\n${sourceRef}`;
      const current = groups.get(key);
      if (current) {
        current.assetIds.push(asset.id);
        if (asset.prompt) {
          current.prompts.push(asset.prompt);
        }
        continue;
      }

      groups.set(key, {
        characterId,
        sourceRef,
        assetIds: [asset.id],
        prompts: asset.prompt ? [asset.prompt] : [],
      });
    }
  }

  return [...groups.values()];
}

function buildGeneratedMediaSourceRef(asset: GeneratedMediaLineageAsset): string {
  return asset.sourceNodeId
    ? `canvas://node/${asset.sourceNodeId}`
    : `generated://asset/${asset.id}`;
}

function buildLineageId(
  prefix: string,
  source: string,
  characterId: string,
  sourceRef: string,
): string {
  return `${prefix}:${source}:${stableIdPart(characterId)}:${stableIdPart(sourceRef)}`;
}

function stableIdPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]+/g, '-');
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function compareVisualDrafts(a: VisualIdentityDraft, b: VisualIdentityDraft): number {
  return a.characterId.localeCompare(b.characterId) || a.id.localeCompare(b.id);
}

function compareRequirements(a: EntityAssetRequirement, b: EntityAssetRequirement): number {
  return (
    a.entityId.localeCompare(b.entityId) ||
    a.sourceRef.localeCompare(b.sourceRef) ||
    a.id.localeCompare(b.id)
  );
}
