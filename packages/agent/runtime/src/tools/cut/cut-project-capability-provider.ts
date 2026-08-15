import {
  TOOL_NAMES_CUT,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type PromptFragment,
  type Tool,
  type ToolParameters,
  type ToolResult,
} from '@neko/agent-contracts';
import { isContentFingerprint } from '@neko/content';
import { isCutCommand, type CutCommand, type CutProjectAuthoringService } from '@neko/cut-domain';

export function createCutProjectCapabilityProvider(
  service: CutProjectAuthoringService,
): AgentCapabilityProvider {
  return new CutProjectCapabilityProvider(service);
}

class CutProjectCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-cut-project-authoring';
  readonly hostRequirements = [{ host: 'desktop' as const }];
  readonly requirements = { contentAccess: true, writableProject: true } as const;

  constructor(private readonly service: CutProjectAuthoringService) {}

  getPromptFragments(_context: AgentCapabilityContext): PromptFragment[] {
    return [
      {
        id: 'neko-cut:structured-project-authoring',
        priority: 72,
        content:
          'Cut .otio documents use the Cut timeline query and command operations. Query the exact Workspace-relative document before mutation and pass its exact fingerprint. Use stable Track and Clip identities; never infer targets from playhead or active UI state, and never use generic file or shell operations for .otio.',
        locales: {
          zh: {
            content:
              'Cut .otio 文档只使用 Cut 时间线查询与命令操作。修改前查询精确的 Workspace 相对文档并传回其 fingerprint；使用稳定 Track/Clip identity，不得从 playhead 或 active UI 推断目标，也不得对 .otio 使用通用文件或 shell 操作。',
          },
        },
      },
    ];
  }

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [this.queryTimelineTool(), this.applyCommandsTool()];
  }

  private queryTimelineTool(): Tool {
    return {
      name: TOOL_NAMES_CUT.CUT_QUERY_TIMELINE,
      description:
        'Query one exact Workspace-relative Cut .otio timeline with stable Track/Clip identities and current fingerprint.',
      category: 'timeline',
      isReadOnly: true,
      isConcurrencySafe: true,
      safetyKind: 'read-only-query',
      parameters: documentParameters(false),
      execute: async (args, options): Promise<ToolResult> => {
        try {
          return {
            success: true,
            data: await this.service.query({
              documentPath: requireString(args['document_path'], 'document_path'),
              ...(options?.signal ? { signal: options.signal } : {}),
            }),
          };
        } catch (error) {
          return failed(TOOL_NAMES_CUT.CUT_QUERY_TIMELINE, error);
        }
      },
    };
  }

  private applyCommandsTool(): Tool {
    return {
      name: TOOL_NAMES_CUT.CUT_APPLY_COMMANDS,
      description:
        'Apply one validated batch of Cut domain commands to an exact .otio document using its current fingerprint.',
      category: 'timeline',
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
      requirements: { writableProject: true, authoringTargetKind: 'content-document' },
      queryBeforeMutate: {
        preferredQueryTools: [TOOL_NAMES_CUT.CUT_QUERY_TIMELINE],
        reason:
          'Resolve stable Track/Clip identities and the current Cut fingerprint before mutation.',
      },
      parameters: documentParameters(true),
      execute: async (args, options): Promise<ToolResult> => {
        try {
          const fingerprint = args['expected_fingerprint'];
          if (!isContentFingerprint(fingerprint))
            throw new Error('expected_fingerprint is invalid.');
          const commands = args['commands'];
          if (!Array.isArray(commands) || commands.length === 0 || !commands.every(isCutCommand)) {
            throw new Error('commands must contain supported Cut command objects.');
          }
          return {
            success: true,
            data: await this.service.apply({
              documentPath: requireString(args['document_path'], 'document_path'),
              expectedFingerprint: fingerprint,
              commands: commands satisfies readonly CutCommand[],
              ...(options?.signal ? { signal: options.signal } : {}),
            }),
          };
        } catch (error) {
          return failed(TOOL_NAMES_CUT.CUT_APPLY_COMMANDS, error);
        }
      },
    };
  }
}

function documentParameters(mutation: boolean): ToolParameters {
  return {
    type: 'object',
    properties: {
      document_path: { type: 'string', description: 'Normalized Workspace-relative .otio path.' },
      ...(mutation
        ? {
            expected_fingerprint: {
              type: 'object',
              properties: {
                strategy: { type: 'string', enum: ['sha256', 'mtime-size', 'provider'] },
                value: { type: 'string' },
              },
              required: ['strategy', 'value'],
              additionalProperties: false,
            },
            commands: {
              type: 'array',
              description:
                'Non-empty batch of canonical Cut commands with stable target identities.',
              items: { type: 'object' },
              minItems: 1,
            },
          }
        : {}),
    },
    required: mutation ? ['document_path', 'expected_fingerprint', 'commands'] : ['document_path'],
    additionalProperties: false,
  };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${name} is required.`);
  return value;
}

function failed(toolName: string, error: unknown): ToolResult {
  return {
    success: false,
    error: `${toolName} failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}
