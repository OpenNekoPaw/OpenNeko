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
            '查询画布语义或执行一次明确变更。分析生成结果时直接使用原生成节点的 outputs 中的 locator，不另建素材节点；派生结果关联原生成节点。可用 query 的 contentLocators 按生成结果或文档的精确 locator 查找真实节点 ID，不受默认列表截断影响，不推测节点 ID。Markdown 交付应写入明确的相对资源链接，已有来源会与文档建立 reference 连线；不要仅写裸文件名。其他明确来源或下游关系使用 create_connection。同一计划批次的相关结果返回后，使用 group_nodes 将真实节点 ID 放入同一分组；将归组回执中的 nodeId 用作后续追加请求的 groupId，保留已有节点位置和其他分组。分组成员依据制作计划，不依据同一轮调用或文件名猜测；共享参考不必移入每个分组。',
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
