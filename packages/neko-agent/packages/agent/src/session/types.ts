/** Host-neutral session control types. */

export type { ValidationError, ValidationWarning } from '../validation/types';
export type { ToolConfirmationRequest, PermissionMode } from '../permission/types';

export type ExecutionMode = 'plan' | 'ask' | 'auto';

export interface CompressionResult {
  readonly originalTokens: number;
  readonly compressedTokens: number;
  readonly ratio: number;
}
