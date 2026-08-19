export const retiredIdentityAliasFields = Object.freeze([
  Object.freeze({ field: 'runId', value: 'retired-run' }),
  Object.freeze({ field: 'branchId', value: 'retired-branch' }),
  Object.freeze({ field: 'turnId', value: 'retired-turn' }),
]);

export const internalVersionFields = Object.freeze([
  Object.freeze({ field: 'version', value: 1 }),
  Object.freeze({ field: 'schemaVersion', value: 1 }),
  Object.freeze({ field: 'contractVersion', value: 1 }),
]);

export const nullableExecutionIdentityFields = Object.freeze([
  'dshSessionId',
  'turn',
  'toolCallId',
] as const);

export const overlappingConversationOwners = Object.freeze([
  Object.freeze({
    kind: 'workspace',
    workspaceId: 'workspace:one',
    assistantSpaceId: 'assistant-space:one',
  }),
  Object.freeze({
    kind: 'assistant',
    assistantSpaceId: 'assistant-space:one',
    workspaceId: 'workspace:one',
  }),
]);
