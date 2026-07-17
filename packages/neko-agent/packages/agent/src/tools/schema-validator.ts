/**
 * Schema Validator — Lightweight JSON Schema subset validator
 *
 * Validates tool arguments against their parameter schema before execution.
 * Returns structured errors that LLMs can use to self-correct on retry.
 *
 * Supports: type, required, enum, minimum, maximum, pattern, items.type, items.required
 * Does NOT depend on Zod to keep @neko/agent lightweight.
 */

import type { ToolValidationError, ToolParameters, ToolParameterProperty } from '@neko/shared';

/**
 * Validate args against a ToolParameters schema.
 * Returns empty array if valid.
 */
export function validateSchema(
  args: Record<string, unknown>,
  schema: ToolParameters,
): ToolValidationError[] {
  const errors: ToolValidationError[] = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (args[field] === undefined || args[field] === null) {
        errors.push({
          field,
          expected: 'required field',
          actual: undefined,
          message: `Missing required field: "${field}"`,
        });
      }
    }
  }

  // Validate each provided field against its property schema
  for (const [field, value] of Object.entries(args)) {
    const prop = schema.properties[field];
    if (!prop) {
      if (schema.additionalProperties === false) {
        errors.push({
          field,
          expected: 'declared field',
          actual: value,
          message: `Unknown field: "${field}"`,
        });
      }
      continue;
    }

    const fieldErrors = validateProperty(field, value, prop);
    errors.push(...fieldErrors);
  }

  return errors;
}

/**
 * Validate a single property value against its schema definition.
 */
function validateProperty(
  field: string,
  value: unknown,
  prop: ToolParameterProperty,
): ToolValidationError[] {
  const errors: ToolValidationError[] = [];

  if (value === undefined || value === null) {
    return errors; // null/undefined checked by required
  }

  // Type check
  if (!checkType(value, prop.type)) {
    errors.push({
      field,
      expected: `type "${prop.type}"`,
      actual: value,
      message: `Field "${field}" expected type "${prop.type}", got ${typeof value}`,
    });
    return errors; // skip further checks if type is wrong
  }

  // Enum check
  if (prop.enum && !prop.enum.some((candidate) => candidate === value)) {
    errors.push({
      field,
      expected: `one of [${prop.enum.join(', ')}]`,
      actual: value,
      message: `Field "${field}" must be one of [${prop.enum.join(', ')}], got "${String(value)}"`,
    });
  }

  // Numeric range checks
  if (typeof value === 'number') {
    const min = prop.minimum as number | undefined;
    const max = prop.maximum as number | undefined;
    if (min !== undefined && value < min) {
      errors.push({
        field,
        expected: `>= ${min}`,
        actual: value,
        message: `Field "${field}" must be >= ${min}, got ${value}`,
      });
    }
    if (max !== undefined && value > max) {
      errors.push({
        field,
        expected: `<= ${max}`,
        actual: value,
        message: `Field "${field}" must be <= ${max}, got ${value}`,
      });
    }
  }

  // Pattern check (strings only)
  if (typeof value === 'string' && prop.pattern) {
    const pattern = prop.pattern as string;
    try {
      if (!new RegExp(pattern).test(value)) {
        errors.push({
          field,
          expected: `match pattern /${pattern}/`,
          actual: value,
          message: `Field "${field}" must match pattern /${pattern}/`,
        });
      }
    } catch {
      // Invalid regex in schema, skip
    }
  }

  // Array items type check
  if (Array.isArray(value) && prop.items) {
    const itemSchema = prop.items as { type?: string; required?: readonly string[] };
    const itemType = itemSchema.type;
    if (itemType) {
      for (let i = 0; i < value.length; i++) {
        if (!checkType(value[i], itemType)) {
          errors.push({
            field: `${field}[${i}]`,
            expected: `item type "${itemType}"`,
            actual: value[i],
            message: `Field "${field}[${i}]" expected type "${itemType}", got ${typeof value[i]}`,
          });
          continue;
        }
        if (itemType === 'object' && itemSchema.required && isRecord(value[i])) {
          for (const requiredField of itemSchema.required) {
            if (value[i][requiredField] === undefined || value[i][requiredField] === null) {
              errors.push({
                field: `${field}[${i}].${requiredField}`,
                expected: 'required field',
                actual: undefined,
                message: `Missing required field: "${field}[${i}].${requiredField}"`,
              });
            }
          }
        }
      }
    }
  }

  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a value matches a JSON Schema type string.
 */
function checkType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true; // unknown type → pass
  }
}

/**
 * Format validation errors into an LLM-readable string.
 * Includes expected format hints so the LLM can self-correct.
 */
export function formatValidationErrors(errors: ToolValidationError[]): string {
  const lines = errors.map((e) => `- ${e.message}`);
  return `Parameter validation failed:\n${lines.join('\n')}\n\nPlease fix the above errors and retry.`;
}
