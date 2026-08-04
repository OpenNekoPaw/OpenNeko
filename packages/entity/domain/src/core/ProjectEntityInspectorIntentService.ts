import { ProjectEntityContractError, type ProjectEntityInspectorIntent } from '../contracts/index';
import type { ProjectEntityOperationService } from './ProjectEntityOperationService';

type Intent<Type extends ProjectEntityInspectorIntent['type']> = Extract<
  ProjectEntityInspectorIntent,
  { readonly type: Type }
>;

export interface ProjectEntityInspectorLifecyclePort {
  merge(intent: Intent<'merge'>, signal?: AbortSignal): Promise<void>;
  deprecate(intent: Intent<'deprecate'>, signal?: AbortSignal): Promise<void>;
}

export interface ProjectEntityInspectorAssetPort {
  instantiate(intent: Intent<'instantiate'>, signal?: AbortSignal): Promise<void>;
  publish(intent: Intent<'publish'>, signal?: AbortSignal): Promise<void>;
  diff(intent: Intent<'diff'>, signal?: AbortSignal): Promise<void>;
  applyUpdate(intent: Intent<'apply-update'>, signal?: AbortSignal): Promise<void>;
}

export interface ProjectEntityInspectorInteractionPort {
  reference(intent: Intent<'reference'>, signal?: AbortSignal): Promise<void>;
  startCharacterDialogue(intent: Intent<'character-dialogue'>, signal?: AbortSignal): Promise<void>;
  openRoom(intent: Intent<'room-open'>, signal?: AbortSignal): Promise<void>;
  embodyCharacter(intent: Intent<'character-embody'>, signal?: AbortSignal): Promise<void>;
}

export interface ProjectEntityInspectorIntentServiceOptions {
  readonly operations: Pick<
    ProjectEntityOperationService,
    'confirmCandidate' | 'edit' | 'bind' | 'unbind'
  >;
  readonly lifecycle?: ProjectEntityInspectorLifecyclePort;
  readonly assets?: ProjectEntityInspectorAssetPort;
  readonly interactions?: ProjectEntityInspectorInteractionPort;
  readonly createEntityId: (candidateId: string) => string;
  readonly createBindingId: (entityId: string) => string;
  readonly now: () => string;
}

export class ProjectEntityInspectorIntentService {
  constructor(private readonly options: ProjectEntityInspectorIntentServiceOptions) {}

  async execute(intent: ProjectEntityInspectorIntent, signal?: AbortSignal): Promise<void> {
    switch (intent.type) {
      case 'confirm': {
        const createdAt = this.options.now();
        await this.options.operations.confirmCandidate(
          {
            expectedRevision: intent.expectedRevision,
            candidateId: intent.candidateId,
            entityId: this.options.createEntityId(intent.candidateId),
            semantic: {
              kind: intent.accepted.kind,
              names: intent.accepted.names,
              facts: intent.accepted.facts,
              representations: [],
            },
            createdAt,
          },
          signal,
        );
        return;
      }
      case 'edit':
        await this.options.operations.edit({ ...intent, updatedAt: this.options.now() }, signal);
        return;
      case 'bind': {
        const acceptedAt = this.options.now();
        await this.options.operations.bind(
          {
            expectedRevision: intent.expectedRevision,
            entityId: intent.entityId,
            binding: {
              bindingId: this.options.createBindingId(intent.entityId),
              ...intent.binding,
              source: 'user',
              acceptedAt,
            },
            updatedAt: acceptedAt,
          },
          signal,
        );
        return;
      }
      case 'unbind':
        await this.options.operations.unbind({ ...intent, updatedAt: this.options.now() }, signal);
        return;
      case 'merge':
        await requirePort(this.options.lifecycle, intent.type).merge(intent, signal);
        return;
      case 'deprecate':
        await requirePort(this.options.lifecycle, intent.type).deprecate(intent, signal);
        return;
      case 'instantiate':
        await requirePort(this.options.assets, intent.type).instantiate(intent, signal);
        return;
      case 'publish':
        await requirePort(this.options.assets, intent.type).publish(intent, signal);
        return;
      case 'diff':
        await requirePort(this.options.assets, intent.type).diff(intent, signal);
        return;
      case 'apply-update':
        await requirePort(this.options.assets, intent.type).applyUpdate(intent, signal);
        return;
      case 'reference':
        await requirePort(this.options.interactions, intent.type).reference(intent, signal);
        return;
      case 'character-dialogue':
        await requirePort(this.options.interactions, intent.type).startCharacterDialogue(
          intent,
          signal,
        );
        return;
      case 'room-open':
        await requirePort(this.options.interactions, intent.type).openRoom(intent, signal);
        return;
      case 'character-embody':
        await requirePort(this.options.interactions, intent.type).embodyCharacter(intent, signal);
    }
  }
}

function requirePort<Port>(port: Port | undefined, operation: string): Port {
  if (port) return port;
  throw new ProjectEntityContractError([
    {
      code: 'project-entity-operation-invalid',
      message: `Project Entity operation '${operation}' has no configured owner.`,
    },
  ]);
}
