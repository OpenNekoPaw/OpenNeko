import type { AssetManifest, BundleType } from './asset/manifest';
import type { CharacterRecordStatus } from './character-registry';
import type { CharacterAssetDimension, CharacterAssetMediaKind } from './media-import';
import type {
  CreativeEntityKind,
  EntityAssetBindingRole,
} from './creative-entity-asset-composition';

// =============================================================================
// Character Asset Export Contracts
// =============================================================================

export type CharacterAssetExportFormat = 'nkentity' | 'character-pack';

export interface CharacterAssetExportedFile {
  readonly path: string;
  readonly role:
    | 'manifest'
    | 'entity'
    | 'model'
    | 'texture'
    | 'motion'
    | 'config'
    | 'source'
    | 'asset'
    | 'spine-json'
    | 'spritesheet'
    | 'diagnostic';
  readonly mediaKind?: CharacterAssetMediaKind;
  readonly dimension?: CharacterAssetDimension;
}

export interface CharacterAssetExportResult {
  readonly format: CharacterAssetExportFormat;
  readonly outputPath: string;
  readonly manifest?: AssetManifest;
  readonly files: readonly CharacterAssetExportedFile[];
  readonly diagnostics?: readonly string[];
}

export interface NkEntitySummary {
  readonly id?: string;
  readonly kind: CreativeEntityKind;
  readonly name: string;
  readonly canonicalName?: string;
  readonly aliases?: readonly string[];
  readonly status?: CharacterRecordStatus;
  readonly description?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface NkEntityBinding {
  readonly role: EntityAssetBindingRole;
  readonly ref: string;
  readonly mediaKind: CharacterAssetMediaKind;
  readonly dimension: CharacterAssetDimension;
  readonly assetEntityId?: string;
  readonly bindingId?: string;
  readonly optional?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export type NkEntityArtifactMetadata = Record<string, unknown>;

interface NkEntityArtifactBase {
  readonly format: 'nkentity';
  readonly entity: NkEntitySummary;
  readonly bindings: readonly NkEntityBinding[];
  readonly exportedAt: string;
  readonly metadata?: NkEntityArtifactMetadata;
}

export interface NkEntityArtifactV1 extends NkEntityArtifactBase {
  readonly version: 1;
}

export type NkEntityArtifact = NkEntityArtifactV1;

export interface NkEntityExportRequest {
  readonly projectRoot: string;
  readonly outputPath: string;
  readonly entityId?: string;
  readonly characterName?: string;
  readonly name?: string;
}

export interface CharacterPackExportRequest extends NkEntityExportRequest {
  readonly bundleId?: string;
  readonly version?: string;
}

export interface CharacterPackExportResult extends CharacterAssetExportResult {
  readonly format: 'character-pack';
  readonly entity: NkEntityArtifact;
  readonly bundleType: Extract<BundleType, 'character-pack'>;
}

export function isNkEntityArtifact(value: unknown): value is NkEntityArtifact {
  if (!isRecord(value)) return false;

  return (
    value['format'] === 'nkentity' &&
    value['version'] === 1 &&
    isNkEntitySummary(value['entity']) &&
    Array.isArray(value['bindings']) &&
    value['bindings'].every((binding) => isNkEntityBinding(binding)) &&
    typeof value['exportedAt'] === 'string' &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

function isNkEntitySummary(value: unknown): value is NkEntitySummary {
  if (!isRecord(value)) return false;
  return (
    (value['id'] === undefined || typeof value['id'] === 'string') &&
    isCreativeEntityKindValue(value['kind']) &&
    typeof value['name'] === 'string' &&
    (value['canonicalName'] === undefined || typeof value['canonicalName'] === 'string') &&
    (value['aliases'] === undefined ||
      (Array.isArray(value['aliases']) &&
        value['aliases'].every((alias) => typeof alias === 'string'))) &&
    (value['status'] === undefined || isCharacterRecordStatusValue(value['status'])) &&
    (value['description'] === undefined || typeof value['description'] === 'string') &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

function isNkEntityBinding(value: unknown): value is NkEntityBinding {
  if (!isRecord(value)) return false;
  return (
    isEntityAssetBindingRoleValue(value['role']) &&
    typeof value['ref'] === 'string' &&
    isCharacterAssetMediaKindValue(value['mediaKind']) &&
    isCharacterAssetDimensionValue(value['dimension']) &&
    (value['assetEntityId'] === undefined || typeof value['assetEntityId'] === 'string') &&
    (value['bindingId'] === undefined || typeof value['bindingId'] === 'string') &&
    (value['optional'] === undefined || typeof value['optional'] === 'boolean') &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

function isCreativeEntityKindValue(value: unknown): value is CreativeEntityKind {
  return (
    value === 'character' ||
    value === 'scene' ||
    value === 'object' ||
    value === 'location' ||
    value === 'style'
  );
}

function isCharacterRecordStatusValue(value: unknown): value is CharacterRecordStatus {
  return value === 'confirmed' || value === 'candidate' || value === 'deprecated';
}

function isEntityAssetBindingRoleValue(value: unknown): value is EntityAssetBindingRole {
  return (
    value === 'portrait' ||
    value === 'reference' ||
    value === 'puppet-bone' ||
    value === 'live2d' ||
    value === 'live3d' ||
    value === 'voice' ||
    value === 'motion' ||
    value === 'style'
  );
}

function isCharacterAssetMediaKindValue(value: unknown): value is CharacterAssetMediaKind {
  return (
    value === 'live2d-model' ||
    value === 'live2d-motion' ||
    value === 'live2d-config' ||
    value === 'model-3d' ||
    value === 'model-motion' ||
    value === 'model-config' ||
    value === 'voice-pack' ||
    value === 'character-pack'
  );
}

function isCharacterAssetDimensionValue(value: unknown): value is CharacterAssetDimension {
  return (
    value === 'model' ||
    value === 'motion' ||
    value === 'config' ||
    value === 'audio' ||
    value === 'text'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
