/**
 * JSON Validation Module
 *
 * Extraction of JSON blocks and schema validation using ajv.
 */

import type { JsonBlockInfo, ValidationError, ValidationWarning, ValidationResult } from './types';

// =============================================================================
// Extractor
// =============================================================================

/**
 * JSON block extractor interface
 */
export interface IJsonExtractor {
  /** Extract JSON blocks with position info */
  extractWithPosition(content: string): JsonBlockInfo[];
  /** Extract first valid JSON from content */
  extractFirst(content: string): unknown | null;
}

/**
 * JSON block extractor implementation
 */
export class JsonExtractor implements IJsonExtractor {
  extractWithPosition(content: string): JsonBlockInfo[] {
    const blocks: JsonBlockInfo[] = [];

    // Pattern 1: JSON in code blocks (```json ... ```)
    const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const fullMatch = match[0];
      const innerContent = match[1]?.trim() || '';
      const startIndex = match.index;
      const endIndex = match.index + fullMatch.length;

      let parsed: unknown;
      try {
        parsed = JSON.parse(innerContent);
      } catch {
        continue;
      }

      const beforeContent = content.substring(0, startIndex);
      const lineStart = (beforeContent.match(/\n/g) || []).length + 1;
      const blockLines = (fullMatch.match(/\n/g) || []).length;
      const lineEnd = lineStart + blockLines;

      blocks.push({
        content: innerContent,
        parsed,
        startIndex,
        endIndex,
        lineStart,
        lineEnd,
        inCodeBlock: true,
      });
    }

    // Pattern 2: Raw JSON objects/arrays (if no code blocks found)
    if (blocks.length === 0) {
      const rawJsonRegex = /(\{[\s\S]*?\}|\[[\s\S]*?\])/g;
      while ((match = rawJsonRegex.exec(content)) !== null) {
        const jsonStr = match[1] || '';
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        const startIndex = match.index;
        const endIndex = match.index + jsonStr.length;
        const beforeContent = content.substring(0, startIndex);
        const lineStart = (beforeContent.match(/\n/g) || []).length + 1;
        const blockLines = (jsonStr.match(/\n/g) || []).length;
        const lineEnd = lineStart + blockLines;

        blocks.push({
          content: jsonStr,
          parsed,
          startIndex,
          endIndex,
          lineStart,
          lineEnd,
          inCodeBlock: false,
        });
      }
    }

    return blocks;
  }

  extractFirst(content: string): unknown | null {
    const jsonBlockMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)```/);
    const jsonContent = jsonBlockMatch ? jsonBlockMatch[1]?.trim() : content.trim();

    if (!jsonContent) return null;

    try {
      return JSON.parse(jsonContent);
    } catch {
      const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch?.[1]) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}

/**
 * Create a JSON extractor instance
 */
export function createJsonExtractor(): IJsonExtractor {
  return new JsonExtractor();
}

// =============================================================================
// Schema Validator
// =============================================================================

/**
 * Ajv validate function type with errors property
 */
type AjvValidateFunction = {
  (data: unknown): boolean;
  errors?: Array<{ message?: string; instancePath?: string }> | null;
};

/**
 * Ajv module type for dynamic import
 */
type AjvModule = {
  default: new (options?: Record<string, unknown>) => {
    compile: (schema: object) => AjvValidateFunction;
  };
};

let ajvModule: AjvModule | null = null;
let ajvLoadFailed = false;

/**
 * JSON Schema validation result
 */
export interface JsonSchemaValidationResult {
  valid: boolean;
  errors?: Array<{ path: string; message: string }>;
}

/**
 * JSON Schema validator interface
 */
export interface IJsonSchemaValidator {
  validate(data: unknown, schema: object): Promise<JsonSchemaValidationResult>;
  isLibraryAvailable(): Promise<boolean>;
}

/**
 * JSON Schema validator implementation
 */
export class JsonSchemaValidator implements IJsonSchemaValidator {
  async validate(data: unknown, schema: object): Promise<JsonSchemaValidationResult> {
    const Ajv = await this.loadAjv();

    if (!Ajv) {
      return { valid: true };
    }

    try {
      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);
      const valid = validate(data);

      if (!valid && validate.errors) {
        const errors: Array<{ path: string; message: string }> = [];
        for (const err of validate.errors) {
          errors.push({
            path: err.instancePath || '/',
            message: err.message || 'Unknown error',
          });
        }
        return { valid: false, errors };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            path: '/',
            message: `Schema compilation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  async isLibraryAvailable(): Promise<boolean> {
    const ajv = await this.loadAjv();
    return ajv !== null;
  }

  private async loadAjv(): Promise<AjvModule['default'] | null> {
    if (ajvLoadFailed) return null;
    if (ajvModule) return ajvModule.default;

    try {
      ajvModule = (await import('ajv')) as AjvModule;
      return ajvModule.default;
    } catch {
      ajvLoadFailed = true;
      return null;
    }
  }
}

/**
 * Validate JSON content against schema, returning ValidationResult format
 */
export async function validateJsonAgainstSchema(
  content: unknown,
  schema: object,
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const validator = new JsonSchemaValidator();
  const isAvailable = await validator.isLibraryAvailable();

  if (!isAvailable) {
    warnings.push({
      type: 'schema',
      code: 'AJV_UNAVAILABLE',
      message: 'JSON Schema validation skipped: ajv library not available',
    });
    return { errors, warnings };
  }

  const result = await validator.validate(content, schema);

  if (!result.valid && result.errors) {
    for (const err of result.errors) {
      errors.push({
        type: 'schema',
        code: 'SCHEMA_VALIDATION_ERROR',
        message: `Schema validation failed: ${err.message}`,
        details: { path: err.path },
      });
    }
  }

  return { errors, warnings };
}

/**
 * Create a JSON schema validator instance
 */
export function createJsonSchemaValidator(): IJsonSchemaValidator {
  return new JsonSchemaValidator();
}
