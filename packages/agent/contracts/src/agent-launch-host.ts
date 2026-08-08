import {
  parseAgentDraftMentionSearchProjection,
  type AgentDraftMentionSearchProjection,
} from './agent-draft-mention-search';
import {
  parseAgentLaunchCatalogProjection,
  parseAgentLaunchConnectionIdentity,
  type AgentLaunchCatalogProjection,
  type AgentLaunchConnectionIdentity,
  type AgentLaunchResourceKind,
} from './agent-launch';
import {
  parseAgentDraftSubmitInput,
  parseAgentDraftSubmitProjection,
  type AgentDraftSubmitInput,
  type AgentDraftSubmitProjection,
} from './agent-draft-submit';
import {
  parseAgentDomainBinding,
  parseAgentDraftInteractionProjection,
  type AgentDomainBinding,
  type AgentDraftInteractionProjection,
} from './agent-interaction-binding';
import {
  parseAgentConfigurationRequest,
  type AgentConfigurationRequest,
} from './agent-model-catalog';
import {
  parseAgentAvailabilityDiagnostic,
  type AgentAvailabilityDiagnostic,
} from './agent-availability';

export const AGENT_LAUNCH_HOST_CHANNEL = 'neko:agent:launch' as const;

export type AgentLaunchHostRequest =
  | {
      readonly requestId: string;
      readonly operation: 'bind-assistant';
      readonly connection: AgentLaunchConnectionIdentity;
    }
  | {
      readonly requestId: string;
      readonly operation: 'bind-target';
      readonly connection: AgentLaunchConnectionIdentity;
      readonly binding: AgentDomainBinding;
    }
  | {
      readonly requestId: string;
      readonly operation: 'attach';
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
      readonly viewId: string;
      readonly draft: AgentDraftInteractionProjection;
    }
  | {
      readonly requestId: string;
      readonly operation: 'authorize-resource';
      readonly connection: AgentLaunchConnectionIdentity;
      readonly resourceKind: AgentLaunchResourceKind;
    }
  | {
      readonly requestId: string;
      readonly operation: 'update-configuration';
      readonly connection: AgentLaunchConnectionIdentity;
      readonly configuration: AgentConfigurationRequest;
    }
  | {
      readonly requestId: string;
      readonly operation: 'search-workspace-mentions';
      readonly connection: AgentLaunchConnectionIdentity;
      readonly bindingReceiptId: string;
      readonly filter: string;
    }
  | {
      readonly requestId: string;
      readonly operation: 'submit-draft';
      readonly connection: AgentLaunchConnectionIdentity;
      readonly input: AgentDraftSubmitInput;
    }
  | {
      readonly requestId: string;
      readonly operation: 'detach';
      readonly connection: AgentLaunchConnectionIdentity;
    };

export type AgentLaunchHostResult =
  | {
      readonly requestId: string;
      readonly status: 'ready';
      readonly catalog: AgentLaunchCatalogProjection;
    }
  | {
      readonly requestId: string;
      readonly status: 'unavailable';
      readonly diagnostic: AgentAvailabilityDiagnostic;
    }
  | {
      readonly requestId: string;
      readonly status: 'cancelled' | 'detached';
    }
  | {
      readonly requestId: string;
      readonly status: 'committed';
      readonly projection: AgentDraftSubmitProjection;
    }
  | {
      readonly requestId: string;
      readonly status: 'mentions';
      readonly projection: AgentDraftMentionSearchProjection;
    };

export interface OpenNekoAgentLaunchBridge {
  readonly agentLaunch: {
    attach(
      workbenchInstanceId: string,
      agentSurfaceId: string,
      viewId: string,
      draft: AgentDraftInteractionProjection,
    ): Promise<Extract<AgentLaunchHostResult, { readonly status: 'ready' | 'unavailable' }>>;
    authorizeResource(
      connection: AgentLaunchConnectionIdentity,
      resourceKind: AgentLaunchResourceKind,
    ): Promise<AgentLaunchCatalogProjection | undefined>;
    bindTarget(
      connection: AgentLaunchConnectionIdentity,
      binding: AgentDomainBinding,
    ): Promise<AgentLaunchCatalogProjection>;
    bindAssistant(connection: AgentLaunchConnectionIdentity): Promise<AgentLaunchCatalogProjection>;
    updateConfiguration(
      connection: AgentLaunchConnectionIdentity,
      configuration: AgentConfigurationRequest,
    ): Promise<AgentLaunchCatalogProjection>;
    searchWorkspaceMentions(
      connection: AgentLaunchConnectionIdentity,
      bindingReceiptId: string,
      filter: string,
    ): Promise<AgentDraftMentionSearchProjection>;
    submitDraft(
      connection: AgentLaunchConnectionIdentity,
      input: AgentDraftSubmitInput,
    ): Promise<AgentDraftSubmitProjection>;
    detach(connection: AgentLaunchConnectionIdentity): Promise<void>;
  };
}

export function parseAgentLaunchHostRequest(value: unknown): AgentLaunchHostRequest {
  const record = requireRecord(value);
  const requestId = requireIdentity(record['requestId'], 'request');
  if (record['operation'] === 'attach') {
    requireExactKeys(record, [
      'requestId',
      'operation',
      'workbenchInstanceId',
      'agentSurfaceId',
      'viewId',
      'draft',
    ]);
    return {
      requestId,
      operation: 'attach',
      workbenchInstanceId: requireIdentity(record['workbenchInstanceId'], 'Workbench'),
      agentSurfaceId: requireIdentity(record['agentSurfaceId'], 'Agent Surface'),
      viewId: requireIdentity(record['viewId'], 'View'),
      draft: parseAgentDraftInteractionProjection(record['draft']),
    };
  }
  if (record['operation'] === 'authorize-resource') {
    requireExactKeys(record, ['requestId', 'operation', 'connection', 'resourceKind']);
    const resourceKind = parseResourceKind(record['resourceKind']);
    return {
      requestId,
      operation: 'authorize-resource',
      connection: parseAgentLaunchConnectionIdentity(record['connection']),
      resourceKind,
    };
  }
  if (record['operation'] === 'update-configuration') {
    requireExactKeys(record, ['requestId', 'operation', 'connection', 'configuration']);
    return {
      requestId,
      operation: 'update-configuration',
      connection: parseAgentLaunchConnectionIdentity(record['connection']),
      configuration: parseAgentConfigurationRequest(record['configuration']),
    };
  }
  if (record['operation'] === 'bind-target') {
    requireExactKeys(record, ['requestId', 'operation', 'connection', 'binding']);
    return {
      requestId,
      operation: 'bind-target',
      connection: parseAgentLaunchConnectionIdentity(record['connection']),
      binding: parseAgentDomainBinding(record['binding']),
    };
  }
  if (record['operation'] === 'bind-assistant') {
    requireExactKeys(record, ['requestId', 'operation', 'connection']);
    return {
      requestId,
      operation: 'bind-assistant',
      connection: parseAgentLaunchConnectionIdentity(record['connection']),
    };
  }
  if (record['operation'] === 'search-workspace-mentions') {
    requireExactKeys(record, [
      'requestId',
      'operation',
      'connection',
      'bindingReceiptId',
      'filter',
    ]);
    if (typeof record['filter'] !== 'string') {
      throw new Error('Agent launch Host mention search filter must be a string.');
    }
    return {
      requestId,
      operation: 'search-workspace-mentions',
      connection: parseAgentLaunchConnectionIdentity(record['connection']),
      bindingReceiptId: requireIdentity(record['bindingReceiptId'], 'binding receipt'),
      filter: record['filter'],
    };
  }
  if (record['operation'] === 'submit-draft') {
    requireExactKeys(record, ['requestId', 'operation', 'connection', 'input']);
    return {
      requestId,
      operation: 'submit-draft',
      connection: parseAgentLaunchConnectionIdentity(record['connection']),
      input: parseAgentDraftSubmitInput(record['input']),
    };
  }
  if (record['operation'] === 'detach') {
    requireExactKeys(record, ['requestId', 'operation', 'connection']);
    return {
      requestId,
      operation: 'detach',
      connection: parseAgentLaunchConnectionIdentity(record['connection']),
    };
  }
  throw new Error(`Unknown Agent launch Host operation '${String(record['operation'])}'.`);
}

export function parseAgentLaunchHostResult(
  value: unknown,
  expectedRequestId: string,
): AgentLaunchHostResult {
  const record = requireRecord(value);
  const requestId = requireIdentity(record['requestId'], 'response request');
  if (requestId !== expectedRequestId)
    throw new Error('Agent launch Host request identity mismatch.');
  if (record['status'] === 'ready') {
    requireExactKeys(record, ['requestId', 'status', 'catalog']);
    return {
      requestId,
      status: 'ready',
      catalog: parseAgentLaunchCatalogProjection(record['catalog']),
    };
  }
  if (record['status'] === 'unavailable') {
    requireExactKeys(record, ['requestId', 'status', 'diagnostic']);
    return {
      requestId,
      status: 'unavailable',
      diagnostic: parseAgentAvailabilityDiagnostic(record['diagnostic']),
    };
  }
  if (record['status'] === 'cancelled' || record['status'] === 'detached') {
    requireExactKeys(record, ['requestId', 'status']);
    return {
      requestId,
      status: record['status'],
    };
  }
  if (record['status'] === 'committed') {
    requireExactKeys(record, ['requestId', 'status', 'projection']);
    return {
      requestId,
      status: 'committed',
      projection: parseAgentDraftSubmitProjection(record['projection']),
    };
  }
  if (record['status'] === 'mentions') {
    requireExactKeys(record, ['requestId', 'status', 'projection']);
    return {
      requestId,
      status: 'mentions',
      projection: parseAgentDraftMentionSearchProjection(record['projection']),
    };
  }
  throw new Error(`Unknown Agent launch Host result '${String(record['status'])}'.`);
}

function parseResourceKind(value: unknown): AgentLaunchResourceKind {
  if (value !== 'file' && value !== 'directory' && value !== 'microphone') {
    throw new Error(`Unknown Agent launch authorization kind '${String(value)}'.`);
  }
  return value;
}

function requireRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Agent launch Host payload must be an object.');
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error('Agent launch Host payload contains unsupported fields.');
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Agent launch Host ${label} identity is required.`);
  }
  return value;
}
