// =============================================================================
// NKV Format SDK — Public API
// =============================================================================

export { loadNkv, saveNkv, isValidNkv } from './codec';
export { validateNkv, validateNkvProject } from './validator';
export { migrateNkv, detectNkvVersion } from './migrator';
export type {
  NkvVersion,
  NkvLoadResult,
  NkvSaveOptions,
  NkvValidateOptions,
  MigrationResult,
  ValidationResult,
  ValidationError,
} from './types';
export { CURRENT_NKV_VERSION } from './types';

// Operation history persistence
export { serializeHistory, deserializeHistory, saveHistory, loadHistory } from './history';
export type { OperationHistorySnapshot, SerializedOperation } from './history';
