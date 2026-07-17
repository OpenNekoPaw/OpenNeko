/**
 * Validation Module
 *
 * Provides input/output validation for LLM interactions
 *
 * @example
 * ```typescript
 * import {
 *   createValidationHooks,
 *   createImageValidator,
 *   createOutputValidator,
 * } from '@neko/agent';
 *
 * // Create validation hooks for agent executor
 * const hooks = createValidationHooks({
 *   imageConstraints: {
 *     maxSizeBytes: 5 * 1024 * 1024,
 *     allowedFormats: ['image/jpeg', 'image/png'],
 *   },
 *   outputConstraints: {
 *     mermaidPreValidate: true,
 *   },
 * });
 *
 * // Or use validators directly
 * const imageValidator = createImageValidator();
 * const outputValidator = createOutputValidator({ mermaidPreValidate: true });
 * ```
 */

// Types
export type {
  ImageConstraints,
  OutputConstraints,
  ValidationHooksOptions,
  ValidationError,
  ValidationWarning,
  ValidationResult,
  ValidationErrorType,
  ImageInfo,
  MermaidValidationResult,
  MermaidBlockInfo,
  MermaidBlockValidationResult,
  JsonBlockInfo,
  JsonBlockValidationResult,
  ValidationResultWithBlocks,
} from './types';

// Constants
export { DEFAULT_IMAGE_CONSTRAINTS, DEFAULT_OUTPUT_CONSTRAINTS } from './types';

// Image Validator
export { ImageValidator, ImageValidationError, createImageValidator } from './image-validator';

// Output Validator
export { OutputValidator, createOutputValidator } from './output-validator';

// Validation Hooks
export { ValidationHooks, createValidationHooks } from './validation-hooks';

// Re-export specialized components for advanced usage
export {
  MermaidExtractor,
  createMermaidExtractor,
  MermaidValidator,
  createMermaidValidator,
  MermaidBlockChecker,
  createMermaidBlockChecker,
} from './mermaid-validator';
export type {
  IMermaidExtractor,
  IMermaidValidator,
  IMermaidBlockChecker,
  UnclosedBlockPosition,
} from './mermaid-validator';
export {
  JsonExtractor,
  createJsonExtractor,
  JsonSchemaValidator,
  createJsonSchemaValidator,
  validateJsonAgainstSchema,
} from './json-validator';
export type {
  IJsonExtractor,
  IJsonSchemaValidator,
  JsonSchemaValidationResult,
} from './json-validator';
export { LengthValidator, createLengthValidator } from './length-validator';
export type { ILengthValidator, LengthValidationOptions } from './length-validator';
