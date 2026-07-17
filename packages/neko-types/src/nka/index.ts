// =============================================================================
// NKA Format SDK — Public API
// =============================================================================

export { loadNka, saveNka, isValidNka, CURRENT_NKA_VERSION, SUPPORTED_NKA_VERSIONS } from './codec';
export type {
  NkaCompatibilityMetadata,
  NkaCompatibilityMode,
  NkaLoadResult,
  NkaSaveOptions,
} from './codec';
export { validateNka } from './validator';
export type { NkaValidateOptions } from './validator';
