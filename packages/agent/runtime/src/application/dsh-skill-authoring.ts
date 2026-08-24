import type { AgentConversationContext } from '@neko/agent-contracts';
import type {
  CreateDshSkillInput,
  CreateDshSkillResult,
  DshSkillAuthoringLayout,
} from '@neko/agent-contracts/dsh-skill-authoring';
import type { DshAcpSkillObservationProjection } from '@neko/agent-contracts/dsh-acp';

export type DshSkillAuthoringTarget =
  | {
      readonly kind: 'personal';
      readonly assistantSpaceId: string;
      readonly expectedSource: 'user-dsh';
    }
  | {
      readonly kind: 'workspace';
      readonly workspaceId: string;
      readonly workspaceGrantId: string;
      readonly expectedSource: 'project-agents';
    };

export interface DshSkillAuthoringStagingRef {
  readonly stagingId: string;
}

export interface DshSkillAuthoringTargetPort {
  resolve(context: AgentConversationContext): Promise<DshSkillAuthoringTarget>;
}

export interface DshSkillAuthoringStagingPort {
  stage(
    target: DshSkillAuthoringTarget,
    input: CreateDshSkillInput,
    signal: AbortSignal,
  ): Promise<DshSkillAuthoringStagingRef>;
  publish(
    input: {
      readonly staging: DshSkillAuthoringStagingRef;
      readonly target: DshSkillAuthoringTarget;
      readonly name: string;
      readonly layout: DshSkillAuthoringLayout;
    },
    signal: AbortSignal,
  ): Promise<void>;
  discard(staging: DshSkillAuthoringStagingRef): Promise<void>;
}

export interface DshSkillAuthoringValidationPort {
  validate(
    staging: DshSkillAuthoringStagingRef,
    layout: DshSkillAuthoringLayout,
    signal: AbortSignal,
  ): Promise<{ readonly name: string }>;
}

export interface DshSkillAuthoringCatalogPort {
  observe(
    sessionId: string,
    name: string,
    signal: AbortSignal,
  ): Promise<DshAcpSkillObservationProjection>;
}

export class DshSkillAuthoringService {
  constructor(
    private readonly options: {
      readonly targets: DshSkillAuthoringTargetPort;
      readonly staging: DshSkillAuthoringStagingPort;
      readonly validation: DshSkillAuthoringValidationPort;
      readonly catalog: DshSkillAuthoringCatalogPort;
    },
  ) {}

  async create(input: {
    readonly sessionId: string;
    readonly context: AgentConversationContext;
    readonly package: CreateDshSkillInput;
    readonly signal: AbortSignal;
  }): Promise<CreateDshSkillResult> {
    input.signal.throwIfAborted();
    const target = await this.options.targets.resolve(input.context);
    input.signal.throwIfAborted();
    const staging = await this.options.staging.stage(target, input.package, input.signal);
    let result: CreateDshSkillResult | undefined;
    let operationFailure: unknown;
    try {
      const validated = await this.options.validation.validate(
        staging,
        input.package.layout,
        input.signal,
      );
      input.signal.throwIfAborted();
      await this.options.staging.publish(
        {
          staging,
          target,
          name: validated.name,
          layout: input.package.layout,
        },
        input.signal,
      );
      const observation = await this.options.catalog.observe(
        input.sessionId,
        validated.name,
        input.signal,
      );
      if (!observation.complete || observation.skill === undefined) {
        result = {
          status: 'created-pending-discovery',
          name: validated.name,
          layout: input.package.layout,
        };
      } else if (observation.skill.source !== target.expectedSource) {
        result = {
          status: 'created-shadowed',
          name: validated.name,
          layout: input.package.layout,
          source: observation.skill.source,
          provider: observation.skill.provider,
        };
      } else {
        result = {
          status: 'ready',
          name: validated.name,
          layout: input.package.layout,
          source: observation.skill.source,
          provider: observation.skill.provider,
        };
      }
    } catch (error) {
      operationFailure = error;
    }
    try {
      await this.options.staging.discard(staging);
    } catch (cleanupFailure) {
      if (operationFailure !== undefined) {
        throw new AggregateError(
          [operationFailure, cleanupFailure],
          'DSH Skill authoring failed and staging cleanup also failed.',
        );
      }
      throw cleanupFailure;
    }
    if (operationFailure !== undefined) throw operationFailure;
    if (result === undefined) throw new Error('DSH Skill authoring completed without a result.');
    return result;
  }
}
