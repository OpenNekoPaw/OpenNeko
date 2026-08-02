// =============================================================================
// NKC Format SDK — Public API
// =============================================================================

export { loadNkc, saveNkc, isValidNkc } from './codec';
export type { NkcLoadResult, NkcSaveOptions } from './codec';
export { validateNkc } from './validator';
export type { NkcValidateOptions } from './validator';
export { validateNkcLayered } from './layered-validator';
export type { NkcLayeredValidateOptions } from './layered-validator';
export {
  CURRENT_NKC_VERSION,
  detectNkcVersion,
  migrateNkc,
  migrateNkcV1ToV2,
  migrateNkcV2ToV2_1,
} from './migrator';
export type { NkcMigrationResult, NkcMigrationStep, NkcVersion } from './migrator';
export {
  CANVAS_MATERIAL_LEGACY_EVIDENCE_KINDS,
  inspectLegacyCanvasMaterialNodes,
  migrateCanvasMaterialNodes,
} from './canvas-material-migration';
export type {
  CanvasMaterialDocumentMigrationResult,
  CanvasMaterialLegacyEvidenceKind,
  CanvasMaterialLegacyInspection,
  CanvasMaterialLegacyInspectionStatus,
} from './canvas-material-migration';
