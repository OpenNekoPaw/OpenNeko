import type { DshAcpHostToolPort, DshAcpJsonValue } from '@neko/agent-contracts/dsh-acp';
import {
  CREATE_SKILL_DSH_TOOL_NAME,
  CREATE_SKILL_DSH_TOOL_OPERATION,
  CREATE_SKILL_DSH_TOOL_PARAMETERS,
  decodeCreateDshSkillInput,
  decodeCreateDshSkillResult,
} from '@neko/agent-contracts/dsh-skill-authoring';
import type { Context } from '@deepseek-ai/cordis';
import { defineTool, type JsonValue, type ToolRunContext } from '@deepseek-ai/dsh-tools';

export const name = 'openneko-agent-tools';
export const inject = ['opennekoHostTools', 'tools'];

declare module '@deepseek-ai/cordis' {
  interface Context {
    opennekoHostTools: DshAcpHostToolPort<ToolRunContext>;
  }
}

export function apply(ctx: Context): void {
  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: CREATE_SKILL_DSH_TOOL_NAME,
          description:
            'Create one DSH-native Skill in the exact current Conversation authority. The Host chooses the destination; this operation never overwrites an existing package.',
          parameters: CREATE_SKILL_DSH_TOOL_PARAMETERS,
          output: {
            schema: { type: 'json' },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
          },
          async execute(args, execution) {
            const input = decodeCreateDshSkillInput(args);
            const response = await ctx.opennekoHostTools.execute(
              {
                tool: CREATE_SKILL_DSH_TOOL_NAME,
                operation: CREATE_SKILL_DSH_TOOL_OPERATION,
                input: {
                  layout: input.layout,
                  skillMarkdown: input.skillMarkdown,
                  resources: input.resources.map((resource) => ({
                    path: resource.path,
                    content: resource.content,
                  })),
                },
              },
              execution,
            );
            if (response.outcome === 'failure') {
              throw new Error(`${response.diagnostic.code}: ${response.diagnostic.message}`);
            }
            return toDshJsonValue(decodeCreateDshSkillResult(response.result));
          },
        }),
      ),
    'openneko-agent-tools',
  );
  ctx.effect(
    () =>
      ctx.on('tools/pre-execute', async (execution, next) => {
        if (execution.name !== CREATE_SKILL_DSH_TOOL_NAME) return next();
        return {
          kind: 'ask',
          reason: 'Create a new DSH Skill in the exact current Conversation scope.',
        };
      }),
    'openneko-agent-tools-approval',
  );
}

function toDshJsonValue(value: DshAcpJsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(toDshJsonValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toDshJsonValue(item)]),
    );
  }
  return value;
}
