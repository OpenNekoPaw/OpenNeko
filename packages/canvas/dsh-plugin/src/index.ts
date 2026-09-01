import type { DshAcpHostToolPort, DshAcpJsonValue } from '@neko/agent-contracts/dsh-acp';
import type { Context } from '@deepseek-ai/cordis';
import { defineTool, type JsonValue, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { CANVAS_DSH_TOOL_NAME, CANVAS_DSH_TOOL_PARAMETERS } from '@neko/canvas-domain';

export const name = 'openneko-canvas-tools';
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
          name: CANVAS_DSH_TOOL_NAME,
          description:
            'Query bounded semantic context or apply one validated semantic mutation in an OpenNeko Canvas document.',
          parameters: CANVAS_DSH_TOOL_PARAMETERS,
          output: {
            schema: { type: 'json' },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
          },
          async execute(args, execution) {
            const response = await ctx.opennekoHostTools.execute(
              {
                tool: CANVAS_DSH_TOOL_NAME,
                operation: args.operation,
                input: args.input,
              },
              execution,
            );
            if (response.outcome === 'failure') {
              throw new Error(`${response.diagnostic.code}: ${response.diagnostic.message}`);
            }
            return toDshJsonValue(response.result);
          },
        }),
      ),
    'openneko-canvas-tools',
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
