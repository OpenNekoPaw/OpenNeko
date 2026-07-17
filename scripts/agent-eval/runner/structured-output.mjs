const SUPPORTED_SCHEMA_KEYS = new Set([
  'type',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'enum',
  'minItems',
  'maxItems',
  'minLength',
  'pattern',
]);
const JSON_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

export function evaluateStructuredOutput(assertion, facts, context = {}) {
  assertTurnsComplete(facts);
  const turn = (Array.isArray(facts?.turns) ? facts.turns : [])
    .filter((candidate) => candidate?.role === 'assistant' && candidate?.isError !== true)
    .at(-1);
  const content = typeof turn?.content === 'string' ? turn.content.trim() : '';
  if (!content) throw new Error('structured output requires a non-empty assistant answer');

  let details;
  if (assertion.format === 'json') {
    details = evaluateJson(assertion, content, context);
  } else if (assertion.format === 'table') {
    details = evaluateTable(assertion, content);
  } else if (assertion.format === 'markdown') {
    details = evaluateMarkdown(assertion, content);
  } else {
    details = evaluateText(assertion, content);
  }
  assertReferences(assertion, content);
  assertLocale(assertion.locale, content);
  return { turnId: turn.id, format: assertion.format, locale: assertion.locale, ...details };
}

export function validateOutputSchemaDefinition(schema, label = 'output schema') {
  if (!isRecord(schema)) throw new Error(`${label} must be an object`);
  const unknown = Object.keys(schema).filter((key) => !SUPPORTED_SCHEMA_KEYS.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unsupported field(s): ${unknown.join(', ')}`);
  }
  if (!JSON_TYPES.has(schema.type)) {
    throw new Error(`${label}.type must be a supported JSON type`);
  }
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
    throw new Error(`${label}.enum must be a non-empty array`);
  }
  if (schema.required !== undefined) {
    assertStringArray(schema.required, `${label}.required`);
  }
  if (schema.properties !== undefined) {
    if (!isRecord(schema.properties)) throw new Error(`${label}.properties must be an object`);
    for (const [key, child] of Object.entries(schema.properties)) {
      validateOutputSchemaDefinition(child, `${label}.properties.${key}`);
    }
  }
  if (schema.items !== undefined) {
    validateOutputSchemaDefinition(schema.items, `${label}.items`);
  }
  if (
    schema.additionalProperties !== undefined &&
    typeof schema.additionalProperties !== 'boolean'
  ) {
    throw new Error(`${label}.additionalProperties must be boolean`);
  }
  for (const key of ['minItems', 'maxItems', 'minLength']) {
    if (schema[key] !== undefined && (!Number.isInteger(schema[key]) || schema[key] < 0)) {
      throw new Error(`${label}.${key} must be a non-negative integer`);
    }
  }
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== 'string') throw new Error(`${label}.pattern must be a string`);
    try {
      new RegExp(schema.pattern, 'u');
    } catch {
      throw new Error(`${label}.pattern must be a valid regular expression`);
    }
  }
  return schema;
}

function evaluateJson(assertion, content, context) {
  let value;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(`assistant output is not a complete JSON document: ${formatError(error)}`);
  }
  assertFieldPaths(assertion, value);
  if (assertion.schemaRef) {
    const schema = context.outputSchemas?.[assertion.schemaRef];
    if (!schema) throw new Error(`output schema was not loaded: ${assertion.schemaRef}`);
    validateValueAgainstSchema(value, schema, '$');
  }
  return { rootType: jsonType(value), schemaRef: assertion.schemaRef };
}

function evaluateTable(assertion, content) {
  const lines = content.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  let table;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headers = parseTableRow(lines[index]);
    const separator = parseTableRow(lines[index + 1]);
    if (
      headers.length > 0 &&
      separator.length === headers.length &&
      separator.every((cell) => /^:?-{3,}:?$/u.test(cell))
    ) {
      const rows = [];
      for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
        const row = parseTableRow(lines[rowIndex]);
        if (row.length !== headers.length) break;
        rows.push(row);
      }
      table = { headers, rows };
      break;
    }
  }
  if (!table) throw new Error('assistant output does not contain a valid Markdown table');
  assertNamedFields(assertion, table.headers, 'table column');
  return { columns: table.headers, rowCount: table.rows.length };
}

function evaluateMarkdown(assertion, content) {
  const hasBlock = /^(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)/mu.test(content);
  const hasTable = content
    .split(/\r?\n/u)
    .some((line, index, lines) => index > 0 && /^\s*\|?\s*:?-{3,}/u.test(line) && lines[index - 1].includes('|'));
  if (!hasBlock && !hasTable) {
    throw new Error('assistant output does not contain deterministic Markdown block structure');
  }
  assertNamedFields(assertion, content, 'Markdown field');
  return { blockStructured: true };
}

function evaluateText(assertion, content) {
  if (/^(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)/mu.test(content)) {
    throw new Error('text output contains Markdown block syntax');
  }
  assertNamedFields(assertion, content, 'text field');
  return { length: content.length };
}

function assertFieldPaths(assertion, value) {
  const missing = (assertion.requiredFields ?? []).filter((path) => !hasPath(value, path));
  if (missing.length > 0) throw new Error(`required JSON field(s) missing: ${missing.join(', ')}`);
  const forbidden = (assertion.forbiddenFields ?? []).filter((path) => hasPath(value, path));
  if (forbidden.length > 0) {
    throw new Error(`forbidden JSON field(s) present: ${forbidden.join(', ')}`);
  }
}

function assertNamedFields(assertion, container, label) {
  const contains = (field) =>
    Array.isArray(container)
      ? container.includes(field)
      : container.toLocaleLowerCase().includes(field.toLocaleLowerCase());
  const missing = (assertion.requiredFields ?? []).filter((field) => !contains(field));
  if (missing.length > 0) throw new Error(`required ${label}(s) missing: ${missing.join(', ')}`);
  const forbidden = (assertion.forbiddenFields ?? []).filter((field) => contains(field));
  if (forbidden.length > 0) throw new Error(`forbidden ${label}(s) present: ${forbidden.join(', ')}`);
}

function assertReferences(assertion, content) {
  const missing = (assertion.requiredReferences ?? []).filter((reference) =>
    !content.includes(reference),
  );
  if (missing.length > 0) throw new Error(`required reference(s) missing: ${missing.join(', ')}`);
}

function assertLocale(locale, content) {
  if (!locale) return;
  const hasHan = /\p{Script=Han}/u.test(content);
  const hasJapaneseKana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(content);
  const hasLatin = /\p{Script=Latin}/u.test(content);
  if ((locale === 'zh' || locale === 'zh-cn') && !hasHan) {
    throw new Error(`output does not contain expected ${locale} language evidence`);
  }
  if ((locale === 'ja' || locale === 'ja-jp') && !hasJapaneseKana) {
    throw new Error(`output does not contain expected ${locale} language evidence`);
  }
  if ((locale === 'en' || locale === 'en-us') && (!hasLatin || hasHan || hasJapaneseKana)) {
    throw new Error(`output does not satisfy expected ${locale} language evidence`);
  }
}

function validateValueAgainstSchema(value, schema, path) {
  const actualType = jsonType(value);
  if (actualType !== schema.type && !(schema.type === 'number' && actualType === 'integer')) {
    throw new Error(`${path} must be ${schema.type}; observed ${actualType}`);
  }
  if (schema.enum && !schema.enum.some((candidate) => deepEqual(candidate, value))) {
    throw new Error(`${path} is not one of the allowed enum values`);
  }
  if (schema.type === 'object') {
    const required = schema.required ?? [];
    const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
    if (missing.length > 0) throw new Error(`${path} missing required field(s): ${missing.join(', ')}`);
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value).filter((key) => !Object.prototype.hasOwnProperty.call(properties, key));
      if (unknown.length > 0) throw new Error(`${path} contains unknown field(s): ${unknown.join(', ')}`);
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        validateValueAgainstSchema(value[key], childSchema, `${path}.${key}`);
      }
    }
  }
  if (schema.type === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      throw new Error(`${path} must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      throw new Error(`${path} must contain at most ${schema.maxItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, index) => validateValueAgainstSchema(item, schema.items, `${path}[${index}]`));
    }
  }
  if (schema.type === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      throw new Error(`${path} must contain at least ${schema.minLength} character(s)`);
    }
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
      throw new Error(`${path} does not match the required pattern`);
    }
  }
}

function parseTableRow(line) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const cells = [];
  let current = '';
  let escaped = false;
  for (const character of text) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

function hasPath(value, path) {
  let current = value;
  for (const segment of path.split('.')) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) return false;
    current = current[segment];
  }
  return true;
}

function assertTurnsComplete(facts) {
  const completeness = facts?.evidenceCompleteness?.turns;
  if (!completeness || completeness.droppedCount !== 0) {
    throw new Error('structured output requires complete turn evidence');
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
}

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
