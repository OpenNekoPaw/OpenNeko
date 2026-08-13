import {
  createCharacterFoundationCommandHostRequest,
  type CharacterCreationSourceSelection,
  type CharacterDefinition,
} from '@neko/chara/contracts';
import {
  createWorldFoundationCommandHostRequest,
  type WorldDefinition,
} from '@neko/world/contracts';
import {
  parseProjectLocalTargetRef,
  projectLocalTargetKey,
  type ProjectLocalTargetRef,
} from './project-target';
import type {
  ProjectLocalAuthoringOutcome,
  ProjectLocalCharacterCreationReceipt,
  ProjectLocalCharacterCreationStep,
  ProjectLocalCharacterEntitySelection,
} from './project-local-authoring';

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

export interface ProjectLocalAuthoringRetryHostRequest extends ProjectLocalAuthoringHostBinding {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly operation: 'retry-local-character';
  readonly input: {
    readonly receipt: ProjectLocalCharacterCreationReceipt;
    readonly entity: ProjectLocalCharacterEntitySelection;
  };
}

export type ProjectLocalAuthoringHostRequest =
  ProjectLocalAuthoringCreateHostRequest | ProjectLocalAuthoringRetryHostRequest;

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
    retryCharacter(
      windowId: string,
      binding: ProjectLocalAuthoringHostBinding,
      receipt: ProjectLocalCharacterCreationReceipt,
      entity: ProjectLocalCharacterEntitySelection,
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

export function createProjectLocalAuthoringRetryHostRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: ProjectLocalAuthoringHostBinding;
  readonly receipt: ProjectLocalCharacterCreationReceipt;
  readonly entity: ProjectLocalCharacterEntitySelection;
}): ProjectLocalAuthoringRetryHostRequest {
  const request = parseProjectLocalAuthoringHostRequest({
    requestId: input.requestId,
    rendererSessionId: input.rendererSessionId,
    windowId: input.windowId,
    operation: 'retry-local-character',
    ...input.binding,
    input: { receipt: input.receipt, entity: input.entity },
  });
  if (request.operation !== 'retry-local-character') {
    throw new Error('Project local authoring owner returned another retry operation.');
  }
  return request;
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
  const requestId = identity(record['requestId'], 'request');
  const common = {
    requestId,
    rendererSessionId: identity(record['rendererSessionId'], 'Renderer session'),
    windowId: identity(record['windowId'], 'Window'),
    workspaceId: identity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: identity(record['workspaceGrantId'], 'Workspace grant'),
    contentProjectId: identity(record['contentProjectId'], 'Content Project'),
  };
  if (record['operation'] === 'create-local-target') {
    return {
      ...common,
      operation: 'create-local-target',
      input: parseCreateInput(record['input'], requestId),
    };
  }
  if (record['operation'] === 'retry-local-character') {
    const retry = exactRecord(record['input'], ['receipt', 'entity']);
    const receipt = parsePartialCharacterCreationReceipt(retry['receipt']);
    if (
      receipt.authority.workspaceId !== common.workspaceId ||
      receipt.authority.contentProjectId !== common.contentProjectId
    ) {
      throw new Error('Project local authoring retry receipt authority mismatch.');
    }
    return {
      ...common,
      operation: 'retry-local-character',
      input: {
        receipt,
        entity: parseCharacterEntitySelection(retry['entity']),
      },
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
  const status = objectValue(value)['status'];
  const record = exactRecord(
    value,
    status === 'incomplete'
      ? [
          'requestId',
          'workspaceId',
          'workspaceGrantId',
          'contentProjectId',
          'status',
          'target',
          'receipt',
        ]
      : ['requestId', 'workspaceId', 'workspaceGrantId', 'contentProjectId', 'status', 'target'],
  );
  if (status !== 'created' && status !== 'incomplete') {
    throw new Error(`Unknown Project local authoring result status '${String(status)}'.`);
  }
  const common = {
    requestId: identity(record['requestId'], 'request'),
    workspaceId: identity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: identity(record['workspaceGrantId'], 'Workspace grant'),
    contentProjectId: identity(record['contentProjectId'], 'Content Project'),
  };
  if (common.requestId !== expectedRequestId) {
    throw new Error('Project local authoring response request identity mismatch.');
  }
  for (const key of ['workspaceId', 'workspaceGrantId', 'contentProjectId'] as const) {
    if (common[key] !== expectedBinding[key]) {
      throw new Error(`Project local authoring response ${key} mismatch.`);
    }
  }
  const target = parseProjectLocalTargetRef(record['target']);
  if (projectLocalTargetKey(target) !== projectLocalTargetKey(expectedTarget)) {
    throw new Error('Project local authoring response target identity mismatch.');
  }
  if (status === 'created') return { ...common, status, target };
  if (target.kind !== 'character-project') {
    throw new Error('Only Project-local Character creation can return an incomplete receipt.');
  }
  const receipt = parsePartialCharacterCreationReceipt(record['receipt']);
  if (
    receipt.authority.workspaceId !== common.workspaceId ||
    receipt.authority.contentProjectId !== common.contentProjectId ||
    receipt.target.characterProjectId !== target.characterProjectId
  ) {
    throw new Error('Project local authoring receipt identity mismatch.');
  }
  return { ...common, status, target, receipt };
}

function parseCreateInput(value: unknown, requestId: string): ProjectLocalAuthoringCreateInput {
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
    const command = createCharacterFoundationCommandHostRequest(requestId, {
      operation: 'character-project-create',
      input: {
        characterProjectId: input['characterProjectId'] as string,
        displayName: input['displayName'] as string,
        draft: input['draft'] as CharacterDefinition,
        sources: input['sources'] as CharacterCreationSourceSelection,
      },
    });
    if (command.operation !== 'character-project-create') {
      throw new Error('Character owner returned another create operation.');
    }
    return {
      kind: 'character-project',
      ...command.input,
      entity: parseCharacterEntitySelection(input['entity']),
    };
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

function parsePartialCharacterCreationReceipt(
  value: unknown,
): ProjectLocalCharacterCreationReceipt & {
  readonly nextStep: Exclude<ProjectLocalCharacterCreationStep, 'character-project'>;
} {
  const record = exactRecord(value, [
    'authority',
    'target',
    'entityId',
    'completedSteps',
    'nextStep',
  ]);
  const authority = exactRecord(record['authority'], ['contentProjectId', 'workspaceId']);
  const target = parseProjectLocalTargetRef(record['target']);
  if (target.kind !== 'character-project') {
    throw new Error('Project-local Character receipt requires a CharacterProject target.');
  }
  const allSteps: readonly ProjectLocalCharacterCreationStep[] = [
    'character-project',
    'project-entity',
    'entity-character-association',
  ];
  const nextStep = record['nextStep'];
  if (nextStep !== 'project-entity' && nextStep !== 'entity-character-association') {
    throw new Error('Project-local Character receipt has an invalid next step.');
  }
  if (!Array.isArray(record['completedSteps'])) {
    throw new Error('Project-local Character receipt completed steps must be an array.');
  }
  const completedSteps = record['completedSteps'].map((step) => {
    if (!isCharacterCreationStep(step)) {
      throw new Error(`Project-local Character receipt has an invalid step '${String(step)}'.`);
    }
    return step;
  });
  const expectedCompleted = allSteps.slice(0, allSteps.indexOf(nextStep));
  if (
    completedSteps.length !== expectedCompleted.length ||
    completedSteps.some((step, index) => step !== expectedCompleted[index])
  ) {
    throw new Error('Project-local Character receipt is not a canonical partial step prefix.');
  }
  return {
    authority: {
      contentProjectId: identity(authority['contentProjectId'], 'Content Project'),
      workspaceId: identity(authority['workspaceId'], 'Workspace'),
    },
    target,
    entityId: identity(record['entityId'], 'Project Entity'),
    completedSteps,
    nextStep,
  };
}

function isCharacterCreationStep(value: unknown): value is ProjectLocalCharacterCreationStep {
  return (
    value === 'character-project' ||
    value === 'project-entity' ||
    value === 'entity-character-association'
  );
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
