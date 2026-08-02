import type {
  AgentResourceDisplayProjectionFact,
  DesktopAgentConnectionIdentity,
  EffectiveAgentConfigurationProjection,
} from '@neko-agent/contracts';

export const DESKTOP_AGENT_FACTS_VERSION = 1 as const;

export interface DesktopAgentBoundedFacts<T> {
  readonly limit: number;
  readonly items: readonly T[];
  readonly droppedCount: number;
}

export interface DesktopAgentPromptReceipt {
  readonly id: string;
  readonly source: 'system' | 'user-instructions' | 'agents-file' | 'skill';
  readonly digest: `sha256:${string}`;
}

export interface DesktopAgentSkillReceipt {
  readonly name: string;
  readonly source: 'project' | 'personal' | 'builtin' | 'plugin';
  readonly fingerprint: `sha256:${string}`;
  readonly status: 'triggered' | 'injected';
}

export interface DesktopAgentToolReceipt {
  readonly name: string;
  readonly callId?: string;
  readonly status: 'catalogued' | 'pending' | 'success' | 'error' | 'cancelled';
}

export interface DesktopAgentPermissionReceipt {
  readonly toolCallId: string;
  readonly decision: 'approved' | 'denied';
}

export interface DesktopAgentNeutralFacts {
  readonly schemaVersion: typeof DESKTOP_AGENT_FACTS_VERSION;
  readonly identity: {
    readonly connection: DesktopAgentConnectionIdentity;
    readonly conversationId: string;
    readonly branchId: string;
    readonly piSessionId: string;
    readonly turnId: string;
    readonly runId: string;
  };
  readonly runtimePath: {
    readonly controller: 'sender-bound-desktop-agent-controller';
    readonly runtime: 'pi-conversation-runtime';
    readonly transcript: 'pi-session';
    readonly metadata: 'sqlite';
    readonly projection: 'conversation-projection-store';
    readonly forbiddenPathCount: 0;
  };
  readonly configuration: {
    readonly requested: EffectiveAgentConfigurationProjection;
    readonly effective: EffectiveAgentConfigurationProjection;
  };
  readonly receipts: {
    readonly prompts: DesktopAgentBoundedFacts<DesktopAgentPromptReceipt>;
    readonly skills: DesktopAgentBoundedFacts<DesktopAgentSkillReceipt>;
    readonly tools: DesktopAgentBoundedFacts<DesktopAgentToolReceipt>;
    readonly permissions: DesktopAgentBoundedFacts<DesktopAgentPermissionReceipt>;
  };
  readonly projection: {
    readonly revision: number;
    readonly terminalState: 'completed' | 'cancelled' | 'failed';
  };
  readonly resourceDisplayProjections: DesktopAgentBoundedFacts<AgentResourceDisplayProjectionFact>;
  readonly persistence: {
    readonly durability: 'durable' | 'persistence-delayed';
    readonly checkpoint: 'observed';
  };
  readonly usage: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly costUsd?: number;
  };
  readonly diagnostics: DesktopAgentBoundedFacts<{
    readonly code: string;
    readonly severity: 'info' | 'warning' | 'error';
    readonly message: string;
  }>;
  readonly disposal: {
    readonly status: 'pending' | 'disposed' | 'failed';
    readonly diagnostic?: string;
  };
}

export function parseDesktopAgentNeutralFacts(input: unknown): DesktopAgentNeutralFacts {
  const record = exactRecord(
    input,
    [
      'schemaVersion',
      'identity',
      'runtimePath',
      'configuration',
      'receipts',
      'projection',
      'resourceDisplayProjections',
      'persistence',
      'usage',
      'diagnostics',
      'disposal',
    ],
    'Desktop Agent facts',
  );
  if (record['schemaVersion'] !== DESKTOP_AGENT_FACTS_VERSION) {
    throw new Error('Desktop Agent facts version is unsupported.');
  }
  const identity = exactRecord(
    record['identity'],
    ['connection', 'conversationId', 'branchId', 'piSessionId', 'turnId', 'runId'],
    'Desktop Agent facts identity',
  );
  const runtimePath = exactRecord(
    record['runtimePath'],
    ['controller', 'runtime', 'transcript', 'metadata', 'projection', 'forbiddenPathCount'],
    'Desktop Agent runtime path facts',
  );
  if (
    runtimePath['controller'] !== 'sender-bound-desktop-agent-controller' ||
    runtimePath['runtime'] !== 'pi-conversation-runtime' ||
    runtimePath['transcript'] !== 'pi-session' ||
    runtimePath['metadata'] !== 'sqlite' ||
    runtimePath['projection'] !== 'conversation-projection-store' ||
    runtimePath['forbiddenPathCount'] !== 0
  ) {
    throw new Error('Desktop Agent runtime path facts are invalid.');
  }
  const configuration = exactRecord(
    record['configuration'],
    ['requested', 'effective'],
    'Desktop Agent configuration facts',
  );
  const receipts = exactRecord(
    record['receipts'],
    ['prompts', 'skills', 'tools', 'permissions'],
    'Desktop Agent receipt facts',
  );
  const projection = exactRecord(
    record['projection'],
    ['revision', 'terminalState'],
    'Desktop Agent projection facts',
  );
  const persistence = exactRecord(
    record['persistence'],
    ['durability', 'checkpoint'],
    'Desktop Agent persistence facts',
  );
  const usage = exactRecord(
    record['usage'],
    ['inputTokens', 'outputTokens', 'costUsd'].filter(
      (key) => key in requireRecord(record['usage'], 'Desktop Agent usage facts'),
    ),
    'Desktop Agent usage facts',
  );
  const disposal = exactRecord(
    record['disposal'],
    ['status', 'diagnostic'].filter(
      (key) => key in requireRecord(record['disposal'], 'Desktop Agent disposal facts'),
    ),
    'Desktop Agent disposal facts',
  );
  return Object.freeze({
    schemaVersion: DESKTOP_AGENT_FACTS_VERSION,
    identity: Object.freeze({
      connection: parseConnection(identity['connection']),
      conversationId: text(identity['conversationId'], 'Conversation'),
      branchId: text(identity['branchId'], 'branch'),
      piSessionId: text(identity['piSessionId'], 'Pi Session'),
      turnId: text(identity['turnId'], 'turn'),
      runId: text(identity['runId'], 'run'),
    }),
    runtimePath: Object.freeze({
      controller: 'sender-bound-desktop-agent-controller',
      runtime: 'pi-conversation-runtime',
      transcript: 'pi-session',
      metadata: 'sqlite',
      projection: 'conversation-projection-store',
      forbiddenPathCount: 0,
    }),
    configuration: Object.freeze({
      requested: parseConfigurationProjection(configuration['requested']),
      effective: parseConfigurationProjection(configuration['effective']),
    }),
    receipts: Object.freeze({
      prompts: parseBounded(receipts['prompts'], 'Prompt', parsePromptReceipt),
      skills: parseBounded(receipts['skills'], 'Skill', parseSkillReceipt),
      tools: parseBounded(receipts['tools'], 'Tool', parseToolReceipt),
      permissions: parseBounded(receipts['permissions'], 'permission', parsePermissionReceipt),
    }),
    projection: Object.freeze({
      revision: nonNegativeInteger(projection['revision'], 'projection revision'),
      terminalState: oneOf(
        projection['terminalState'],
        ['completed', 'cancelled', 'failed'] as const,
        'projection terminal state',
      ),
    }),
    resourceDisplayProjections: parseBounded(
      record['resourceDisplayProjections'],
      'resource display projection',
      parseResourceDisplayProjection,
    ),
    persistence: Object.freeze({
      durability: oneOf(
        persistence['durability'],
        ['durable', 'persistence-delayed'] as const,
        'persistence durability',
      ),
      checkpoint: oneOf(persistence['checkpoint'], ['observed'] as const, 'persistence checkpoint'),
    }),
    usage: Object.freeze({
      ...(usage['inputTokens'] === undefined
        ? {}
        : { inputTokens: nonNegativeInteger(usage['inputTokens'], 'input token usage') }),
      ...(usage['outputTokens'] === undefined
        ? {}
        : { outputTokens: nonNegativeInteger(usage['outputTokens'], 'output token usage') }),
      ...(usage['costUsd'] === undefined
        ? {}
        : { costUsd: nonNegativeNumber(usage['costUsd'], 'cost usage') }),
    }),
    diagnostics: parseBounded(record['diagnostics'], 'diagnostic', parseDiagnostic),
    disposal: Object.freeze({
      status: oneOf(
        disposal['status'],
        ['pending', 'disposed', 'failed'] as const,
        'disposal status',
      ),
      ...(disposal['diagnostic'] === undefined
        ? {}
        : { diagnostic: text(disposal['diagnostic'], 'disposal diagnostic') }),
    }),
  });
}

function parseConfigurationProjection(input: unknown): EffectiveAgentConfigurationProjection {
  const record = exactRecord(
    input,
    ['schemaVersion', 'profileId', 'digest', 'values', 'sources', 'dimensions'],
    'Desktop Agent effective configuration facts',
  );
  if (record['schemaVersion'] !== 1) {
    throw new Error('Desktop Agent effective configuration facts version is unsupported.');
  }
  const configurationDigest = digest(record['digest'], 'effective configuration');
  const expectedProfileId = `effective-agent-${configurationDigest.slice(
    'sha256:'.length,
    'sha256:'.length + 16,
  )}`;
  if (record['profileId'] !== expectedProfileId) {
    throw new Error('Desktop Agent effective configuration profile identity is invalid.');
  }
  const values = exactRecord(
    record['values'],
    ['modelBinding', 'temperature', 'maxTokens', 'thinkingBudget', 'executionMode', 'outputFormat'],
    'Desktop Agent effective configuration values',
  );
  const modelBinding = exactRecord(
    values['modelBinding'],
    ['purpose', 'providerId', 'modelId'],
    'Desktop Agent effective model binding',
  );
  if (modelBinding['purpose'] !== 'agent.main') {
    throw new Error('Desktop Agent effective model binding purpose is invalid.');
  }
  const temperature = finiteRange(values['temperature'], 'temperature', 0, 2);
  const maxTokens = positiveInteger(values['maxTokens'], 'maximum token count');
  const thinkingBudget = nonNegativeInteger(values['thinkingBudget'], 'thinking budget');
  const executionMode = oneOf(
    values['executionMode'],
    ['plan', 'ask', 'auto'] as const,
    'execution mode',
  );
  const outputFormat = oneOf(
    values['outputFormat'],
    ['text', 'json', 'markdown'] as const,
    'output format',
  );
  const sources = exactRecord(
    record['sources'],
    ['modelBinding', 'temperature', 'maxTokens', 'thinkingBudget', 'executionMode', 'outputFormat'],
    'Desktop Agent effective configuration sources',
  );
  const parsedSources = Object.freeze({
    modelBinding: configurationSource(sources['modelBinding'], 'model binding'),
    temperature: configurationSource(sources['temperature'], 'temperature'),
    maxTokens: configurationSource(sources['maxTokens'], 'maximum token count'),
    thinkingBudget: configurationSource(sources['thinkingBudget'], 'thinking budget'),
    executionMode: configurationSource(sources['executionMode'], 'execution mode'),
    outputFormat: configurationSource(sources['outputFormat'], 'output format'),
  });
  const dimensions = parseConfigurationDimensions(record['dimensions']);
  return Object.freeze({
    schemaVersion: 1,
    profileId: expectedProfileId,
    digest: configurationDigest,
    values: Object.freeze({
      modelBinding: Object.freeze({
        purpose: 'agent.main',
        providerId: text(modelBinding['providerId'], 'effective provider identity'),
        modelId: text(modelBinding['modelId'], 'effective model identity'),
      }),
      temperature,
      maxTokens,
      thinkingBudget,
      executionMode,
      outputFormat,
    }),
    sources: parsedSources,
    dimensions,
  });
}

const CONFIGURATION_DIMENSIONS = Object.freeze([
  Object.freeze({ key: 'modelBinding', valueType: 'model-binding' }),
  Object.freeze({ key: 'temperature', valueType: 'number' }),
  Object.freeze({ key: 'maxTokens', valueType: 'integer' }),
  Object.freeze({ key: 'thinkingBudget', valueType: 'integer' }),
  Object.freeze({ key: 'executionMode', valueType: 'enum' }),
  Object.freeze({ key: 'outputFormat', valueType: 'enum' }),
] as const);

function parseConfigurationDimensions(
  input: unknown,
): EffectiveAgentConfigurationProjection['dimensions'] {
  if (!Array.isArray(input) || input.length !== CONFIGURATION_DIMENSIONS.length) {
    throw new Error('Desktop Agent effective configuration dimensions are invalid.');
  }
  return Object.freeze(
    input.map((item, index) => {
      const expected = CONFIGURATION_DIMENSIONS[index];
      if (!expected) {
        throw new Error('Desktop Agent effective configuration dimension is unsupported.');
      }
      const record = exactRecord(
        item,
        ['key', 'owner', 'scope', 'restart', 'valueType'],
        'Desktop Agent effective configuration dimension',
      );
      if (
        record['key'] !== expected.key ||
        record['valueType'] !== expected.valueType ||
        record['owner'] !== 'agent-config' ||
        record['scope'] !== 'turn' ||
        record['restart'] !== 'not-required'
      ) {
        throw new Error('Desktop Agent effective configuration dimension is invalid.');
      }
      return Object.freeze({
        key: expected.key,
        owner: 'agent-config' as const,
        scope: 'turn' as const,
        restart: 'not-required' as const,
        valueType: expected.valueType,
      });
    }),
  );
}

function configurationSource(
  input: unknown,
  label: string,
): EffectiveAgentConfigurationProjection['sources']['modelBinding'] {
  return oneOf(input, ['user', 'workspace', 'runtime', 'default'] as const, `${label} source`);
}

function parseConnection(input: unknown): DesktopAgentConnectionIdentity {
  const record = exactRecord(
    input,
    [
      'applicationInstanceId',
      'windowId',
      'projectId',
      'workspaceId',
      'viewId',
      'viewEpoch',
      'rendererEpoch',
      'connectionId',
    ],
    'Desktop Agent facts connection',
  );
  return Object.freeze({
    applicationInstanceId: text(record['applicationInstanceId'], 'application'),
    windowId: text(record['windowId'], 'Window'),
    projectId: text(record['projectId'], 'Project'),
    workspaceId: text(record['workspaceId'], 'Workspace'),
    viewId: text(record['viewId'], 'View'),
    viewEpoch: positiveInteger(record['viewEpoch'], 'View epoch'),
    rendererEpoch: positiveInteger(record['rendererEpoch'], 'renderer epoch'),
    connectionId: text(record['connectionId'], 'connection'),
  });
}

function parsePromptReceipt(input: unknown): DesktopAgentPromptReceipt {
  const record = exactRecord(input, ['id', 'source', 'digest'], 'Desktop Agent Prompt receipt');
  return Object.freeze({
    id: text(record['id'], 'Prompt receipt'),
    source: oneOf(
      record['source'],
      ['system', 'user-instructions', 'agents-file', 'skill'] as const,
      'Prompt source',
    ),
    digest: digest(record['digest'], 'Prompt'),
  });
}

function parseSkillReceipt(input: unknown): DesktopAgentSkillReceipt {
  const record = exactRecord(
    input,
    ['name', 'source', 'fingerprint', 'status'],
    'Desktop Agent Skill receipt',
  );
  return Object.freeze({
    name: text(record['name'], 'Skill'),
    source: oneOf(
      record['source'],
      ['project', 'personal', 'builtin', 'plugin'] as const,
      'Skill source',
    ),
    fingerprint: digest(record['fingerprint'], 'Skill fingerprint'),
    status: oneOf(record['status'], ['triggered', 'injected'] as const, 'Skill status'),
  });
}

function parseToolReceipt(input: unknown): DesktopAgentToolReceipt {
  const source = requireRecord(input, 'Desktop Agent Tool receipt');
  const record = exactRecord(
    source,
    ['name', 'callId'].filter((key) => key in source).concat('status'),
    'Desktop Agent Tool receipt',
  );
  return Object.freeze({
    name: text(record['name'], 'Tool'),
    ...(record['callId'] === undefined ? {} : { callId: text(record['callId'], 'Tool Call') }),
    status: oneOf(
      record['status'],
      ['catalogued', 'pending', 'success', 'error', 'cancelled'] as const,
      'Tool status',
    ),
  });
}

function parsePermissionReceipt(input: unknown): DesktopAgentPermissionReceipt {
  const record = exactRecord(input, ['toolCallId', 'decision'], 'Desktop Agent permission receipt');
  return Object.freeze({
    toolCallId: text(record['toolCallId'], 'permission Tool Call'),
    decision: oneOf(record['decision'], ['approved', 'denied'] as const, 'permission decision'),
  });
}

function parseResourceDisplayProjection(input: unknown): AgentResourceDisplayProjectionFact {
  const record = exactRecord(
    input,
    [
      'conversationId',
      'toolCallId',
      'projectionKind',
      'status',
      'locatorKind',
      'transport',
      'renderTarget',
      'diagnosticCodes',
    ],
    'Desktop Agent resource display projection',
  );
  return Object.freeze({
    conversationId: text(record['conversationId'], 'resource projection Conversation'),
    toolCallId: text(record['toolCallId'], 'resource projection Tool Call'),
    projectionKind: oneOf(
      record['projectionKind'],
      ['tool-result'] as const,
      'resource projection kind',
    ),
    status: oneOf(record['status'], ['authorized', 'denied'] as const, 'resource status'),
    locatorKind: oneOf(
      record['locatorKind'],
      ['workspace-file', 'generated-output'] as const,
      'resource locator kind',
    ),
    transport: oneOf(
      record['transport'],
      ['openneko-resource', 'none'] as const,
      'resource transport',
    ),
    renderTarget: oneOf(
      record['renderTarget'],
      ['agent-webview'] as const,
      'resource render target',
    ),
    diagnosticCodes: stringArray(record['diagnosticCodes'], 'resource diagnostic codes'),
  });
}

function parseDiagnostic(input: unknown): DesktopAgentNeutralFacts['diagnostics']['items'][number] {
  const record = exactRecord(
    input,
    ['code', 'severity', 'message'],
    'Desktop Agent diagnostic fact',
  );
  return Object.freeze({
    code: text(record['code'], 'diagnostic code'),
    severity: oneOf(
      record['severity'],
      ['info', 'warning', 'error'] as const,
      'diagnostic severity',
    ),
    message: text(record['message'], 'diagnostic message'),
  });
}

function parseBounded<T>(
  input: unknown,
  label: string,
  parseItem: (item: unknown) => T,
): DesktopAgentBoundedFacts<T> {
  const record = exactRecord(
    input,
    ['limit', 'items', 'droppedCount'],
    `Desktop Agent bounded ${label} facts`,
  );
  if (!Array.isArray(record['items'])) {
    throw new Error(`Desktop Agent bounded ${label} facts items must be an array.`);
  }
  return Object.freeze({
    limit: positiveInteger(record['limit'], `${label} fact limit`),
    items: Object.freeze(record['items'].map(parseItem)),
    droppedCount: nonNegativeInteger(record['droppedCount'], `${label} dropped count`),
  });
}

function exactRecord(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = requireRecord(input, label);
  const expected = new Set(keys);
  const unknown = Object.keys(record).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !(key in record));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(`${label} fields are invalid.`);
  }
  return record;
}

function requireRecord(input: unknown, label: string): Record<string, unknown> {
  if (!isRecord(input)) throw new Error(`${label} must be an object.`);
  return input;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function text(input: unknown, label: string): string {
  if (typeof input !== 'string' || input.trim().length === 0 || input.length > 4_096) {
    throw new Error(`Desktop Agent ${label} text is invalid.`);
  }
  return input;
}

function digest(input: unknown, label: string): `sha256:${string}` {
  const value = text(input, label);
  if (!/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`Desktop Agent ${label} digest is invalid.`);
  }
  return `sha256:${value.slice('sha256:'.length)}`;
}

function positiveInteger(input: unknown, label: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1) {
    throw new Error(`Desktop Agent ${label} must be a positive integer.`);
  }
  return input;
}

function nonNegativeInteger(input: unknown, label: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) {
    throw new Error(`Desktop Agent ${label} must be a non-negative integer.`);
  }
  return input;
}

function nonNegativeNumber(input: unknown, label: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0) {
    throw new Error(`Desktop Agent ${label} must be a non-negative number.`);
  }
  return input;
}

function finiteRange(input: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < minimum || input > maximum) {
    throw new Error(
      `Desktop Agent ${label} must be between ${String(minimum)} and ${String(maximum)}.`,
    );
  }
  return input;
}

function oneOf<const T extends readonly string[]>(
  input: unknown,
  values: T,
  label: string,
): T[number] {
  if (typeof input !== 'string' || !values.includes(input)) {
    throw new Error(`Desktop Agent ${label} is invalid.`);
  }
  return input;
}

function stringArray(input: unknown, label: string): readonly string[] {
  if (!Array.isArray(input)) throw new Error(`Desktop Agent ${label} must be an array.`);
  return Object.freeze(input.map((item) => text(item, label)));
}
