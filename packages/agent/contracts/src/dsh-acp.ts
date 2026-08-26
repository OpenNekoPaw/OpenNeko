import { AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES } from './agent-image-transport';
import { decodedBase64ByteLength, requireCanonicalBase64 } from './canonical-base64';
import type { DshSkillAuthoringLayout } from './dsh-skill-authoring';

export const DSH_ACP_EXTENSION_METHODS = {
  setSessionContext: 'openneko/session/context/set',
  archiveSession: 'openneko/session/archive',
  readArchivedSessions: 'openneko/session/archive/read',
  readPermissionPresets: 'openneko/session/permissions/read',
  enqueueInboxMessage: 'openneko/session/inbox/enqueue',
  readInbox: 'openneko/session/inbox/read',
  replaceInboxMessage: 'openneko/session/inbox/replace',
  sendInboxMessageNow: 'openneko/session/inbox/send-now',
  removeInboxMessage: 'openneko/session/inbox/remove',
  readImageAttachment: 'openneko/session/attachment/image/read',
  readInputCatalog: 'openneko/session/input-catalog/read',
  executeCommand: 'openneko/session/command/execute',
  invokeSkill: 'openneko/session/skill/invoke',
  readProviderCapabilities: 'openneko/providers/capabilities/read',
  readExtensions: 'openneko/extensions/read',
  setSkillEnabled: 'openneko/extensions/skill/enabled/set',
  removeSkill: 'openneko/extensions/skill/remove',
  addMcp: 'openneko/extensions/mcp/add',
  setMcpEnabled: 'openneko/extensions/mcp/enabled/set',
  removeMcp: 'openneko/extensions/mcp/remove',
  validateStagedSkill: 'openneko/skill-authoring/staged/validate',
  observeSkill: 'openneko/skill-authoring/observe',
  executeDomainTool: 'openneko/domain-tool/execute',
  cancelDomainTool: 'openneko/domain-tool/cancel',
} as const;

export interface DshAcpProviderCapability {
  readonly providerId: string;
  readonly displayName: string;
  readonly settingsNamespace: string;
  readonly settingsPath: readonly string[];
  readonly source: 'catalog' | 'declared';
}

export interface DshAcpProviderCapabilityDiagnostic {
  readonly code: 'invalid-provider' | 'invalid-protocol';
  readonly index: number;
  readonly message: string;
}

export interface DshAcpProviderCapabilityProjection {
  readonly providers: readonly DshAcpProviderCapability[];
  readonly protocols: readonly string[];
  readonly diagnostics: readonly DshAcpProviderCapabilityDiagnostic[];
}

export function projectDshAcpProviderCapabilities(
  providerEntries: readonly unknown[],
  protocolEntries: readonly unknown[],
): DshAcpProviderCapabilityProjection {
  const providers: DshAcpProviderCapability[] = [];
  const protocols: string[] = [];
  const diagnostics: DshAcpProviderCapabilityDiagnostic[] = [];
  const providerIds = new Set<string>();
  for (const [index, value] of providerEntries.entries()) {
    try {
      const provider = projectProviderCapability(value, `providers[${index}]`);
      if (providerIds.has(provider.providerId)) {
        throw new Error(`Duplicate DSH Provider capability '${provider.providerId}'.`);
      }
      providerIds.add(provider.providerId);
      providers.push(provider);
    } catch (error) {
      diagnostics.push({
        code: 'invalid-provider',
        index,
        message: describeDshAcpCapabilityError(error),
      });
    }
  }
  const protocolIds = new Set<string>();
  for (const [index, value] of protocolEntries.entries()) {
    try {
      const protocol = requireNonEmptyString(value, `protocols[${index}]`);
      if (protocolIds.has(protocol)) {
        throw new Error(`Duplicate DSH protocol capability '${protocol}'.`);
      }
      protocolIds.add(protocol);
      protocols.push(protocol);
    } catch (error) {
      diagnostics.push({
        code: 'invalid-protocol',
        index,
        message: describeDshAcpCapabilityError(error),
      });
    }
  }
  return { providers, protocols, diagnostics };
}

export function decodeDshAcpProviderCapabilityProjection(
  input: Record<string, unknown>,
): DshAcpProviderCapabilityProjection {
  decodeDshAcpJsonPayload(input, 'Provider capability projection');
  requireExactKeys(
    input,
    ['providers', 'protocols', 'diagnostics'],
    'Provider capability projection',
  );
  if (
    !Array.isArray(input.providers) ||
    !Array.isArray(input.protocols) ||
    !Array.isArray(input.diagnostics)
  ) {
    throw new Error('DSH ACP Provider capability projection arrays are invalid.');
  }
  return {
    providers: input.providers.map((value, index) =>
      decodeProviderCapability(value, `providers[${index}]`),
    ),
    protocols: input.protocols.map((value, index) =>
      requireNonEmptyString(value, `protocols[${index}]`),
    ),
    diagnostics: input.diagnostics.map((value, index) => {
      const diagnostic = requireRecord(value, `diagnostics[${index}]`);
      requireExactKeys(diagnostic, ['code', 'index', 'message'], `diagnostics[${index}]`);
      if (diagnostic.code !== 'invalid-provider' && diagnostic.code !== 'invalid-protocol') {
        throw new Error(`DSH ACP Provider capability diagnostic ${index} has an invalid code.`);
      }
      if (!Number.isSafeInteger(diagnostic.index) || (diagnostic.index as number) < 0) {
        throw new Error(`DSH ACP Provider capability diagnostic ${index} has an invalid index.`);
      }
      return {
        code: diagnostic.code,
        index: diagnostic.index as number,
        message: requireNonEmptyString(diagnostic.message, `diagnostics[${index}].message`),
      };
    }),
  };
}

function projectProviderCapability(value: unknown, label: string): DshAcpProviderCapability {
  const provider = requireRecord(value, label);
  requireExactKeys(
    provider,
    provider.declared === undefined
      ? ['provider', 'displayName', 'settingsNs', 'settingsPath']
      : ['provider', 'displayName', 'settingsNs', 'settingsPath', 'declared'],
    label,
  );
  if (
    !Array.isArray(provider.settingsPath) ||
    provider.settingsPath.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    throw new Error(`${label}.settingsPath must contain non-empty strings.`);
  }
  if (provider.declared !== undefined && typeof provider.declared !== 'boolean') {
    throw new Error(`${label}.declared must be a boolean when present.`);
  }
  return {
    providerId: requireNonEmptyString(provider.provider, `${label}.provider`),
    displayName: requireNonEmptyString(provider.displayName, `${label}.displayName`),
    settingsNamespace: requireNonEmptyString(provider.settingsNs, `${label}.settingsNs`),
    settingsPath: [...provider.settingsPath],
    source: provider.declared === true ? 'declared' : 'catalog',
  };
}

function decodeProviderCapability(value: unknown, label: string): DshAcpProviderCapability {
  const provider = requireRecord(value, label);
  requireExactKeys(
    provider,
    ['providerId', 'displayName', 'settingsNamespace', 'settingsPath', 'source'],
    label,
  );
  if (
    !Array.isArray(provider.settingsPath) ||
    provider.settingsPath.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    throw new Error(`${label}.settingsPath must contain non-empty strings.`);
  }
  if (provider.source !== 'catalog' && provider.source !== 'declared') {
    throw new Error(`${label}.source is invalid.`);
  }
  return {
    providerId: requireNonEmptyString(provider.providerId, `${label}.providerId`),
    displayName: requireNonEmptyString(provider.displayName, `${label}.displayName`),
    settingsNamespace: requireNonEmptyString(
      provider.settingsNamespace,
      `${label}.settingsNamespace`,
    ),
    settingsPath: [...provider.settingsPath],
    source: provider.source,
  };
}

function describeDshAcpCapabilityError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface DshAcpStagedSkillValidationRequest {
  readonly stagingRoot: string;
  readonly layout: DshSkillAuthoringLayout;
  readonly entry: string;
}

export interface DshAcpStagedSkillValidationProjection {
  readonly name: string;
}

export interface DshAcpSkillObservationRequest {
  readonly sessionId: string;
  readonly name: string;
}

export interface DshAcpSkillObservationProjection {
  readonly complete: boolean;
  readonly skill?: {
    readonly name: string;
    readonly source: string;
    readonly provider: string;
    readonly userInvocable: boolean;
    readonly modelInvocable: boolean;
  };
}

export function decodeDshAcpStagedSkillValidationRequest(
  input: Record<string, unknown>,
): DshAcpStagedSkillValidationRequest {
  decodeDshAcpJsonPayload(input, 'staged Skill validation request');
  requireExactKeys(input, ['stagingRoot', 'layout', 'entry'], 'staged Skill validation request');
  return {
    stagingRoot: requireNonEmptyString(input.stagingRoot, 'staged Skill root'),
    layout: requireDshSkillAuthoringLayout(input.layout),
    entry: requireNonEmptyString(input.entry, 'staged Skill entry'),
  };
}

export function decodeDshAcpStagedSkillValidationProjection(
  input: Record<string, unknown>,
): DshAcpStagedSkillValidationProjection {
  decodeDshAcpJsonPayload(input, 'staged Skill validation projection');
  requireExactKeys(input, ['name'], 'staged Skill validation projection');
  return { name: requireNonEmptyString(input.name, 'staged Skill name') };
}

export function decodeDshAcpSkillObservationRequest(
  input: Record<string, unknown>,
): DshAcpSkillObservationRequest {
  decodeDshAcpJsonPayload(input, 'Skill observation request');
  requireExactKeys(input, ['sessionId', 'name'], 'Skill observation request');
  return {
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    name: requireNonEmptyString(input.name, 'Skill observation name'),
  };
}

export function decodeDshAcpSkillObservationProjection(
  input: Record<string, unknown>,
): DshAcpSkillObservationProjection {
  decodeDshAcpJsonPayload(input, 'Skill observation projection');
  const keys = input.skill === undefined ? ['complete'] : ['complete', 'skill'];
  requireExactKeys(input, keys, 'Skill observation projection');
  if (typeof input.complete !== 'boolean') {
    throw new Error('Skill observation completeness is invalid.');
  }
  if (input.skill === undefined) return { complete: input.complete };
  const skill = requireRecord(input.skill, 'Skill observation');
  requireExactKeys(
    skill,
    ['name', 'source', 'provider', 'userInvocable', 'modelInvocable'],
    'Skill observation',
  );
  return {
    complete: input.complete,
    skill: {
      name: requireNonEmptyString(skill.name, 'Skill observation name'),
      source: requireNonEmptyString(skill.source, 'Skill observation source'),
      provider: requireNonEmptyString(skill.provider, 'Skill observation provider'),
      userInvocable: requireBoolean(skill.userInvocable, 'Skill observation userInvocable'),
      modelInvocable: requireBoolean(skill.modelInvocable, 'Skill observation modelInvocable'),
    },
  };
}

export interface DshAcpExtensionSkill {
  readonly name: string;
  readonly description: string;
  readonly whenToUse?: string;
  readonly source: string;
  readonly provider: string;
  readonly userInvocable: boolean;
  readonly modelInvocable: boolean;
  readonly enabled: boolean;
  readonly manageable: boolean;
  readonly removable: boolean;
}

export interface DshAcpExtensionMcp {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly transport: 'stdio' | 'streamable-http';
  readonly enabled: boolean;
  readonly status: 'ready' | 'disabled' | 'error';
  readonly diagnosticCode: string;
}

export type DshAcpMcpServerInput =
  | {
      readonly serverName: string;
      readonly description: string;
      readonly transport: 'stdio';
      readonly command: string;
      readonly args: readonly string[];
    }
  | {
      readonly serverName: string;
      readonly description: string;
      readonly transport: 'streamable-http';
      readonly url: string;
    };

export function decodeDshAcpSkillMutationRequest(input: Record<string, unknown>): {
  readonly name: string;
  readonly source: string;
  readonly enabled?: boolean;
} {
  decodeDshAcpJsonPayload(input, 'Skill lifecycle request');
  const keys = input.enabled === undefined ? ['name', 'source'] : ['name', 'source', 'enabled'];
  requireExactKeys(input, keys, 'Skill lifecycle request');
  return {
    name: requireNonEmptyString(input.name, 'Skill lifecycle name'),
    source: requireNonEmptyString(input.source, 'Skill lifecycle source'),
    ...(input.enabled === undefined
      ? {}
      : { enabled: requireBoolean(input.enabled, 'Skill lifecycle enabled') }),
  };
}

export function decodeDshAcpMcpServerInput(input: Record<string, unknown>): DshAcpMcpServerInput {
  decodeDshAcpJsonPayload(input, 'MCP server input');
  if (input.transport === 'stdio') {
    requireExactKeys(
      input,
      ['serverName', 'description', 'transport', 'command', 'args'],
      'MCP stdio server input',
    );
    if (!Array.isArray(input.args) || input.args.some((item) => typeof item !== 'string')) {
      throw new Error('MCP stdio arguments must be strings.');
    }
    return {
      serverName: requireNonEmptyString(input.serverName, 'MCP server name'),
      description: requireString(input.description, 'MCP server description'),
      transport: 'stdio',
      command: requireNonEmptyString(input.command, 'MCP command'),
      args: input.args,
    };
  }
  if (input.transport === 'streamable-http') {
    requireExactKeys(
      input,
      ['serverName', 'description', 'transport', 'url'],
      'MCP HTTP server input',
    );
    return {
      serverName: requireNonEmptyString(input.serverName, 'MCP server name'),
      description: requireString(input.description, 'MCP server description'),
      transport: 'streamable-http',
      url: requireNonEmptyString(input.url, 'MCP server URL'),
    };
  }
  throw new Error('MCP transport is invalid.');
}

export function decodeDshAcpMcpIdentityRequest(input: Record<string, unknown>): {
  readonly id: string;
  readonly enabled?: boolean;
} {
  decodeDshAcpJsonPayload(input, 'MCP lifecycle request');
  const keys = input.enabled === undefined ? ['id'] : ['id', 'enabled'];
  requireExactKeys(input, keys, 'MCP lifecycle request');
  return {
    id: requireNonEmptyString(input.id, 'MCP lifecycle id'),
    ...(input.enabled === undefined
      ? {}
      : { enabled: requireBoolean(input.enabled, 'MCP lifecycle enabled') }),
  };
}

export interface DshAcpExtensionProjection {
  readonly catalogScope: 'global';
  readonly skills: readonly DshAcpExtensionSkill[];
  readonly mcp: readonly DshAcpExtensionMcp[];
  readonly diagnostics: readonly {
    readonly code: 'skill_catalog_incomplete';
    readonly count: number;
  }[];
}

export function decodeDshAcpExtensionProjection(
  input: Record<string, unknown>,
): DshAcpExtensionProjection {
  decodeDshAcpJsonPayload(input, 'extension projection');
  requireExactKeys(input, ['catalogScope', 'skills', 'mcp', 'diagnostics'], 'extension projection');
  if (input.catalogScope !== 'global') {
    throw new Error('DSH ACP extension projection catalog scope is invalid.');
  }
  if (
    !Array.isArray(input.skills) ||
    !Array.isArray(input.mcp) ||
    !Array.isArray(input.diagnostics)
  ) {
    throw new Error('DSH ACP extension projection arrays are invalid.');
  }
  const skills = input.skills.map((value, index) => {
    const skill = requireRecord(value, `extensions.skills[${index}]`);
    const skillKeys =
      skill.whenToUse === undefined
        ? [
            'name',
            'description',
            'source',
            'provider',
            'userInvocable',
            'modelInvocable',
            'enabled',
            'manageable',
            'removable',
          ]
        : [
            'name',
            'description',
            'whenToUse',
            'source',
            'provider',
            'userInvocable',
            'modelInvocable',
            'enabled',
            'manageable',
            'removable',
          ];
    requireExactKeys(skill, skillKeys, `extensions.skills[${index}]`);
    return {
      name: requireNonEmptyString(skill.name, 'Skill name'),
      description: requireString(skill.description, 'Skill description'),
      ...(skill.whenToUse === undefined
        ? {}
        : { whenToUse: requireNonEmptyString(skill.whenToUse, 'Skill whenToUse') }),
      source: requireNonEmptyString(skill.source, 'Skill source'),
      provider: requireNonEmptyString(skill.provider, 'Skill provider'),
      userInvocable: requireBoolean(skill.userInvocable, 'Skill userInvocable'),
      modelInvocable: requireBoolean(skill.modelInvocable, 'Skill modelInvocable'),
      enabled: requireBoolean(skill.enabled, 'Skill enabled'),
      manageable: requireBoolean(skill.manageable, 'Skill manageable'),
      removable: requireBoolean(skill.removable, 'Skill removable'),
    };
  });
  const mcp: DshAcpExtensionMcp[] = input.mcp.map((value, index) => {
    const item = requireRecord(value, `extensions.mcp[${index}]`);
    requireExactKeys(
      item,
      ['id', 'name', 'description', 'transport', 'enabled', 'status', 'diagnosticCode'],
      `extensions.mcp[${index}]`,
    );
    if (item.status !== 'ready' && item.status !== 'disabled' && item.status !== 'error') {
      throw new Error('DSH ACP MCP status is invalid.');
    }
    if (item.transport !== 'stdio' && item.transport !== 'streamable-http') {
      throw new Error('DSH ACP MCP transport is invalid.');
    }
    return {
      id: requireNonEmptyString(item.id, 'MCP id'),
      name: requireNonEmptyString(item.name, 'MCP name'),
      description: requireString(item.description, 'MCP description'),
      transport: item.transport,
      enabled: requireBoolean(item.enabled, 'MCP enabled'),
      status: item.status,
      diagnosticCode: requireString(item.diagnosticCode, 'MCP diagnostic code'),
    };
  });
  const diagnostics: DshAcpExtensionProjection['diagnostics'][number][] = input.diagnostics.map(
    (value, index) => {
      const diagnostic = requireRecord(value, `extensions.diagnostics[${index}]`);
      requireExactKeys(diagnostic, ['code', 'count'], `extensions.diagnostics[${index}]`);
      if (diagnostic.code !== 'skill_catalog_incomplete') {
        throw new Error('DSH ACP extension diagnostic code is invalid.');
      }
      return {
        code: diagnostic.code,
        count: requirePositiveInteger(diagnostic.count, 'extension diagnostic count'),
      };
    },
  );
  return { catalogScope: 'global', skills, mcp, diagnostics };
}

export const DSH_ACP_EXTENSION_NOTIFICATIONS = {
  sessionEvent: 'openneko/session/event',
  contextPressure: 'openneko/session/context-pressure',
} as const;

export const DSH_ACP_MODEL_CONFIG_ID = 'model';

export interface DshAcpModelConfiguration {
  readonly providerId: string;
  readonly modelId: string;
  readonly maxTokens: number;
}

export interface DshAcpTurnConfiguration {
  readonly model: string;
  readonly permissionPresetId: string;
}

export interface DshAcpSessionContextSetRequest {
  readonly sessionId: string;
  readonly text: string;
}

export interface DshAcpSessionArchiveRequest {
  readonly sessionId: string;
}

export interface DshAcpArchivedSessionsProjection {
  readonly sessionIds: readonly string[];
}

export function decodeDshAcpSessionArchiveRequest(
  input: Record<string, unknown>,
): DshAcpSessionArchiveRequest {
  decodeDshAcpJsonPayload(input, 'Session archive request');
  requireExactKeys(input, ['sessionId'], 'Session archive request');
  return { sessionId: requireNonEmptyString(input.sessionId, 'sessionId') };
}

export function decodeDshAcpArchivedSessionsProjection(
  input: Record<string, unknown>,
): DshAcpArchivedSessionsProjection {
  decodeDshAcpJsonPayload(input, 'archived Sessions projection');
  requireExactKeys(input, ['sessionIds'], 'archived Sessions projection');
  if (!Array.isArray(input.sessionIds)) {
    throw new Error('DSH ACP archived Session identities must be an array.');
  }
  const sessionIds = input.sessionIds.map((value, index) =>
    requireNonEmptyString(value, `archived Session identities[${index}]`),
  );
  if (new Set(sessionIds).size !== sessionIds.length) {
    throw new Error('DSH ACP archived Session identities must be unique.');
  }
  return { sessionIds };
}

export interface DshAcpCommandDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputHint?: string;
}

export interface DshAcpSkillDescriptor {
  readonly name: string;
  readonly description: string;
  readonly whenToUse?: string;
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
  readonly invocations: readonly {
    readonly skillName: string;
  }[];
  readonly displayText: string;
  readonly promptText: string;
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
    const skillKeys =
      skill.whenToUse === undefined
        ? ['name', 'description', 'source', 'provider']
        : ['name', 'description', 'whenToUse', 'source', 'provider'];
    requireExactKeys(skill, skillKeys, `skills[${index}]`);
    return {
      name: requireNonEmptyString(skill.name, `skills[${index}].name`),
      description: requireNonEmptyString(skill.description, `skills[${index}].description`),
      ...(skill.whenToUse === undefined
        ? {}
        : {
            whenToUse: requireNonEmptyString(skill.whenToUse, `skills[${index}].whenToUse`),
          }),
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
  requireExactKeys(
    input,
    ['sessionId', 'invocations', 'displayText', 'promptText'],
    'Skill invoke request',
  );
  if (!Array.isArray(input.invocations) || input.invocations.length === 0) {
    throw new Error('DSH ACP Skill invocations must be a non-empty array.');
  }
  const invocations = input.invocations.map((value, index) => {
    const invocation = requireRecord(value, `Skill invocations[${index}]`);
    requireExactKeys(invocation, ['skillName'], `Skill invocations[${index}]`);
    return {
      skillName: requireNonEmptyString(invocation.skillName, `Skill invocations[${index}].name`),
    };
  });
  return {
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    invocations,
    displayText: requireNonEmptyString(input.displayText, 'Skill display text'),
    promptText: requireString(input.promptText, 'Skill prompt text'),
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
  readonly createdAt: number;
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

export interface DshAcpImageDisplayContentBlock {
  readonly type: 'image';
  readonly name: string;
}

export type DshAcpContentBlock =
  DshAcpTextContentBlock | DshAcpResourceLinkContentBlock | DshAcpImageDisplayContentBlock;

export type DshAcpInboxPromptBlock =
  | DshAcpTextContentBlock
  | {
      readonly type: 'resource_link';
      readonly name: string;
      readonly uri: string;
    }
  | {
      readonly type: 'image';
      readonly data: string;
      readonly mimeType: string;
      readonly _meta?: { readonly opennekoDisplayName: string };
    };

export interface DshAcpInboxEnqueueRequest {
  readonly sessionId: string;
  readonly prompt: readonly DshAcpInboxPromptBlock[];
  readonly displayContent: readonly DshAcpContentBlock[];
  readonly contextText: string;
  readonly configuration: DshAcpTurnConfiguration;
}

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
  readonly replay: boolean;
}

export interface DshAcpContextPressureProjection {
  readonly pressureTokens?: number;
  readonly projectedTokens?: number;
  readonly contextWindow?: number;
}

export interface DshAcpContextPressureNotification {
  readonly sessionId: string;
  readonly sourceSequence: number;
  readonly pressure: DshAcpContextPressureProjection;
}

export type DshAcpSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export interface DshAcpDomainToolRequest {
  readonly sessionId: string;
  readonly turn: number;
  readonly toolCallId: string;
  readonly sandboxMode: DshAcpSandboxMode;
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

export type DshAcpImageAttachmentMediaType =
  'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export interface DshAcpImageAttachmentRefProjection {
  readonly attachmentId: string;
  readonly mediaType: DshAcpImageAttachmentMediaType;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}

export interface DshAcpImageAttachmentReadRequest {
  readonly sessionId: string;
  readonly attachmentId: string;
}

export interface DshAcpImageAttachmentReadProjection {
  readonly attachment: DshAcpImageAttachmentRefProjection;
  readonly data: string;
}

export function decodeDshAcpImageAttachmentReadRequest(
  input: Record<string, unknown>,
): DshAcpImageAttachmentReadRequest {
  decodeDshAcpJsonPayload(input, 'image attachment read request');
  requireExactKeys(input, ['sessionId', 'attachmentId'], 'image attachment read request');
  return {
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    attachmentId: requireNonEmptyString(input.attachmentId, 'attachmentId'),
  };
}

export function decodeDshAcpImageAttachmentReadProjection(
  input: Record<string, unknown>,
): DshAcpImageAttachmentReadProjection {
  decodeDshAcpJsonPayload(
    { ...input, ...(typeof input.data === 'string' ? { data: '' } : {}) },
    'image attachment read metadata',
  );
  requireExactKeys(input, ['attachment', 'data'], 'image attachment read projection');
  const attachment = decodeDshAcpImageAttachmentRefProjection(input.attachment);
  const data = requireCanonicalBase64(
    input.data,
    'DSH ACP image attachment data must be canonical base64.',
  );
  const decodedBytes = decodedBase64ByteLength(data);
  if (decodedBytes !== attachment.bytes || decodedBytes > AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES) {
    throw new Error(
      `DSH ACP image attachment byte length is invalid: ${decodedBytes}/${attachment.bytes}.`,
    );
  }
  return { attachment, data };
}

export function decodeDshAcpImageAttachmentRefProjection(
  input: unknown,
): DshAcpImageAttachmentRefProjection {
  const record = requireRecord(input, 'image attachment reference');
  requireExactKeys(
    record,
    ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
    'image attachment reference',
  );
  const bytes = requirePositiveInteger(record.bytes, 'image attachment bytes');
  if (bytes > AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES) {
    throw new Error(
      `DSH ACP image attachment exceeds ${AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES} bytes.`,
    );
  }
  return {
    attachmentId: requireNonEmptyString(record.attachmentId, 'attachmentId'),
    mediaType: requireImageAttachmentMediaType(record.mediaType),
    bytes,
    width: requirePositiveInteger(record.width, 'image attachment width'),
    height: requirePositiveInteger(record.height, 'image attachment height'),
  };
}

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
  requireExactKeys(
    input,
    ['sessionId', 'sequence', 'time', 'type', 'data', 'replay'],
    'Session event',
  );
  return {
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    sequence: requireNonNegativeInteger(input.sequence, 'sequence'),
    time: requireNonNegativeInteger(input.time, 'time'),
    type: requireNonEmptyString(input.type, 'type'),
    data: input.data,
    replay: requireBoolean(input.replay, 'Session event replay'),
  };
}

export function decodeDshAcpContextPressureProjection(
  input: unknown,
): DshAcpContextPressureProjection {
  const record = requireRecord(input, 'context pressure');
  requireAllowedKeys(
    record,
    ['pressureTokens', 'projectedTokens', 'contextWindow'],
    'Context pressure',
  );
  return {
    ...(record.pressureTokens === undefined
      ? {}
      : {
          pressureTokens: requireNonNegativeInteger(
            record.pressureTokens,
            'context pressureTokens',
          ),
        }),
    ...(record.projectedTokens === undefined
      ? {}
      : {
          projectedTokens: requireNonNegativeInteger(
            record.projectedTokens,
            'context projectedTokens',
          ),
        }),
    ...(record.contextWindow === undefined
      ? {}
      : { contextWindow: requirePositiveInteger(record.contextWindow, 'context window') }),
  };
}

export function decodeDshAcpContextPressureNotification(
  input: Record<string, unknown>,
): DshAcpContextPressureNotification {
  requireExactKeys(
    input,
    ['sessionId', 'sourceSequence', 'pressure'],
    'Context pressure notification',
  );
  return {
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    sourceSequence: requireNonNegativeInteger(input.sourceSequence, 'sourceSequence'),
    pressure: decodeDshAcpContextPressureProjection(input.pressure),
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
  requireExactKeys(
    input,
    ['sessionId', 'turn', 'toolCallId', 'sandboxMode', 'tool', 'operation', 'input'],
    'domain Tool request',
  );
  return {
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    turn: requireNonNegativeInteger(input.turn, 'turn'),
    toolCallId: requireNonEmptyString(input.toolCallId, 'toolCallId'),
    sandboxMode: requireDshAcpSandboxMode(input.sandboxMode),
    tool: requireNonEmptyString(input.tool, 'tool'),
    operation: requireNonEmptyString(input.operation, 'operation'),
    input: requireJsonValue(input.input, 'input', 0),
  };
}

function requireDshAcpSandboxMode(input: unknown): DshAcpSandboxMode {
  if (input === 'read-only' || input === 'workspace-write' || input === 'danger-full-access') {
    return input;
  }
  throw new Error('DSH ACP sandboxMode is invalid.');
}

function requireDshSkillAuthoringLayout(input: unknown): DshSkillAuthoringLayout {
  if (input === 'directory' || input === 'flat') return input;
  throw new Error('DSH ACP staged Skill layout is invalid.');
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
  requireExactKeys(input, ['nextTurn', 'nextStep'], 'inbox snapshot');
  return {
    nextTurn: decodeInboxMessages(input.nextTurn, 'nextTurn'),
    nextStep: decodeInboxMessages(input.nextStep, 'nextStep'),
  };
}

function decodeInboxMessages(input: unknown, field: string): readonly DshAcpInboxMessage[] {
  if (!Array.isArray(input)) throw new Error(`DSH ACP ${field} must be an array.`);
  return input.map((message, index) => {
    const record = requireRecord(message, `${field}[${index}]`);
    requireExactKeys(record, ['messageId', 'createdAt', 'content'], `${field}[${index}]`);
    const content = record.content;
    if (!Array.isArray(content)) {
      throw new Error(`DSH ACP ${field}[${index}].content must be an array.`);
    }
    return {
      messageId: requireNonEmptyString(record.messageId, `${field}[${index}].messageId`),
      createdAt: requireNonNegativeInteger(record.createdAt, `${field}[${index}].createdAt`),
      content: content.map((block, blockIndex) =>
        decodeContentBlock(block, `${field}[${index}].content[${blockIndex}]`),
      ),
    };
  });
}

export function decodeDshAcpInboxEnqueueRequest(
  input: Record<string, unknown>,
): DshAcpInboxEnqueueRequest {
  decodeDshAcpJsonPayload(projectInboxPayloadMetadata(input), 'inbox enqueue request metadata');
  requireExactKeys(
    input,
    ['sessionId', 'prompt', 'displayContent', 'contextText', 'configuration'],
    'inbox enqueue request',
  );
  if (!Array.isArray(input.prompt) || input.prompt.length === 0) {
    throw new Error('DSH ACP inbox enqueue prompt must be a non-empty array.');
  }
  if (!Array.isArray(input.displayContent) || input.displayContent.length === 0) {
    throw new Error('DSH ACP inbox enqueue display content must be a non-empty array.');
  }
  return {
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    prompt: input.prompt.map((block, index) => decodeInboxPromptBlock(block, `prompt[${index}]`)),
    displayContent: input.displayContent.map((block, index) =>
      decodeContentBlock(block, `displayContent[${index}]`),
    ),
    contextText: requireString(input.contextText, 'contextText'),
    configuration: decodeDshAcpTurnConfiguration(input.configuration),
  };
}

export function decodeDshAcpTurnConfiguration(input: unknown): DshAcpTurnConfiguration {
  const record = requireRecord(input, 'turn configuration');
  requireExactKeys(record, ['model', 'permissionPresetId'], 'turn configuration');
  const model = encodeDshAcpModelConfiguration(decodeDshAcpModelConfiguration(record.model));
  return {
    model,
    permissionPresetId: requireNonEmptyString(record.permissionPresetId, 'turn permissionPresetId'),
  };
}

function decodeInboxPromptBlock(input: unknown, field: string): DshAcpInboxPromptBlock {
  const record = requireRecord(input, field);
  if (record.type === 'text') {
    requireExactKeys(record, ['type', 'text'], field);
    return { type: 'text', text: requireString(record.text, `${field}.text`) };
  }
  if (record.type === 'resource_link') {
    requireExactKeys(record, ['type', 'name', 'uri'], field);
    return {
      type: 'resource_link',
      name: requireNonEmptyString(record.name, `${field}.name`),
      uri: requireNonEmptyString(record.uri, `${field}.uri`),
    };
  }
  if (record.type === 'image') {
    const keys =
      record._meta === undefined
        ? ['type', 'data', 'mimeType']
        : ['type', 'data', 'mimeType', '_meta'];
    requireExactKeys(record, keys, field);
    const meta =
      record._meta === undefined ? undefined : requireRecord(record._meta, `${field}._meta`);
    if (meta !== undefined) requireExactKeys(meta, ['opennekoDisplayName'], `${field}._meta`);
    return {
      type: 'image',
      data: requireNonEmptyString(record.data, `${field}.data`),
      mimeType: requireNonEmptyString(record.mimeType, `${field}.mimeType`),
      ...(meta === undefined
        ? {}
        : {
            _meta: {
              opennekoDisplayName: requireNonEmptyString(
                meta.opennekoDisplayName,
                `${field}._meta.opennekoDisplayName`,
              ),
            },
          }),
    };
  }
  throw new Error(`DSH ACP ${field} is unsupported.`);
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
  if (record.type === 'image') {
    requireExactKeys(record, ['type', 'name'], field);
    return {
      type: 'image',
      name: requireNonEmptyString(record.name, `${field}.name`),
    };
  }
  throw new Error(`DSH ACP ${field}.type is unsupported.`);
}

function projectInboxPayloadMetadata(input: Record<string, unknown>): Record<string, unknown> {
  return {
    ...input,
    ...(Array.isArray(input.prompt)
      ? {
          prompt: input.prompt.map((block) => {
            if (block === null || typeof block !== 'object' || Array.isArray(block)) return block;
            const record = requireRecord(block, 'inbox prompt block');
            return record.type === 'image' ? { ...record, data: '' } : record;
          }),
        }
      : {}),
  };
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

function requireAllowedKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    throw new Error(`DSH ACP ${field} contains unsupported fields: ${unexpected.join(', ')}.`);
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

function requireImageAttachmentMediaType(input: unknown): DshAcpImageAttachmentMediaType {
  if (
    input === 'image/png' ||
    input === 'image/jpeg' ||
    input === 'image/webp' ||
    input === 'image/gif'
  ) {
    return input;
  }
  throw new Error(`DSH ACP image attachment media type '${String(input)}' is unsupported.`);
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
