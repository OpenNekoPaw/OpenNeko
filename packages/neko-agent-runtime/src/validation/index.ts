/**
 * Validation Module
 *
 * Provides standalone input/output validators for owning runtime boundaries.
 *
 * @example
 * ```typescript
 * import {
 *   createImageValidator,
 *   createOutputValidator,
 * } from '@neko-agent/runtime';
 *
 * const imageValidator = createImageValidator();
 * const outputValidator = createOutputValidator({ mermaidPreValidate: true });
 * ```
 */

// Types
export type {
  ImageConstraints,
  OutputConstraints,
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
