import type { ToolParameterProperty } from '@neko/agent-contracts';

const WORKSPACE_FILE_LOCATOR_SCHEMA: ToolParameterProperty = {
  type: 'object',
  properties: {
    authority: { type: 'string', enum: ['workspace'] },
    path: { type: 'string', minLength: 1 },
  },
  required: ['authority', 'path'],
  additionalProperties: false,
};

const PACKAGE_FILE_LOCATOR_SCHEMA: ToolParameterProperty = {
  type: 'object',
  properties: {
    authority: { type: 'string', enum: ['package'] },
    packageId: { type: 'string', minLength: 1 },
    revision: { type: 'string', minLength: 1 },
    path: { type: 'string', minLength: 1 },
  },
  required: ['authority', 'packageId', 'revision', 'path'],
  additionalProperties: false,
};

const CONTENT_SELECTOR_SCHEMA: ToolParameterProperty = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['entry'] },
    path: { type: 'string', minLength: 1 },
  },
  required: ['kind', 'path'],
  additionalProperties: false,
};

export const CONTENT_LOCATOR_SCHEMA: ToolParameterProperty = {
  type: 'object',
  properties: {
    file: {
      type: 'object',
      anyOf: [WORKSPACE_FILE_LOCATOR_SCHEMA, PACKAGE_FILE_LOCATOR_SCHEMA],
    },
    selector: CONTENT_SELECTOR_SCHEMA,
  },
  required: ['file'],
  additionalProperties: false,
};
