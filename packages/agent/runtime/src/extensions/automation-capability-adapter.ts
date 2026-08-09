import { randomUUID } from 'node:crypto';
import {
  parseAutomationActionApproval,
  parseAutomationProfile,
  parseAutomationSessionGrant,
  parseAutomationTarget,
  type AutomationActionApproval,
  type AutomationProfile,
  type AutomationSessionGrant,
  type AutomationTarget,
} from '@neko/automation-contracts';
import type {
  AutomationActionApprovalProjection,
  AutomationApplicationService,
} from '@neko/automation-node';
import type { Tool, ToolExecuteOptions, ToolParameters } from '@neko/agent-contracts';

export interface AgentAutomationAuthorizationPort {
  authorizeSession(input: {
    readonly sessionId: string;
    readonly profile: AutomationProfile;
    readonly targetKey: string;
    readonly mode: 'observe' | 'browse-read' | 'interact';
    readonly timeoutMs: number;
    readonly stepBudget: number;
    readonly owner: {
      readonly conversationId: string;
      readonly runId: string;
      readonly toolCallId: string;
    };
  }): Promise<{
    readonly target: AutomationTarget;
    readonly grant: AutomationSessionGrant;
  }>;
  authorizeAction?(
    projection: AutomationActionApprovalProjection,
  ): Promise<AutomationActionApproval>;
}

export function createAgentAutomationCapabilityTools(options: {
  readonly profile: unknown;
  readonly service: AutomationApplicationService;
  readonly authorization: AgentAutomationAuthorizationPort;
  readonly createId?: () => string;
}): readonly Tool[] {
  const profile = parseAutomationProfile(options.profile);
  const createId = options.createId ?? randomUUID;
  return Object.freeze(
    profile.operations.map((operation) => {
      const mode = operation.modes[0];
      if (operation.modes.length !== 1 || mode === undefined) {
        throw new Error(
          `Automation operation '${operation.name}' must have one explicit Agent adapter mode.`,
        );
      }
      const tool: Tool = {
        name: createToolName(profile, operation.name),
        description: createToolDescription(profile, operation.name, mode),
        localization: {
          zh: {
            description: `在用户明确授权的目标上通过 ${profile.provider.providerId} 执行已审核的 ${operation.name}；目标、模式、预算和 Tool Call owner 会被冻结。`,
          },
        },
        parameters: AUTOMATION_TOOL_PARAMETERS,
        category: 'system',
        requiresConfirmation: true,
        isReadOnly: operation.trait.readOnly,
        isDestructive: operation.trait.destructive,
        isConcurrencySafe: false,
        traits: {
          cost: 'free',
          reversible: operation.trait.readOnly,
          locality: 'local',
          impactLevel: operation.trait.destructive
            ? 'critical'
            : operation.trait.readOnly
              ? 'low'
              : 'high',
        },
        async execute(args, executionOptions) {
          const input = parseAdapterArguments(args);
          const owner = requireOwner(executionOptions);
          const sessionId = requireCreatedIdentity(createId(), 'session');
          const actionId = requireCreatedIdentity(createId(), 'action');
          const authorized = await options.authorization.authorizeSession({
            sessionId,
            profile,
            targetKey: input.targetKey,
            mode,
            timeoutMs: input.timeoutMs,
            stepBudget: input.stepBudget,
            owner,
          });
          const target = parseAutomationTarget(authorized.target);
          if (target.targetKey !== input.targetKey || target.kind !== profile.provider.kind) {
            throw new Error('Automation Host authorization returned a mismatched exact target.');
          }
          const grant = parseAutomationSessionGrant(authorized.grant);
          await options.service.openSession(
            {
              sessionId,
              profileId: profile.id,
              target,
              mode,
              timeoutMs: input.timeoutMs,
              stepBudget: input.stepBudget,
              owner,
              grant,
            },
            executionOptions?.signal,
          );
          let result;
          let operationError: unknown;
          try {
            const request = {
              actionId,
              sessionId,
              operation: operation.name,
              arguments: input.arguments,
            };
            let approval: AutomationActionApproval | undefined;
            if (operation.trait.requiresApproval) {
              if (!options.authorization.authorizeAction) {
                throw new Error(
                  `Automation operation '${operation.name}' requires an action authorization port.`,
                );
              }
              const projection = await options.service.prepareAction(
                request,
                executionOptions?.signal,
              );
              approval = parseAutomationActionApproval(
                await options.authorization.authorizeAction(projection),
              );
            }
            result = await options.service.executeAction(
              request,
              approval,
              executionOptions?.signal,
            );
          } catch (error) {
            operationError = error;
          }
          let closeError: unknown;
          try {
            await options.service.stopSession(sessionId);
          } catch (error) {
            closeError = error;
          }
          if (operationError !== undefined && closeError !== undefined) {
            throw new AggregateError(
              [operationError, closeError],
              `Automation Tool '${operation.name}' and owned session cleanup failed.`,
            );
          }
          if (operationError !== undefined) throw operationError;
          if (closeError !== undefined) throw closeError;
          if (!result) throw new Error(`Automation Tool '${operation.name}' returned no result.`);
          return {
            success: true,
            data: {
              actionId: result.actionId,
              session: {
                sessionId: result.session.sessionId,
                profileId: result.session.profileId,
                targetKey: result.session.target.targetKey,
                targetLabel: result.session.target.label,
                mode: result.session.mode,
                status: result.session.status,
                remainingSteps: result.session.remainingSteps,
              },
              evidence: result.evidence,
            },
          };
        },
      };
      return Object.freeze(tool);
    }),
  );
}

const AUTOMATION_TOOL_PARAMETERS: ToolParameters = {
  type: 'object',
  properties: {
    targetKey: {
      type: 'string',
      description: 'Opaque user-selected target identity resolved only by the Host authorization.',
    },
    arguments: {
      type: 'object',
      description: 'Reviewed upstream operation arguments. Target routing fields are Host-owned.',
      additionalProperties: true,
    },
    timeoutMs: {
      type: 'integer',
      description: 'Bounded operation timeout in milliseconds.',
      minimum: 1,
      maximum: 120_000,
    },
    stepBudget: {
      type: 'integer',
      description: 'Maximum number of provider actions in this exact session.',
      minimum: 1,
      maximum: 100,
    },
  },
  required: ['targetKey', 'arguments', 'timeoutMs', 'stepBudget'],
  additionalProperties: false,
};

function parseAdapterArguments(value: Readonly<Record<string, unknown>>): {
  readonly targetKey: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly timeoutMs: number;
  readonly stepBudget: number;
} {
  const keys = Object.keys(value);
  if (
    keys.length !== 4 ||
    keys.some((key) => !['targetKey', 'arguments', 'timeoutMs', 'stepBudget'].includes(key))
  ) {
    throw new Error('Automation Tool arguments contain unsupported fields.');
  }
  if (!isRecord(value['arguments'])) {
    throw new Error('Automation Tool operation arguments must be an object.');
  }
  return {
    targetKey: requireInputIdentity(value['targetKey'], 'target'),
    arguments: Object.freeze({ ...value['arguments'] }),
    timeoutMs: boundedInteger(value['timeoutMs'], 1, 120_000, 'timeout'),
    stepBudget: boundedInteger(value['stepBudget'], 1, 100, 'step budget'),
  };
}

function requireOwner(options: ToolExecuteOptions | undefined): {
  readonly conversationId: string;
  readonly runId: string;
  readonly toolCallId: string;
} {
  return {
    conversationId: requireMetadataIdentity(options, 'conversationId'),
    runId: requireMetadataIdentity(options, 'runId'),
    toolCallId: requireMetadataIdentity(options, 'toolCallId'),
  };
}

function requireMetadataIdentity(options: ToolExecuteOptions | undefined, key: string): string {
  const value = options?.metadata?.[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Automation Tool requires exact ${key} execution ownership.`);
  }
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`Automation Tool ${label} is invalid.`);
  }
  return value as number;
}

function requireCreatedIdentity(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)) {
    throw new Error(`Automation Tool ${label} identity is invalid.`);
  }
  return value;
}

function requireInputIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)) {
    throw new Error(`Automation Tool ${label} identity is invalid.`);
  }
  return value;
}

function createToolName(profile: AutomationProfile, operation: string): string {
  return `automation_${profile.provider.providerId}_${operation}`.replace(/[^A-Za-z0-9_-]/gu, '_');
}

function createToolDescription(
  profile: AutomationProfile,
  operation: string,
  mode: string,
): string {
  return `Run reviewed ${operation} through ${profile.provider.providerId} in ${mode} mode on one explicitly authorized target. The target, budget, Tool Call owner and provider selection are frozen.`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
