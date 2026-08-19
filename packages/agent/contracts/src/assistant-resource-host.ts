import {
  parseAgentResourceGrant,
  parseAgentScratchArtifactRef,
  type AgentResourceGrant,
  type AgentScratchArtifactRef,
} from './agent-conversation-context';
import {
  parseAuthorizedPreviewSessionProjection,
  type AuthorizedPreviewSessionProjection,
} from '@neko/preview-domain/authorized-session';

export const ASSISTANT_RESOURCE_HOST_CHANNEL = 'neko:agent:assistant-resources' as const;

export interface AssistantResourceIdentity {
  readonly assistantSpaceId: string;
  readonly conversationId: string;
  readonly windowId: string;
}

export interface AssistantResourceProjection {
  readonly identity: AssistantResourceIdentity;
  readonly baseGrants: readonly AgentResourceGrant[];
  readonly scratchArtifacts: readonly AgentScratchArtifactRef[];
}

export type AssistantResourceHostRequest =
  | {
      readonly requestId: string;
      readonly identity: AssistantResourceIdentity;
      readonly route: 'snapshot.get';
    }
  | {
      readonly requestId: string;
      readonly identity: AssistantResourceIdentity;
      readonly route: 'preview.authorize';
      readonly scratchArtifactId: string;
    }
  | {
      readonly requestId: string;
      readonly identity: AssistantResourceIdentity;
      readonly route: 'preview.get' | 'preview.release';
      readonly previewSessionId: string;
    };

export type AssistantResourceHostResult =
  | {
      readonly requestId: string;
      readonly route: 'snapshot.get';
      readonly projection: AssistantResourceProjection;
    }
  | {
      readonly requestId: string;
      readonly route: 'preview.authorize' | 'preview.get';
      readonly preview: AuthorizedPreviewSessionProjection;
    }
  | {
      readonly requestId: string;
      readonly route: 'preview.release';
      readonly status: 'released';
    };

export interface OpenNekoAssistantResourceBridge {
  readonly assistantResources: {
    execute(request: AssistantResourceHostRequest): Promise<AssistantResourceHostResult>;
  };
}

export interface AssistantResourceRuntime {
  readonly identity: AssistantResourceIdentity;
  getSnapshot(): Promise<AssistantResourceProjection>;
  authorizeScratchPreview(scratchArtifactId: string): Promise<AuthorizedPreviewSessionProjection>;
}

export function parseAssistantResourceHostRequest(value: unknown): AssistantResourceHostRequest {
  const record = requireRecord(value, 'Assistant Resource Host request must be an object.');
  const base = {
    requestId: identity(record['requestId'], 'request'),
    identity: parseAssistantResourceIdentity(record['identity']),
  };
  if (record['route'] === 'snapshot.get') {
    exactKeys(record, ['requestId', 'identity', 'route']);
    return { ...base, route: 'snapshot.get' };
  }
  if (record['route'] === 'preview.authorize') {
    exactKeys(record, ['requestId', 'identity', 'route', 'scratchArtifactId']);
    return {
      ...base,
      route: 'preview.authorize',
      scratchArtifactId: identity(record['scratchArtifactId'], 'Scratch artifact'),
    };
  }
  if (record['route'] === 'preview.get' || record['route'] === 'preview.release') {
    exactKeys(record, ['requestId', 'identity', 'route', 'previewSessionId']);
    return {
      ...base,
      route: record['route'],
      previewSessionId: identity(record['previewSessionId'], 'Preview session'),
    };
  }
  throw new Error(`Unknown Assistant Resource Host route '${String(record['route'])}'.`);
}

export function parseAssistantResourceHostResult(
  value: unknown,
  expectedRequestId: string,
): AssistantResourceHostResult {
  const record = requireRecord(value, 'Assistant Resource Host result must be an object.');
  const requestId = identity(record['requestId'], 'response request');
  if (requestId !== expectedRequestId) {
    throw new Error('Assistant Resource Host response request identity mismatch.');
  }
  if (record['route'] === 'snapshot.get') {
    exactKeys(record, ['requestId', 'route', 'projection']);
    return {
      requestId,
      route: 'snapshot.get',
      projection: parseAssistantResourceProjection(record['projection']),
    };
  }
  if (record['route'] === 'preview.authorize' || record['route'] === 'preview.get') {
    exactKeys(record, ['requestId', 'route', 'preview']);
    return {
      requestId,
      route: record['route'],
      preview: parseAuthorizedPreviewSessionProjection(record['preview']),
    };
  }
  if (record['route'] === 'preview.release') {
    exactKeys(record, ['requestId', 'route', 'status']);
    if (record['status'] !== 'released') {
      throw new Error('Assistant Resource Preview release status is invalid.');
    }
    return {
      requestId,
      route: 'preview.release',
      status: 'released',
    };
  }
  throw new Error(`Unknown Assistant Resource Host result route '${String(record['route'])}'.`);
}

export function parseAssistantResourceProjection(value: unknown): AssistantResourceProjection {
  const record = requireRecord(value, 'Assistant Resource projection must be an object.');
  exactKeys(record, ['identity', 'baseGrants', 'scratchArtifacts']);
  if (!Array.isArray(record['baseGrants']) || !Array.isArray(record['scratchArtifacts'])) {
    throw new Error('Assistant Resource projection lists are invalid.');
  }
  return {
    identity: parseAssistantResourceIdentity(record['identity']),
    baseGrants: record['baseGrants'].map(parseAgentResourceGrant),
    scratchArtifacts: record['scratchArtifacts'].map(parseAgentScratchArtifactRef),
  };
}

export function parseAssistantResourceIdentity(value: unknown): AssistantResourceIdentity {
  const record = requireRecord(value, 'Assistant Resource identity must be an object.');
  exactKeys(record, ['assistantSpaceId', 'conversationId', 'windowId']);
  return {
    assistantSpaceId: identity(record['assistantSpaceId'], 'Assistant Space'),
    conversationId: identity(record['conversationId'], 'Conversation'),
    windowId: identity(record['windowId'], 'Window'),
  };
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Readonly<Record<string, unknown>>;
}

function exactKeys(record: Readonly<Record<string, unknown>>, keys: readonly string[]): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error('Assistant Resource Host payload contains unsupported fields.');
  }
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Assistant Resource ${label} identity is required.`);
  }
  return value;
}
