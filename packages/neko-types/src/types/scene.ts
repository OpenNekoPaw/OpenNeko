import type { EngineNkcCharacterFile, EngineNkcDataBlockManifest } from '../generated/scene.engine';

export type {
  EngineAudioStreamDescriptor as AudioStreamDescriptor,
  EngineBlendShape as BlendShape,
  EngineCharacterCommand as CharacterCommand,
  EngineCharacterCommandType as CharacterCommandType,
  EngineCharacterDataBlockRef as CharacterDataBlockRef,
  EngineCharacterDescriptor as CharacterDescriptor,
  EngineCharacterGeometry as CharacterGeometry,
  EngineCharacterOverrideEntry as CharacterOverrideEntry,
  EngineCharacterOverrideLayer as CharacterOverrideLayer,
  EngineCharacterOverrideOperation as CharacterOverrideOperation,
  EngineCharacterDefinition as CharacterDefinition,
  EngineCharacterRegionBinding as CharacterRegionBinding,
  EngineCharacterRegionBindingKind as CharacterRegionBindingKind,
  EngineCharacterRegionDescriptor as CharacterRegionDescriptor,
  EngineCharacterRegionDescriptorSet as CharacterRegionDescriptorSet,
  EngineEnvironmentMode as EnvironmentMode,
  EngineEnvironmentDiagnostic as EnvironmentDiagnostic,
  EngineEnvironmentPatch as EnvironmentPatch,
  EngineLightPatch as LightPatch,
  EngineLightShadowPatch as LightShadowPatch,
  EngineCharacterMigrationManifest as CharacterMigrationManifest,
  EngineMaterialSlot as MaterialSlot,
  EngineModelingSession as ModelingSession,
  EngineMorphDescriptor as MorphDescriptor,
  EngineNkcCharacterFile as NkcCharacterFile,
  EngineNkcDataBlockManifest as NkcDataBlockManifest,
  EngineNodeRemoveCommand as NodeRemoveCommand,
  EngineRenderFrameMeta as RenderFrameMeta,
  EngineRenderStreamDescriptor as RenderStreamDescriptor,
  EngineSceneCommand as SceneCommand,
  EngineSceneCommandAck as SceneCommandAck,
  EngineSceneCommandEnvelope as SceneCommandEnvelope,
  EngineSceneDelta as SceneDelta,
  EngineSceneSnapshot as SceneSnapshot,
  EngineSelectionHit as SelectionHit,
  EngineSelectionKind as SceneSelectionKind,
  EngineSelectionMode as SelectionMode,
  EngineSelectionQuery as SelectionQuery,
  EngineSelectionQueryResult as SelectionQueryResult,
  EngineSelectionTarget as SelectionTarget,
  EngineSkeletonDescriptor as SkeletonDescriptor,
  EngineSkinWeightAtlas as SkinWeightAtlas,
  EngineLayeredCharacterDescription as LayeredCharacterDescription,
  EngineTopologyChangeEvent as TopologyChangeEvent,
  EngineVertexBrushPatch as VertexBrushPatch,
  EngineViewportDescriptor as ViewportDescriptor,
  EngineViewportLookDevSettings as ViewportLookDevSettings,
  EngineViewportMaterialOverride as ViewportMaterialOverride,
  EngineViewportMaterialOverrideKind as ViewportMaterialOverrideKind,
  EngineViewportRenderMode as ViewportRenderMode,
} from '../generated/scene.engine';

export const CURRENT_CHARACTER_SCHEMA_VERSION = 1;

export type CharacterSchemaCompatibilityStatus =
  'current' | 'unsupported-version' | 'unsupported-future';

export interface CharacterSchemaCompatibility {
  status: CharacterSchemaCompatibilityStatus;
  schemaVersion: number;
  currentSchemaVersion: number;
}

export function evaluateCharacterSchemaVersion(
  file: Pick<EngineNkcCharacterFile | EngineNkcDataBlockManifest, 'schemaVersion'>,
): CharacterSchemaCompatibility {
  const currentSchemaVersion = CURRENT_CHARACTER_SCHEMA_VERSION;
  const schemaVersion = file.schemaVersion;

  if (schemaVersion === currentSchemaVersion) {
    return { status: 'current', schemaVersion, currentSchemaVersion };
  }
  if (schemaVersion > currentSchemaVersion) {
    return { status: 'unsupported-future', schemaVersion, currentSchemaVersion };
  }

  return { status: 'unsupported-version', schemaVersion, currentSchemaVersion };
}

export function assertCharacterSchemaEditable(
  file: Pick<EngineNkcCharacterFile | EngineNkcDataBlockManifest, 'schemaVersion'>,
): CharacterSchemaCompatibility {
  const compatibility = evaluateCharacterSchemaVersion(file);
  if (compatibility.status === 'unsupported-future') {
    throw new Error(
      `Character schema version ${compatibility.schemaVersion} requires runtime schema ${compatibility.currentSchemaVersion} or newer`,
    );
  }
  if (compatibility.status === 'unsupported-version') {
    throw new Error(`Character schema version ${compatibility.schemaVersion} is not supported`);
  }
  return compatibility;
}
