/**
 * Length Validator
 *
 * Validates content length against constraints
 */

import type { ValidationWarning, ValidationResult } from './types';

/**
 * Length validation options
 */
export interface LengthValidationOptions {
  maxLength?: number;
}

/**
 * Length validator interface
 */
export interface ILengthValidator {
  /**
   * Validate content length
   */
  validate(content: string, options: LengthValidationOptions): ValidationResult;
}

/**
 * Length validator implementation
 */
export class LengthValidator implements ILengthValidator {
  /**
   * Validate content length
   */
  validate(content: string, options: LengthValidationOptions): ValidationResult {
    const warnings: ValidationWarning[] = [];

    if (options.maxLength !== undefined && content.length > options.maxLength) {
      warnings.push({
        type: 'output',
        code: 'LENGTH_EXCEEDED',
        message: `Output length ${content.length} exceeds maximum ${options.maxLength}`,
        suggestion: 'Consider reducing the output length or increasing the limit',
      });
    }

    return { errors: [], warnings };
  }
}

/**
 * Create a length validator instance
 */
export function createLengthValidator(): ILengthValidator {
  return new LengthValidator();
}
