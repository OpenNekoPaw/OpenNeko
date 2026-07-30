/**
 * Schema Validator — Lightweight JSON Schema subset validator
 *
 * Validates tool arguments against their parameter schema before execution.
 * Returns structured errors that LLMs can use to self-correct on retry.
 *
 * Supports: type, required, enum, minimum, maximum, minLength, pattern,
 * nested object/array properties, and anyOf.
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
    const min = typeof prop.minimum === 'number' ? prop.minimum : undefined;
    const max = typeof prop.maximum === 'number' ? prop.maximum : undefined;
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

  if (typeof value === 'string' && typeof prop.minLength === 'number') {
    if (value.length < prop.minLength) {
      errors.push({
        field,
        expected: `length >= ${prop.minLength}`,
        actual: value,
        message: `Field "${field}" must have length >= ${prop.minLength}`,
      });
    }
  }

  // Pattern check (strings only)
  if (typeof value === 'string' && prop.pattern) {
    const pattern = typeof prop.pattern === 'string' ? prop.pattern : undefined;
    if (!pattern) return errors;
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

  if (isRecord(value)) {
    errors.push(...validateObject(field, value, prop));
  }

  if (Array.isArray(value) && isToolParameterProperty(prop.items)) {
    for (let index = 0; index < value.length; index++) {
      errors.push(...validateProperty(`${field}[${index}]`, value[index], prop.items));
    }
  }

  const branches = readSchemaBranches(prop.anyOf);
  if (branches.length > 0) {
    const branchErrors = branches.map((branch) => validateProperty(field, value, branch));
    if (!branchErrors.some((candidate) => candidate.length === 0)) {
      const closest = branchErrors.reduce((best, candidate) =>
        candidate.length < best.length ? candidate : best,
      );
      errors.push(...closest);
    }
  }

  return errors;
}

function validateObject(
  field: string,
  value: Record<string, unknown>,
  prop: ToolParameterProperty,
): ToolValidationError[] {
  const errors: ToolValidationError[] = [];
  for (const requiredField of prop.required ?? []) {
    if (value[requiredField] === undefined || value[requiredField] === null) {
      const nestedField = joinField(field, requiredField);
      errors.push({
        field: nestedField,
        expected: 'required field',
        actual: undefined,
        message: `Missing required field: "${nestedField}"`,
      });
    }
  }

  for (const [name, nestedValue] of Object.entries(value)) {
    const nestedSchema = prop.properties?.[name];
    if (!nestedSchema) {
      if (prop.additionalProperties === false) {
        const nestedField = joinField(field, name);
        errors.push({
          field: nestedField,
          expected: 'declared field',
          actual: nestedValue,
          message: `Unknown field: "${nestedField}"`,
        });
      }
      continue;
    }
    errors.push(...validateProperty(joinField(field, name), nestedValue, nestedSchema));
  }
  return errors;
}

function joinField(parent: string, child: string): string {
  return parent ? `${parent}.${child}` : child;
}

function readSchemaBranches(value: unknown): ToolParameterProperty[] {
  return Array.isArray(value) ? value.filter(isToolParameterProperty) : [];
}

function isToolParameterProperty(value: unknown): value is ToolParameterProperty {
  return isRecord(value) && isToolParameterType(value['type']);
}

function isToolParameterType(value: unknown): value is ToolParameterProperty['type'] {
  return (
    value === 'string' ||
    value === 'number' ||
    value === 'integer' ||
    value === 'boolean' ||
    value === 'array' ||
    value === 'object'
  );
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
