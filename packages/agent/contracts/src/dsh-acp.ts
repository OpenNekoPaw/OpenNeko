export const DSH_ACP_EXTENSION_METHODS = {
  setSessionContext: 'openneko/session/context/set',
  readPermissionPresets: 'openneko/session/permissions/read',
  readInbox: 'openneko/session/inbox/read',
  replaceInboxMessage: 'openneko/session/inbox/replace',
  removeInboxMessage: 'openneko/session/inbox/remove',
  readInputCatalog: 'openneko/session/input-catalog/read',
  executeCommand: 'openneko/session/command/execute',
  invokeSkill: 'openneko/session/skill/invoke',
  readExtensions: 'openneko/extensions/read',
  executeExtensionCommand: 'openneko/extensions/execute',
  executeDomainTool: 'openneko/domain-tool/execute',
  cancelDomainTool: 'openneko/domain-tool/cancel',
} as const;

export interface DshAcpExtensionSkill {
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly provider: string;
  readonly userInvocable: boolean;
  readonly modelInvocable: boolean;
}

export interface DshAcpExtensionMcp {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: 'ready' | 'unsupported' | 'error';
  readonly diagnosticCode: string;
}

export interface DshAcpExtensionProjection {
  readonly skills: readonly DshAcpExtensionSkill[];
  readonly mcp: readonly DshAcpExtensionMcp[];
  readonly diagnostics: readonly {
    readonly code: 'skill_catalog_incomplete' | 'mcp_management_unsupported';
    readonly count: number;
  }[];
}

export function decodeDshAcpExtensionProjection(
  input: Record<string, unknown>,
): DshAcpExtensionProjection {
  decodeDshAcpJsonPayload(input, 'extension projection');
  requireExactKeys(input, ['skills', 'mcp', 'diagnostics'], 'extension projection');
  if (
    !Array.isArray(input.skills) ||
    !Array.isArray(input.mcp) ||
    !Array.isArray(input.diagnostics)
  ) {
    throw new Error('DSH ACP extension projection arrays are invalid.');
  }
  const skills = input.skills.map((value, index) => {
    const skill = requireRecord(value, `extensions.skills[${index}]`);
    requireExactKeys(
      skill,
      ['name', 'description', 'source', 'provider', 'userInvocable', 'modelInvocable'],
      `extensions.skills[${index}]`,
    );
    return {
      name: requireNonEmptyString(skill.name, 'Skill name'),
      description: requireString(skill.description, 'Skill description'),
      source: requireNonEmptyString(skill.source, 'Skill source'),
      provider: requireNonEmptyString(skill.provider, 'Skill provider'),
      userInvocable: requireBoolean(skill.userInvocable, 'Skill userInvocable'),
      modelInvocable: requireBoolean(skill.modelInvocable, 'Skill modelInvocable'),
    };
  });
  const mcp: DshAcpExtensionMcp[] = input.mcp.map((value, index) => {
    const item = requireRecord(value, `extensions.mcp[${index}]`);
    requireExactKeys(
      item,
      ['id', 'name', 'description', 'status', 'diagnosticCode'],
      `extensions.mcp[${index}]`,
    );
    if (item.status !== 'ready' && item.status !== 'unsupported' && item.status !== 'error') {
      throw new Error('DSH ACP MCP status is invalid.');
    }
    return {
      id: requireNonEmptyString(item.id, 'MCP id'),
      name: requireNonEmptyString(item.name, 'MCP name'),
      description: requireString(item.description, 'MCP description'),
      status: item.status,
      diagnosticCode: requireString(item.diagnosticCode, 'MCP diagnostic code'),
    };
  });
  const diagnostics: DshAcpExtensionProjection['diagnostics'][number][] = input.diagnostics.map(
    (value, index) => {
      const diagnostic = requireRecord(value, `extensions.diagnostics[${index}]`);
      requireExactKeys(diagnostic, ['code', 'count'], `extensions.diagnostics[${index}]`);
      if (
        diagnostic.code !== 'skill_catalog_incomplete' &&
        diagnostic.code !== 'mcp_management_unsupported'
      ) {
        throw new Error('DSH ACP extension diagnostic code is invalid.');
      }
      return {
        code: diagnostic.code,
        count: requirePositiveInteger(diagnostic.count, 'extension diagnostic count'),
      };
    },
  );
  return { skills, mcp, diagnostics };
}

export const DSH_ACP_EXTENSION_NOTIFICATIONS = {
  sessionEvent: 'openneko/session/event',
} as const;

export const DSH_ACP_MODEL_CONFIG_ID = 'model';

export interface DshAcpModelConfiguration {
  readonly providerId: string;
  readonly modelId: string;
  readonly maxTokens: number;
}

export interface DshAcpSessionContextSetRequest {
  readonly sessionId: string;
  readonly text: string;
}

export interface DshAcpCommandDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputHint?: string;
}

export interface DshAcpSkillDescriptor {
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly provider: string;
}

export interface DshAcpInputCatalogProjection {
  readonly commands: readonly DshAcpCommandDescriptor[];
  readonly skills: readonly DshAcpSkillDescriptor[];
  readonly skillsComplete: boolean;
}

export interface DshAcpCommandExecuteRequest {
  readonly sessionId: string;
  readonly line: string;
}

export interface DshAcpCommandExecuteProjection {
  readonly commandId: string;
  readonly outcome: 'success' | 'error';
  readonly text?: string;
}

export interface DshAcpSkillInvokeRequest {
  readonly sessionId: string;
  readonly skillName: string;
  readonly displayText: string;
  readonly args?: string;
}

export interface DshAcpSkillInvokeProjection {
  readonly stopReason: 'end_turn' | 'max_tokens' | 'cancelled';
}

export function decodeDshAcpInputCatalogProjection(
  input: Record<string, unknown>,
): DshAcpInputCatalogProjection {
  decodeDshAcpJsonPayload(input, 'input catalog projection');
  requireExactKeys(input, ['commands', 'skills', 'skillsComplete'], 'input catalog projection');
  if (!Array.isArray(input.commands)) throw new Error('DSH ACP commands must be an array.');
  if (!Array.isArray(input.skills)) throw new Error('DSH ACP Skills must be an array.');
  if (typeof input.skillsComplete !== 'boolean') {
    throw new Error('DSH ACP skillsComplete must be a boolean.');
  }
  const commands = input.commands.map((value, index) => {
    const command = requireRecord(value, `commands[${index}]`);
    const keys =
      command.inputHint === undefined
        ? ['name', 'description']
        : ['name', 'description', 'inputHint'];
    requireExactKeys(command, keys, `commands[${index}]`);
    return {
      name: requireNonEmptyString(command.name, `commands[${index}].name`),
      description: requireNonEmptyString(command.description, `commands[${index}].description`),
      ...(command.inputHint === undefined
        ? {}
        : {
            inputHint: requireNonEmptyString(command.inputHint, `commands[${index}].inputHint`),
          }),
    };
  });
  const skills = input.skills.map((value, index) => {
    const skill = requireRecord(value, `skills[${index}]`);
    requireExactKeys(skill, ['name', 'description', 'source', 'provider'], `skills[${index}]`);
    return {
      name: requireNonEmptyString(skill.name, `skills[${index}].name`),
      description: requireNonEmptyString(skill.description, `skills[${index}].description`),
      source: requireNonEmptyString(skill.source, `skills[${index}].source`),
      provider: requireNonEmptyString(skill.provider, `skills[${index}].provider`),
    };
  });
  requireUniqueNames(commands, 'command');
  requireUniqueNames(skills, 'Skill');
  return { commands, skills, skillsComplete: input.skillsComplete };
}

export function decodeDshAcpCommandExecuteRequest(
  input: Record<string, unknown>,
): DshAcpCommandExecuteRequest {
  decodeDshAcpJsonPayload(input, 'command execute request');
  requireExactKeys(input, ['sessionId', 'line'], 'command execute request');
  const line = requireNonEmptyString(input.line, 'command line');
  if (!line.startsWith('/')) throw new Error("DSH ACP command line must start with '/'.");
  return {
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    line,
  };
}

export function decodeDshAcpCommandExecuteProjection(
  input: Record<string, unknown>,
): DshAcpCommandExecuteProjection {
  decodeDshAcpJsonPayload(input, 'command execute projection');
  const keys =
    input.text === undefined ? ['commandId', 'outcome'] : ['commandId', 'outcome', 'text'];
  requireExactKeys(input, keys, 'command execute projection');
  if (input.outcome !== 'success' && input.outcome !== 'error') {
    throw new Error('DSH ACP command outcome must be success or error.');
  }
  return {
    commandId: requireNonEmptyString(input.commandId, 'commandId'),
    outcome: input.outcome,
    ...(input.text === undefined
      ? {}
      : { text: requireNonEmptyString(input.text, 'command text') }),
  };
}

export function decodeDshAcpSkillInvokeRequest(
  input: Record<string, unknown>,
): DshAcpSkillInvokeRequest {
  decodeDshAcpJsonPayload(input, 'Skill invoke request');
  const keys =
    input.args === undefined
      ? ['sessionId', 'skillName', 'displayText']
      : ['sessionId', 'skillName', 'displayText', 'args'];
  requireExactKeys(input, keys, 'Skill invoke request');
  return {
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    skillName: requireNonEmptyString(input.skillName, 'Skill name'),
    displayText: requireNonEmptyString(input.displayText, 'Skill display text'),
    ...(input.args === undefined ? {} : { args: requireNonEmptyString(input.args, 'Skill args') }),
  };
}

export function decodeDshAcpSkillInvokeProjection(
  input: Record<string, unknown>,
): DshAcpSkillInvokeProjection {
  decodeDshAcpJsonPayload(input, 'Skill invoke projection');
  requireExactKeys(input, ['stopReason'], 'Skill invoke projection');
  if (
    input.stopReason !== 'end_turn' &&
    input.stopReason !== 'max_tokens' &&
    input.stopReason !== 'cancelled'
  ) {
    throw new Error('DSH ACP Skill stopReason is unsupported.');
  }
  return { stopReason: input.stopReason };
}

export interface DshAcpPermissionPresetOption {
  readonly value: string;
  readonly name: string;
  readonly description?: string;
}

export interface DshAcpPermissionPresetProjection {
  readonly options: readonly DshAcpPermissionPresetOption[];
  readonly currentValue: string;
}

export function decodeDshAcpPermissionPresetProjection(
  input: Record<string, unknown>,
): DshAcpPermissionPresetProjection {
  decodeDshAcpJsonPayload(input, 'permission preset projection');
  requireExactKeys(input, ['options', 'currentValue'], 'permission preset projection');
  if (!Array.isArray(input.options) || input.options.length === 0) {
    throw new Error('DSH ACP permission preset options must be a non-empty array.');
  }
  const options = input.options.map((value, index) => {
    const option = requireRecord(value, `permission preset options[${index}]`);
    const keys =
      option.description === undefined ? ['value', 'name'] : ['value', 'name', 'description'];
    requireExactKeys(option, keys, `permission preset options[${index}]`);
    return {
      value: requireNonEmptyString(option.value, `permission preset options[${index}].value`),
      name: requireNonEmptyString(option.name, `permission preset options[${index}].name`),
      ...(option.description === undefined
        ? {}
        : {
            description: requireNonEmptyString(
              option.description,
              `permission preset options[${index}].description`,
            ),
          }),
    };
  });
  const values = new Set(options.map((option) => option.value));
  if (values.size !== options.length) {
    throw new Error('DSH ACP permission preset options must use unique values.');
  }
  const currentValue = requireNonEmptyString(input.currentValue, 'permission preset currentValue');
  if (!values.has(currentValue)) {
    throw new Error(`DSH ACP current permission preset '${currentValue}' is not advertised.`);
  }
  return { options, currentValue };
}

export function decodeDshAcpSessionContextSetRequest(
  input: Record<string, unknown>,
): DshAcpSessionContextSetRequest {
  const payload = requireRecord(
    decodeDshAcpJsonPayload(input, 'Session context request'),
    'request',
  );
  requireExactKeys(payload, ['sessionId', 'text'], 'Session context request');
  return {
    sessionId: requireNonEmptyString(payload.sessionId, 'sessionId'),
    text: requireString(payload.text, 'text'),
  };
}

export function encodeDshAcpModelConfiguration(input: DshAcpModelConfiguration): string {
  return JSON.stringify([
    requireNonEmptyString(input.providerId, 'model providerId'),
    requireNonEmptyString(input.modelId, 'model modelId'),
    requirePositiveInteger(input.maxTokens, 'model maxTokens'),
  ]);
}

export function decodeDshAcpModelConfiguration(input: unknown): DshAcpModelConfiguration {
  if (typeof input !== 'string') {
    throw new Error('DSH ACP model configuration value must be a string.');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(input);
  } catch (error) {
    throw new Error('DSH ACP model configuration value must be valid JSON.', { cause: error });
  }
  if (!Array.isArray(decoded) || decoded.length !== 3) {
    throw new Error(
      'DSH ACP model configuration value must contain provider, model, and maxTokens.',
    );
  }
  return {
    providerId: requireNonEmptyString(decoded[0], 'model providerId'),
    modelId: requireNonEmptyString(decoded[1], 'model modelId'),
    maxTokens: requirePositiveInteger(decoded[2], 'model maxTokens'),
  };
}

export type DshAcpInboxTarget = 'next-turn' | 'next-step';

export interface DshAcpInboxMessage {
  readonly messageId: string;
  readonly content: readonly DshAcpContentBlock[];
}

export interface DshAcpTextContentBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface DshAcpResourceLinkContentBlock {
  readonly type: 'resource-link';
  readonly name: string;
  readonly uri: string;
}

export type DshAcpContentBlock = DshAcpTextContentBlock | DshAcpResourceLinkContentBlock;

export interface DshAcpInboxSnapshot {
  readonly nextTurn: readonly DshAcpInboxMessage[];
  readonly nextStep: readonly DshAcpInboxMessage[];
}

export interface DshAcpSessionEventNotification {
  readonly sessionId: string;
  readonly sequence: number;
  readonly time: number;
  readonly type: string;
  readonly data: unknown;
}

export interface DshAcpDomainToolRequest {
  readonly sessionId: string;
  readonly turn: number;
  readonly toolCallId: string;
  readonly tool: string;
  readonly operation: string;
  readonly input: DshAcpJsonValue;
}

export interface DshAcpDomainToolCancelRequest {
  readonly sessionId: string;
  readonly turn: number;
  readonly toolCallId: string;
}

export type DshAcpJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly DshAcpJsonValue[]
  | { readonly [key: string]: DshAcpJsonValue };

export const DSH_ACP_MAX_PAYLOAD_BYTES = 262_144;
export const DSH_ACP_MAX_JSON_DEPTH = 32;

export interface DshAcpHostToolPort<TExecution> {
  execute(
    request: {
      readonly tool: string;
      readonly operation: string;
      readonly input: DshAcpJsonValue;
    },
    execution: TExecution,
  ): Promise<DshAcpDomainToolResponse>;
}

export interface DshAcpDiagnostic {
  readonly code: string;
  readonly message: string;
}

export type DshAcpDomainToolResponse =
  | {
      readonly outcome: 'success';
      readonly result: DshAcpJsonValue;
      readonly jobId?: string;
    }
  | {
      readonly outcome: 'failure';
      readonly diagnostic: DshAcpDiagnostic;
    };

export function decodeDshAcpSessionEventNotification(
  input: Record<string, unknown>,
): DshAcpSessionEventNotification {
  requireExactKeys(input, ['sessionId', 'sequence', 'time', 'type', 'data'], 'Session event');
  return {
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    sequence: requireNonNegativeInteger(input.sequence, 'sequence'),
    time: requireNonNegativeInteger(input.time, 'time'),
    type: requireNonEmptyString(input.type, 'type'),
    data: input.data,
  };
}

export function decodeDshAcpJsonPayload(input: unknown, field: string): DshAcpJsonValue {
  const value = requireJsonValue(input, field, 0);
  const encoded = JSON.stringify(value);
  const byteLength = new TextEncoder().encode(encoded).length;
  if (byteLength > DSH_ACP_MAX_PAYLOAD_BYTES) {
    throw new Error(
      `DSH ACP ${field} exceeds ${DSH_ACP_MAX_PAYLOAD_BYTES} UTF-8 bytes; received ${byteLength}.`,
    );
  }
  return value;
}

export function decodeDshAcpDomainToolCancelRequest(
  input: Record<string, unknown>,
): DshAcpDomainToolCancelRequest {
  decodeDshAcpJsonPayload(input, 'cancel request');
  return {
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    turn: requireNonNegativeInteger(input.turn, 'turn'),
    toolCallId: requireNonEmptyString(input.toolCallId, 'toolCallId'),
  };
}

export function decodeDshAcpDomainToolRequest(
  input: Record<string, unknown>,
): DshAcpDomainToolRequest {
  decodeDshAcpJsonPayload(input, 'request');
  return {
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    turn: requireNonNegativeInteger(input.turn, 'turn'),
    toolCallId: requireNonEmptyString(input.toolCallId, 'toolCallId'),
    tool: requireNonEmptyString(input.tool, 'tool'),
    operation: requireNonEmptyString(input.operation, 'operation'),
    input: requireJsonValue(input.input, 'input', 0),
  };
}

export function decodeDshAcpDomainToolResponse(
  input: Record<string, unknown>,
): DshAcpDomainToolResponse {
  decodeDshAcpJsonPayload(input, 'response');
  if (input.outcome === 'success') {
    return {
      outcome: 'success',
      result: requireJsonValue(input.result, 'result', 0),
      ...(input.jobId === undefined ? {} : { jobId: requireNonEmptyString(input.jobId, 'jobId') }),
    };
  }
  if (input.outcome === 'failure') {
    const diagnostic = requireRecord(input.diagnostic, 'diagnostic');
    return {
      outcome: 'failure',
      diagnostic: {
        code: requireNonEmptyString(diagnostic.code, 'diagnostic.code'),
        message: requireNonEmptyString(diagnostic.message, 'diagnostic.message'),
      },
    };
  }
  throw new Error('DSH ACP outcome must be success or failure.');
}

export function decodeDshAcpInboxSnapshot(input: Record<string, unknown>): DshAcpInboxSnapshot {
  return {
    nextTurn: decodeInboxMessages(input.nextTurn, 'nextTurn'),
    nextStep: decodeInboxMessages(input.nextStep, 'nextStep'),
  };
}

function decodeInboxMessages(input: unknown, field: string): readonly DshAcpInboxMessage[] {
  if (!Array.isArray(input)) throw new Error(`DSH ACP ${field} must be an array.`);
  return input.map((message, index) => {
    const record = requireRecord(message, `${field}[${index}]`);
    const content = record.content;
    if (!Array.isArray(content)) {
      throw new Error(`DSH ACP ${field}[${index}].content must be an array.`);
    }
    return {
      messageId: requireNonEmptyString(record.messageId, `${field}[${index}].messageId`),
      content: content.map((block, blockIndex) =>
        decodeContentBlock(block, `${field}[${index}].content[${blockIndex}]`),
      ),
    };
  });
}

function decodeContentBlock(input: unknown, field: string): DshAcpContentBlock {
  const record = requireRecord(input, field);
  if (record.type === 'text') {
    return { type: 'text', text: requireString(record.text, `${field}.text`) };
  }
  if (record.type === 'resource-link') {
    return {
      type: 'resource-link',
      name: requireNonEmptyString(record.name, `${field}.name`),
      uri: requireNonEmptyString(record.uri, `${field}.uri`),
    };
  }
  throw new Error(`DSH ACP ${field}.type is unsupported.`);
}

function requireRecord(input: unknown, field: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`DSH ACP ${field} must be an object.`);
  }
  return input as Record<string, unknown>;
}

function requireExactKeys(
  input: Record<string, unknown>,
  expected: readonly string[],
  field: string,
): void {
  const actual = Object.keys(input).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new Error(`DSH ACP ${field} must contain exactly ${canonical.join(', ')}.`);
  }
}

function requireString(input: unknown, field: string): string {
  if (typeof input !== 'string') throw new Error(`DSH ACP ${field} must be a string.`);
  return input;
}

function requireBoolean(input: unknown, field: string): boolean {
  if (typeof input !== 'boolean') throw new Error(`DSH ACP ${field} must be boolean.`);
  return input;
}

function requireNonEmptyString(input: unknown, field: string): string {
  const value = requireString(input, field);
  if (value.length === 0) throw new Error(`DSH ACP ${field} must not be empty.`);
  return value;
}

function requireNonNegativeInteger(input: unknown, field: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 0) {
    throw new Error(`DSH ACP ${field} must be a non-negative safe integer.`);
  }
  return input as number;
}

function requirePositiveInteger(input: unknown, field: string): number {
  if (!Number.isSafeInteger(input) || (input as number) <= 0) {
    throw new Error(`DSH ACP ${field} must be a positive safe integer.`);
  }
  return input as number;
}

function requireUniqueNames(entries: readonly { readonly name: string }[], label: string): void {
  const names = new Set<string>();
  for (const entry of entries) {
    if (names.has(entry.name)) throw new Error(`DSH ACP ${label} '${entry.name}' is duplicated.`);
    names.add(entry.name);
  }
}

function requireJsonValue(input: unknown, field: string, depth: number): DshAcpJsonValue {
  const seen = new Set<object>();
  const visit = (value: unknown, path: string, containerDepth: number): DshAcpJsonValue => {
    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'string' ||
      (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0))
    ) {
      return value;
    }
    if (typeof value !== 'object') throw new Error(`DSH ACP ${path} must be lossless JSON.`);
    if (containerDepth > DSH_ACP_MAX_JSON_DEPTH) {
      throw new Error(`DSH ACP ${path} exceeds ${DSH_ACP_MAX_JSON_DEPTH} container depth.`);
    }
    if (seen.has(value)) throw new Error(`DSH ACP ${path} must not be circular.`);
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        if (
          Object.getPrototypeOf(value) !== Array.prototype ||
          Reflect.ownKeys(value).length !== value.length + 1 ||
          value.some((_item, index) => !Object.hasOwn(value, index))
        ) {
          throw new Error(`DSH ACP ${path} must be a dense plain JSON array.`);
        }
        return value.map((item, index) => visit(item, `${path}[${index}]`, containerDepth + 1));
      }
      if (
        Object.getPrototypeOf(value) !== Object.prototype ||
        Reflect.ownKeys(value).some(
          (key) =>
            typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(value, key),
        )
      ) {
        throw new Error(`DSH ACP ${path} must be a plain JSON object.`);
      }
      const record = requireRecord(value, path);
      return Object.fromEntries(
        Object.entries(record).map(([key, item]) => [
          key,
          visit(item, `${path}.${key}`, containerDepth + 1),
        ]),
      );
    } finally {
      seen.delete(value);
    }
  };
  return visit(input, field, depth + 1);
}
