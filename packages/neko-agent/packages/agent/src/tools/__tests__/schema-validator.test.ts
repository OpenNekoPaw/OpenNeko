/**
 * Tests for schema-validator — lightweight JSON Schema subset validation
 */

import { describe, it, expect } from 'vitest';
import { validateSchema, formatValidationErrors } from '../schema-validator';
import type { ToolParameters } from '@neko/shared';

const baseSchema: ToolParameters = {
  type: 'object',
  properties: {
    prompt: { type: 'string', description: 'Text prompt' },
    count: { type: 'number', description: 'Count' },
    duration: { type: 'integer', description: 'Duration in seconds' },
    verbose: { type: 'boolean', description: 'Verbose mode' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
  },
  required: ['prompt'],
};

describe('validateSchema', () => {
  // --- Required fields ---

  it('should pass valid args', () => {
    const errors = validateSchema({ prompt: 'hello' }, baseSchema);
    expect(errors).toHaveLength(0);
  });

  it('should fail missing required field', () => {
    const errors = validateSchema({}, baseSchema);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('prompt');
    expect(errors[0]!.message).toContain('Missing required');
  });

  it('should fail null required field', () => {
    const errors = validateSchema({ prompt: null }, baseSchema);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('prompt');
  });

  // --- Type checks ---

  it('should fail wrong type: string expected, number given', () => {
    const errors = validateSchema({ prompt: 123 }, baseSchema);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('prompt');
    expect(errors[0]!.message).toContain('expected type "string"');
  });

  it('should fail wrong type: number expected, string given', () => {
    const errors = validateSchema({ prompt: 'ok', count: '10' }, baseSchema);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('count');
    expect(errors[0]!.message).toContain('expected type "number"');
  });

  it('should fail integer type with float', () => {
    const errors = validateSchema({ prompt: 'ok', duration: 3.5 }, baseSchema);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('duration');
    expect(errors[0]!.message).toContain('expected type "integer"');
  });

  it('should pass integer type with whole number', () => {
    const errors = validateSchema({ prompt: 'ok', duration: 10 }, baseSchema);
    expect(errors).toHaveLength(0);
  });

  it('should fail boolean type with string', () => {
    const errors = validateSchema({ prompt: 'ok', verbose: 'true' }, baseSchema);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('verbose');
  });

  it('should fail NaN for number type', () => {
    const errors = validateSchema({ prompt: 'ok', count: NaN }, baseSchema);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('count');
  });

  // --- Enum ---

  it('should fail invalid enum value', () => {
    const schema: ToolParameters = {
      type: 'object',
      properties: {
        quality: { type: 'string', enum: ['standard', 'hd'] },
      },
    };
    const errors = validateSchema({ quality: 'ultra' }, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('one of [standard, hd]');
  });

  it('should pass valid enum value', () => {
    const schema: ToolParameters = {
      type: 'object',
      properties: {
        quality: { type: 'string', enum: ['standard', 'hd'] },
      },
    };
    const errors = validateSchema({ quality: 'hd' }, schema);
    expect(errors).toHaveLength(0);
  });

  it('should pass valid numeric enum value', () => {
    const schema: ToolParameters = {
      type: 'object',
      properties: {
        fps: { type: 'number', enum: [24, 30, 60] },
      },
    };
    const errors = validateSchema({ fps: 24 }, schema);
    expect(errors).toHaveLength(0);
  });

  // --- Numeric range ---

  it('should fail below minimum', () => {
    const schema: ToolParameters = {
      type: 'object',
      properties: {
        duration: { type: 'number', minimum: 1, maximum: 30 },
      },
    };
    const errors = validateSchema({ duration: 0 }, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('>= 1');
  });

  it('should fail above maximum', () => {
    const schema: ToolParameters = {
      type: 'object',
      properties: {
        duration: { type: 'number', minimum: 1, maximum: 30 },
      },
    };
    const errors = validateSchema({ duration: 50 }, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('<= 30');
  });

  it('should pass within range', () => {
    const schema: ToolParameters = {
      type: 'object',
      properties: {
        duration: { type: 'number', minimum: 1, maximum: 30 },
      },
    };
    const errors = validateSchema({ duration: 15 }, schema);
    expect(errors).toHaveLength(0);
  });

  // --- Pattern ---

  it('should fail pattern mismatch', () => {
    const schema: ToolParameters = {
      type: 'object',
      properties: {
        size: { type: 'string', pattern: '^\\d+x\\d+$' },
      },
    };
    const errors = validateSchema({ size: 'large' }, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('match pattern');
  });

  it('should pass pattern match', () => {
    const schema: ToolParameters = {
      type: 'object',
      properties: {
        size: { type: 'string', pattern: '^\\d+x\\d+$' },
      },
    };
    const errors = validateSchema({ size: '1024x768' }, schema);
    expect(errors).toHaveLength(0);
  });

  // --- Array items ---

  it('should fail array with wrong item type', () => {
    const errors = validateSchema({ prompt: 'ok', tags: ['a', 123, 'b'] }, baseSchema);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('tags[1]');
  });

  it('should pass array with correct item types', () => {
    const errors = validateSchema({ prompt: 'ok', tags: ['a', 'b', 'c'] }, baseSchema);
    expect(errors).toHaveLength(0);
  });

  // --- Extra fields ---

  it('should allow extra fields not in schema', () => {
    const errors = validateSchema({ prompt: 'ok', extra: 42 }, baseSchema);
    expect(errors).toHaveLength(0);
  });

  it('should reject extra fields when additional properties are disabled', () => {
    const errors = validateSchema(
      { prompt: 'ok', extra: 42 },
      { ...baseSchema, additionalProperties: false },
    );

    expect(errors).toEqual([
      expect.objectContaining({
        field: 'extra',
        expected: 'declared field',
        message: 'Unknown field: "extra"',
      }),
    ]);
  });

  // --- Multiple errors ---

  it('should collect multiple errors', () => {
    const errors = validateSchema({ count: 'bad', duration: 3.5 }, baseSchema);
    expect(errors.length).toBeGreaterThanOrEqual(2); // missing prompt + wrong type
  });
});

describe('formatValidationErrors', () => {
  it('should format errors into LLM-readable text', () => {
    const errors = [
      {
        field: 'prompt',
        expected: 'required field',
        actual: undefined,
        message: 'Missing required field: "prompt"',
      },
      {
        field: 'count',
        expected: 'type "number"',
        actual: 'abc',
        message: 'Field "count" expected type "number", got string',
      },
    ];
    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('Parameter validation failed');
    expect(formatted).toContain('Missing required field: "prompt"');
    expect(formatted).toContain('Please fix the above errors and retry');
  });
});
