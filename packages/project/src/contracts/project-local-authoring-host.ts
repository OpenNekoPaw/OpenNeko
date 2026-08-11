import {
  createCharacterFoundationCommandHostRequest,
  type CharacterDefinition,
} from '@neko/chara/contracts';
import {
  createWorldFoundationCommandHostRequest,
  type WorldDefinition,
} from '@neko/world/contracts';
import { parseProjectLocalTargetRef, type ProjectLocalTargetRef } from './project-composition';

export const PROJECT_LOCAL_AUTHORING_HOST_CHANNEL = 'openneko:project:local-authoring' as const;

export interface ProjectLocalAuthoringHostBinding {
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly contentProjectId: string;
}

export type ProjectLocalAuthoringCreateInput =
  | {
      readonly kind: 'character-project';
      readonly characterProjectId: string;
      readonly displayName: string;
      readonly draft: CharacterDefinition;
    }
  | {
      readonly kind: 'world-project';
      readonly worldProjectId: string;
      readonly title: string;
      readonly draft: WorldDefinition;
    };

export interface ProjectLocalAuthoringHostRequest extends ProjectLocalAuthoringHostBinding {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly operation: 'create-local-target';
  readonly input: ProjectLocalAuthoringCreateInput;
}

export interface ProjectLocalAuthoringHostResult extends ProjectLocalAuthoringHostBinding {
  readonly requestId: string;
  readonly target: ProjectLocalTargetRef;
}

export interface OpenNekoDesktopProjectLocalAuthoringBridge {
  readonly projectLocalAuthoring: {
    createTarget(
      windowId: string,
      binding: ProjectLocalAuthoringHostBinding,
      input: ProjectLocalAuthoringCreateInput,
    ): Promise<ProjectLocalAuthoringHostResult>;
  };
}

export function createProjectLocalAuthoringHostRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: ProjectLocalAuthoringHostBinding;
  readonly create: ProjectLocalAuthoringCreateInput;
}): ProjectLocalAuthoringHostRequest {
  return parseProjectLocalAuthoringHostRequest({
    requestId: input.requestId,
    rendererSessionId: input.rendererSessionId,
    windowId: input.windowId,
    operation: 'create-local-target',
    ...input.binding,
    input: input.create,
  });
}

export function parseProjectLocalAuthoringHostRequest(
  value: unknown,
): ProjectLocalAuthoringHostRequest {
  const record = exactRecord(value, [
    'requestId',
    'rendererSessionId',
    'windowId',
    'operation',
    'workspaceId',
    'workspaceGrantId',
    'contentProjectId',
    'input',
  ]);
  if (record['operation'] !== 'create-local-target') {
    throw new Error(`Unknown Project local authoring operation '${String(record['operation'])}'.`);
  }
  const requestId = identity(record['requestId'], 'request');
  return {
    requestId,
    rendererSessionId: identity(record['rendererSessionId'], 'Renderer session'),
    windowId: identity(record['windowId'], 'Window'),
    operation: 'create-local-target',
    workspaceId: identity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: identity(record['workspaceGrantId'], 'Workspace grant'),
    contentProjectId: identity(record['contentProjectId'], 'Content Project'),
    input: parseCreateInput(record['input'], requestId),
  };
}

export function parseProjectLocalAuthoringHostResult(
  value: unknown,
  expectedRequestId: string,
  expectedBinding: ProjectLocalAuthoringHostBinding,
): ProjectLocalAuthoringHostResult {
  const record = exactRecord(value, [
    'requestId',
    'workspaceId',
    'workspaceGrantId',
    'contentProjectId',
    'target',
  ]);
  const result = {
    requestId: identity(record['requestId'], 'request'),
    workspaceId: identity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: identity(record['workspaceGrantId'], 'Workspace grant'),
    contentProjectId: identity(record['contentProjectId'], 'Content Project'),
    target: parseProjectLocalTargetRef(record['target']),
  };
  if (result.requestId !== expectedRequestId) {
    throw new Error('Project local authoring response request identity mismatch.');
  }
  for (const key of ['workspaceId', 'workspaceGrantId', 'contentProjectId'] as const) {
    if (result[key] !== expectedBinding[key]) {
      throw new Error(`Project local authoring response ${key} mismatch.`);
    }
  }
  return result;
}

function parseCreateInput(value: unknown, requestId: string): ProjectLocalAuthoringCreateInput {
  const record = objectValue(value);
  if (record['kind'] === 'character-project') {
    const input = exactRecord(value, ['kind', 'characterProjectId', 'displayName', 'draft']);
    const command = createCharacterFoundationCommandHostRequest(requestId, {
      operation: 'character-project-create',
      input: {
        characterProjectId: input['characterProjectId'] as string,
        displayName: input['displayName'] as string,
        draft: input['draft'] as CharacterDefinition,
      },
    });
    if (command.operation !== 'character-project-create') {
      throw new Error('Character owner returned another create operation.');
    }
    return { kind: 'character-project', ...command.input };
  }
  if (record['kind'] === 'world-project') {
    const input = exactRecord(value, ['kind', 'worldProjectId', 'title', 'draft']);
    const command = createWorldFoundationCommandHostRequest(requestId, {
      operation: 'world-project-create',
      input: {
        worldProjectId: input['worldProjectId'] as string,
        title: input['title'] as string,
        draft: input['draft'] as WorldDefinition,
      },
    });
    if (command.operation !== 'world-project-create') {
      throw new Error('World owner returned another create operation.');
    }
    return { kind: 'world-project', ...command.input };
  }
  throw new Error(`Unknown Project local authoring target '${String(record['kind'])}'.`);
}

function exactRecord(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  const record = objectValue(value);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('Project local authoring payload has unknown or missing fields.');
  }
  return record;
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Project local authoring payload must be an object.');
  }
  return value as Readonly<Record<string, unknown>>;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} identity is required.`);
  }
  return value;
}
