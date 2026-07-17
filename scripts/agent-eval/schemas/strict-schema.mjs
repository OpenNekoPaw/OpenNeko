export const schema = Object.freeze({
  anyJson: () => ({ type: 'any-json' }),
  boolean: () => ({ type: 'boolean' }),
  integer: (options = {}) => ({ type: 'integer', ...options }),
  number: (options = {}) => ({ type: 'number', ...options }),
  string: (options = {}) => ({ type: 'string', ...options }),
  literal: (value) => ({ type: 'literal', value }),
  enum: (values) => ({ type: 'enum', values }),
  array: (items, options = {}) => ({ type: 'array', items, ...options }),
  object: (required, optional = {}) => ({ type: 'object', required, optional }),
  union: (variants) => ({ type: 'union', variants }),
});

export function validateStrict(input, definition, label = 'value') {
  validateNode(input, definition, label);
  return input;
}

function validateNode(value, definition, path) {
  switch (definition.type) {
    case 'any-json':
      validateJson(value, path);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') fail(path, 'must be a boolean');
      return;
    case 'integer':
      if (!Number.isSafeInteger(value)) fail(path, 'must be a safe integer');
      validateNumberRange(value, definition, path);
      return;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be finite');
      validateNumberRange(value, definition, path);
      return;
    case 'string':
      validateString(value, definition, path);
      return;
    case 'literal':
      if (!Object.is(value, definition.value)) {
        fail(path, `must equal ${JSON.stringify(definition.value)}`);
      }
      return;
    case 'enum':
      if (!definition.values.includes(value)) {
        fail(path, `must be one of: ${definition.values.join(', ')}`);
      }
      return;
    case 'array':
      validateArray(value, definition, path);
      return;
    case 'object':
      validateObject(value, definition, path);
      return;
    case 'union':
      validateUnion(value, definition, path);
      return;
    default:
      throw new Error(`Unknown internal schema node: ${String(definition.type)}`);
  }
}

function validateString(value, definition, path) {
  if (typeof value !== 'string') fail(path, 'must be a string');
  if (definition.minLength !== undefined && value.length < definition.minLength) {
    fail(path, `must contain at least ${definition.minLength} character(s)`);
  }
  if (definition.maxLength !== undefined && value.length > definition.maxLength) {
    fail(path, `must contain at most ${definition.maxLength} character(s)`);
  }
  if (definition.pattern && !definition.pattern.test(value)) {
    fail(path, `does not match ${definition.pattern}`);
  }
  if (definition.format === 'relative-path') validateRelativePath(value, path);
  if (definition.format === 'timestamp' && !Number.isFinite(Date.parse(value))) {
    fail(path, 'must be an ISO timestamp');
  }
}

function validateRelativePath(value, path) {
  if (
    value.length === 0 ||
    value.startsWith('/') ||
    value.startsWith('~') ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    fail(path, 'must be a portable relative path');
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    fail(path, 'must not contain empty, dot, or traversal segments');
  }
}

function validateNumberRange(value, definition, path) {
  if (definition.min !== undefined && value < definition.min) {
    fail(path, `must be >= ${definition.min}`);
  }
  if (definition.max !== undefined && value > definition.max) {
    fail(path, `must be <= ${definition.max}`);
  }
}

function validateArray(value, definition, path) {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  if (definition.minLength !== undefined && value.length < definition.minLength) {
    fail(path, `must contain at least ${definition.minLength} item(s)`);
  }
  if (definition.maxLength !== undefined && value.length > definition.maxLength) {
    fail(path, `must contain at most ${definition.maxLength} item(s)`);
  }
  value.forEach((item, index) => validateNode(item, definition.items, `${path}[${index}]`));
}

function validateObject(value, definition, path) {
  if (!isRecord(value)) fail(path, 'must be an object');
  const requiredKeys = Object.keys(definition.required);
  const optionalKeys = Object.keys(definition.optional);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail(path, `contains unknown field(s): ${unknown.join(', ')}`);
  const missing = requiredKeys.filter((key) => !Object.hasOwn(value, key));
  if (missing.length > 0) fail(path, `is missing required field(s): ${missing.join(', ')}`);
  for (const key of requiredKeys) {
    validateNode(value[key], definition.required[key], `${path}.${key}`);
  }
  for (const key of optionalKeys) {
    if (Object.hasOwn(value, key)) {
      validateNode(value[key], definition.optional[key], `${path}.${key}`);
    }
  }
}

function validateUnion(value, definition, path) {
  const errors = [];
  for (const variant of definition.variants) {
    try {
      validateNode(value, variant, path);
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  fail(path, `does not match any supported variant (${errors.join(' | ')})`);
}

function validateJson(value, path) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJson(item, `${path}[${index}]`));
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, item]) => validateJson(item, `${path}.${key}`));
    return;
  }
  fail(path, 'must contain JSON-compatible data');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(path, message) {
  throw new Error(`${path} ${message}`);
}
