import {
  parseCharacterCreationSourceSelection,
  parseCharacterDefinition,
  type CharacterCreationSourceSelection,
  type CharacterDefinition,
} from '@neko/chara-domain/contracts';
import { parseWorldAuthoringCommand, type WorldDefinition } from '@neko/world-domain/contracts';
import {
  parseProjectLocalTargetRef,
  projectLocalTargetKey,
  type ProjectLocalTargetRef,
} from './project-target';
import type {
  ProjectLocalAuthoringOutcome,
  ProjectLocalCharacterEntitySelection,
} from './project-local-authoring';

export const PROJECT_LOCAL_AUTHORING_HOST_CHANNEL = 'openneko:project:local-authoring' as const;

export interface ProjectLocalAuthoringHostBinding {
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly projectId: string;
}

export type ProjectLocalAuthoringCreateInput =
  | {
      readonly kind: 'character-project';
      readonly characterProjectId: string;
      readonly displayName: string;
      readonly draft: CharacterDefinition;
      readonly sources: CharacterCreationSourceSelection;
      readonly entity: ProjectLocalCharacterEntitySelection;
    }
  | {
      readonly kind: 'world-project';
      readonly worldProjectId: string;
      readonly title: string;
      readonly draft: WorldDefinition;
    };

export interface ProjectLocalAuthoringCreateHostRequest extends ProjectLocalAuthoringHostBinding {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly operation: 'create-local-target';
  readonly input: ProjectLocalAuthoringCreateInput;
}

export type ProjectLocalAuthoringHostRequest = ProjectLocalAuthoringCreateHostRequest;

export type ProjectLocalAuthoringHostResult = ProjectLocalAuthoringHostBinding &
  Readonly<{ requestId: string }> &
  ProjectLocalAuthoringOutcome;

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
    'projectId',
    'input',
  ]);
  const requestId = identity(record['requestId'], 'request');
  const common = {
    requestId,
    rendererSessionId: identity(record['rendererSessionId'], 'Renderer session'),
    windowId: identity(record['windowId'], 'Window'),
    workspaceId: identity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: identity(record['workspaceGrantId'], 'Workspace grant'),
    projectId: identity(record['projectId'], 'Project'),
  };
  if (record['operation'] === 'create-local-target') {
    return {
      ...common,
      operation: 'create-local-target',
      input: parseCreateInput(record['input']),
    };
  }
  throw new Error(`Unknown Project local authoring operation '${String(record['operation'])}'.`);
}

export function parseProjectLocalAuthoringHostResult(
  value: unknown,
  expectedRequestId: string,
  expectedBinding: ProjectLocalAuthoringHostBinding,
  expectedTarget: ProjectLocalTargetRef,
): ProjectLocalAuthoringHostResult {
  const record = exactRecord(value, [
    'requestId',
    'workspaceId',
    'workspaceGrantId',
    'projectId',
    'status',
    'target',
  ]);
  const status = record['status'];
  if (status !== 'created') {
    throw new Error(`Unknown Project local authoring result status '${String(status)}'.`);
  }
  const common = {
    requestId: identity(record['requestId'], 'request'),
    workspaceId: identity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: identity(record['workspaceGrantId'], 'Workspace grant'),
    projectId: identity(record['projectId'], 'Project'),
  };
  if (common.requestId !== expectedRequestId) {
    throw new Error('Project local authoring response request identity mismatch.');
  }
  for (const key of ['workspaceId', 'workspaceGrantId', 'projectId'] as const) {
    if (common[key] !== expectedBinding[key]) {
      throw new Error(`Project local authoring response ${key} mismatch.`);
    }
  }
  const target = parseProjectLocalTargetRef(record['target']);
  if (projectLocalTargetKey(target) !== projectLocalTargetKey(expectedTarget)) {
    throw new Error('Project local authoring response target identity mismatch.');
  }
  return { ...common, status, target };
}

function parseCreateInput(value: unknown): ProjectLocalAuthoringCreateInput {
  const record = objectValue(value);
  if (record['kind'] === 'character-project') {
    const input = exactRecord(value, [
      'kind',
      'characterProjectId',
      'displayName',
      'draft',
      'sources',
      'entity',
    ]);
    return {
      kind: 'character-project',
      characterProjectId: requireIdentity(input['characterProjectId'], 'CharacterProject'),
      displayName: requireIdentity(input['displayName'], 'Character display name'),
      draft: parseCharacterDefinition(input['draft']),
      sources: parseCharacterCreationSourceSelection(input['sources']),
      entity: parseCharacterEntitySelection(input['entity']),
    };
  }
  if (record['kind'] === 'world-project') {
    const input = exactRecord(value, ['kind', 'worldProjectId', 'title', 'draft']);
    const command = parseWorldAuthoringCommand({
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

function parseCharacterEntitySelection(value: unknown): ProjectLocalCharacterEntitySelection {
  const record = objectValue(value);
  if (record['kind'] === 'create') {
    const selection = exactRecord(value, ['kind', 'entityId', 'name']);
    return {
      kind: 'create',
      entityId: identity(selection['entityId'], 'Project Entity'),
      name: identity(selection['name'], 'Project Entity name'),
    };
  }
  if (record['kind'] === 'existing') {
    const selection = exactRecord(value, ['kind', 'entityId']);
    return {
      kind: 'existing',
      entityId: identity(selection['entityId'], 'Project Entity'),
    };
  }
  throw new Error(`Unknown Project Entity selection '${String(record['kind'])}'.`);
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

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} identity is required.`);
  }
  return value;
}
