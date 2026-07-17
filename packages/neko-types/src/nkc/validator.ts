// =============================================================================
// NKC Format SDK — Validator
//
// Pure-function, zero-dependency validator for NKC canvas data.
// Produces field-path-based errors and warnings.
// =============================================================================

import type { ValidationResult, ValidationError } from '../config/config-adapter';
import { CANVAS_CONNECTION_TYPES, CANVAS_NODE_TYPES } from '../types/canvas';
import { validateNkcNodeDurableResourceIdentity } from '../utils/canvasDurableResourceIdentity';

const LEGACY_RUNTIME_GENERATED_GROUP_ID_PREFIX = 'runtime:canvas-generated-group:';
const LEGACY_RUNTIME_GENERATED_CANDIDATE_ID_PREFIX = 'runtime:canvas-generated-candidate:';

// =============================================================================
// Type Guards (internal helpers)
// =============================================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

// =============================================================================
// Allowed values
// =============================================================================

const ALLOWED_NODE_TYPES = new Set<string>(CANVAS_NODE_TYPES);

const ALLOWED_ANCHOR_VALUES = new Set(['top', 'right', 'bottom', 'left']);

const ALLOWED_CONNECTION_TYPES = new Set<string>(CANVAS_CONNECTION_TYPES);

// =============================================================================
// Validate options
// =============================================================================

export interface NkcValidateOptions {
  /** When true, treat warnings as errors */
  strict?: boolean;
}

// =============================================================================
// Internal validators
// =============================================================================

function validateRoot(
  data: Record<string, unknown>,
  errors: ValidationError[],
  _warnings: ValidationError[],
): void {
  // version — required string
  if (!isString(data['version'])) {
    errors.push({ field: 'version', message: 'must be a string', severity: 'error' });
  }

  // name — required string
  if (!isString(data['name'])) {
    errors.push({ field: 'name', message: 'must be a string', severity: 'error' });
  }

  // nodes — required array
  if (!isArray(data['nodes'])) {
    errors.push({ field: 'nodes', message: 'must be an array', severity: 'error' });
  }

  // connections — required array
  if (!isArray(data['connections'])) {
    errors.push({ field: 'connections', message: 'must be an array', severity: 'error' });
  }

  // viewport — optional object
  if (data['viewport'] !== undefined) {
    validateViewport(data['viewport'], 'viewport', errors);
  }

  // projected — optional boolean marker for projected Canvas caches
  if (data['projected'] !== undefined && !isBoolean(data['projected'])) {
    errors.push({ field: 'projected', message: 'must be a boolean', severity: 'error' });
  }

  // linkedProject — optional string
  if (data['linkedProject'] !== undefined && !isString(data['linkedProject'])) {
    errors.push({ field: 'linkedProject', message: 'must be a string', severity: 'error' });
  }

  for (const field of ['narrative', 'behavior', 'entityGraph', 'memoryGraph']) {
    if (data[field] !== undefined && !isRecord(data[field])) {
      errors.push({ field, message: 'must be an object', severity: 'error' });
    }
  }
}

function validateViewport(viewport: unknown, path: string, errors: ValidationError[]): void {
  if (!isRecord(viewport)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // pan — required object with x/y
  const pan = viewport['pan'];
  if (!isRecord(pan)) {
    errors.push({ field: `${path}.pan`, message: 'must be an object', severity: 'error' });
  } else {
    if (!isNumber(pan['x'])) {
      errors.push({ field: `${path}.pan.x`, message: 'must be a number', severity: 'error' });
    }
    if (!isNumber(pan['y'])) {
      errors.push({ field: `${path}.pan.y`, message: 'must be a number', severity: 'error' });
    }
  }

  // zoom — required number
  if (!isNumber(viewport['zoom'])) {
    errors.push({ field: `${path}.zoom`, message: 'must be a number', severity: 'error' });
  }
}

function validateNode(
  node: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  if (!isRecord(node)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  const structuralErrors: ValidationError[] = [];

  // id — required string
  if (!isString(node['id'])) {
    structuralErrors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  } else if (
    node['id'].startsWith(LEGACY_RUNTIME_GENERATED_GROUP_ID_PREFIX) ||
    node['id'].startsWith(LEGACY_RUNTIME_GENERATED_CANDIDATE_ID_PREFIX)
  ) {
    structuralErrors.push({
      field: `${path}.id`,
      message: 'runtime generated Group identities cannot be persisted',
      severity: 'error',
    });
  }

  // type — required, must be in allowed set
  if (!isString(node['type'])) {
    structuralErrors.push({
      field: `${path}.type`,
      message: 'must be a string',
      severity: 'error',
    });
  }

  // position — required object with x/y
  const position = node['position'];
  if (!isRecord(position)) {
    structuralErrors.push({
      field: `${path}.position`,
      message: 'must be an object',
      severity: 'error',
    });
  } else {
    if (!isNumber(position['x'])) {
      structuralErrors.push({
        field: `${path}.position.x`,
        message: 'must be a number',
        severity: 'error',
      });
    }
    if (!isNumber(position['y'])) {
      structuralErrors.push({
        field: `${path}.position.y`,
        message: 'must be a number',
        severity: 'error',
      });
    }
  }

  // size — required object with width/height
  const size = node['size'];
  if (!isRecord(size)) {
    structuralErrors.push({
      field: `${path}.size`,
      message: 'must be an object',
      severity: 'error',
    });
  } else {
    if (!isNumber(size['width'])) {
      structuralErrors.push({
        field: `${path}.size.width`,
        message: 'must be a number',
        severity: 'error',
      });
    }
    if (!isNumber(size['height'])) {
      structuralErrors.push({
        field: `${path}.size.height`,
        message: 'must be a number',
        severity: 'error',
      });
    }
  }

  // zIndex — required number
  if (!isNumber(node['zIndex'])) {
    structuralErrors.push({
      field: `${path}.zIndex`,
      message: 'must be a number',
      severity: 'error',
    });
  }

  errors.push(...structuralErrors);

  if (
    structuralErrors.length === 0 &&
    isString(node['type']) &&
    !ALLOWED_NODE_TYPES.has(node['type'])
  ) {
    warnings.push({
      field: `${path}.type`,
      message: `unknown node type: "${node['type']}"`,
      severity: 'warning',
    });
  }

  // rotation — optional number
  if (node['rotation'] !== undefined && !isNumber(node['rotation'])) {
    errors.push({ field: `${path}.rotation`, message: 'must be a number', severity: 'error' });
  }

  // locked — optional boolean
  if (node['locked'] !== undefined && !isBoolean(node['locked'])) {
    errors.push({ field: `${path}.locked`, message: 'must be a boolean', severity: 'error' });
  }

  errors.push(
    ...validateNkcNodeDurableResourceIdentity(node['data'], `${path}.data`).map(
      (diagnostic): ValidationError => ({
        field: diagnostic.target ?? `${path}.data`,
        message: diagnostic.message,
        severity: 'error',
      }),
    ),
  );

  // ports — optional array
  if (node['ports'] !== undefined) {
    if (!isArray(node['ports'])) {
      errors.push({ field: `${path}.ports`, message: 'must be an array', severity: 'error' });
    } else {
      const ports = node['ports'];
      for (let i = 0; i < ports.length; i++) {
        validatePort(ports[i], `${path}.ports[${i}]`, errors, warnings);
      }
    }
  }
}

function validatePort(
  port: unknown,
  path: string,
  errors: ValidationError[],
  _warnings: ValidationError[],
): void {
  if (!isRecord(port)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  if (!isString(port['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  if (!isString(port['type']) || (port['type'] !== 'input' && port['type'] !== 'output')) {
    errors.push({
      field: `${path}.type`,
      message: 'must be "input" or "output"',
      severity: 'error',
    });
  }

  if (!isString(port['position']) || !ALLOWED_ANCHOR_VALUES.has(port['position'])) {
    errors.push({
      field: `${path}.position`,
      message: 'must be a valid anchor position',
      severity: 'error',
    });
  }
}

function validateConnection(
  connection: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  if (!isRecord(connection)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // id — required string
  if (!isString(connection['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  if (!isString(connection['sourceId'])) {
    errors.push({ field: `${path}.sourceId`, message: 'must be a string', severity: 'error' });
  }

  if (!isString(connection['targetId'])) {
    errors.push({ field: `${path}.targetId`, message: 'must be a string', severity: 'error' });
  }

  validateConnectionEndpointShape(connection['sourceEndpoint'], `${path}.sourceEndpoint`, errors);
  validateConnectionEndpointShape(connection['targetEndpoint'], `${path}.targetEndpoint`, errors);

  if (connection['type'] !== undefined) {
    if (!isString(connection['type'])) {
      errors.push({ field: `${path}.type`, message: 'must be a string', severity: 'error' });
    } else if (!ALLOWED_CONNECTION_TYPES.has(connection['type'])) {
      warnings.push({
        field: `${path}.type`,
        message: `unknown connection type: "${connection['type']}"`,
        severity: 'warning',
      });
    }
  }
}

function validateConnectionEndpointShape(
  endpoint: unknown,
  path: string,
  errors: ValidationError[],
): void {
  if (!isRecord(endpoint)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  if (!isString(endpoint['nodeId'])) {
    errors.push({ field: `${path}.nodeId`, message: 'must be a string', severity: 'error' });
  }

  if (
    endpoint['scope'] !== undefined &&
    endpoint['scope'] !== 'node' &&
    endpoint['scope'] !== 'port' &&
    endpoint['scope'] !== 'block' &&
    endpoint['scope'] !== 'field'
  ) {
    errors.push({
      field: `${path}.scope`,
      message: 'must be "node", "port", "block", or "field"',
      severity: 'error',
    });
  }

  if (endpoint['portId'] !== undefined && !isString(endpoint['portId'])) {
    errors.push({ field: `${path}.portId`, message: 'must be a string', severity: 'error' });
  }

  if (endpoint['blockId'] !== undefined && !isString(endpoint['blockId'])) {
    errors.push({ field: `${path}.blockId`, message: 'must be a string', severity: 'error' });
  }

  if (endpoint['fieldPath'] !== undefined && !isString(endpoint['fieldPath'])) {
    errors.push({ field: `${path}.fieldPath`, message: 'must be a string', severity: 'error' });
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Validate raw unknown data as NKC format.
 *
 * Use this when loading from JSON.parse() result before casting to CanvasData.
 */
export function validateNkc(data: unknown, options: NkcValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!isRecord(data)) {
    return {
      valid: false,
      errors: [{ field: '', message: 'data must be an object', severity: 'error' }],
      warnings: [],
    };
  }

  validateRoot(data, errors, warnings);

  // Validate nodes if root nodes is an array
  const nodes = data['nodes'];
  if (isArray(nodes)) {
    for (let i = 0; i < nodes.length; i++) {
      validateNode(nodes[i], `nodes[${i}]`, errors, warnings);
    }
  }

  // Validate connections if root connections is an array
  const connections = data['connections'];
  if (isArray(connections)) {
    for (let i = 0; i < connections.length; i++) {
      validateConnection(connections[i], `connections[${i}]`, errors, warnings);
    }
  }

  const effectiveErrors = options.strict
    ? [
        ...errors,
        ...warnings.map((warning): ValidationError => ({ ...warning, severity: 'error' })),
      ]
    : errors;

  return {
    valid: effectiveErrors.length === 0,
    errors: effectiveErrors,
    warnings: options.strict ? [] : warnings,
  };
}
