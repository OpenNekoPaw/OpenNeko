import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'openneko-dsh-q0-seed';
export const inject = ['agents', 'opennekoHostTools', 'tools'];

const Q0_PAYLOAD_LIMIT = 262144;

export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'openneko_q0_host_tool',
          description: 'Q0-only reverse Host Tool qualification.',
          parameters: {
            operation: {
              type: 'string',
              enum: ['succeed', 'fail', 'cancel-pending', 'oversize-input', 'oversize-output'],
              required: true,
            },
            value: { type: 'string', required: true },
          },
          output: {
            schema: { type: 'json' },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
          },
          async execute(args, execution) {
            const response = await ctx.opennekoHostTools.execute(
              {
                tool: 'openneko_q0_host_tool',
                operation: args.operation,
                input: { value: args.value },
              },
              execution,
            );
            if (response.outcome === 'failure') {
              throw new Error(`${response.diagnostic.code}: ${response.diagnostic.message}`);
            }
            return response.result;
          },
        }),
      ),
    'openneko-q0-host-tool',
  );
  ctx.on('agent/session-start', ({ agent, source }) => {
    if (source !== 'startup') return;
    agent.inbox.append('next-turn', {
      id: `q0-inbox-${agent.id}`,
      role: 'user',
      content: [{ type: 'text', text: 'Original deterministic inbox message' }],
      source: { kind: 'plugin', plugin: '@openneko/dsh-q0-seed' },
    });
    agent.session.append(
      'user/message',
      {
        id: `q0-seed-${agent.id}`,
        role: 'user',
        content: [{ type: 'text', text: 'OpenNeko deterministic recovery seed' }],
        source: { kind: 'plugin', plugin: '@openneko/dsh-q0-seed' },
      },
      { surfaceOp: 'append' },
    );
    agent.session.append('todo/write', {
      todos: [{ content: 'Verify deterministic recovery', status: 'pending' }],
    });
    setTimeout(() => appendToolEvents(ctx, agent), 0);
  });
}

async function appendToolEvents(ctx, agent) {
  await executeHostTool(ctx, agent, 'q0-host-success-1', 'succeed', 'first');
  await executeHostTool(ctx, agent, 'q0-host-failure', 'fail', 'rejected');
  await executeHostTool(ctx, agent, 'q0-host-success-2', 'succeed', 'second');

  await executeHostTool(ctx, agent, 'q0-host-cancel-pending', 'cancel-pending', 'pending', {
    abortAfterMs: 50,
  });

  await executeHostTool(
    ctx,
    agent,
    'q0-host-oversize-input',
    'oversize-input',
    'x'.repeat(Q0_PAYLOAD_LIMIT),
  );
  await executeHostTool(ctx, agent, 'q0-host-oversize-output', 'oversize-output', 'output');

  await executeHostTool(ctx, agent, 'q0-host-success-3', 'succeed', 'after-bounds');

  const callId = `q0-call-${agent.id}`;
  const call = agent.session.append('tool/call', {
    turn: 0,
    step: 0,
    callId,
    name: 'openneko_q0_tool',
    arguments: '{"fixture":true}',
  });
  agent.session.append(
    'tool/result',
    {
      turn: 0,
      step: 0,
      message: {
        id: `q0-result-${agent.id}`,
        role: 'user',
        content: [
          {
            type: 'tool-result',
            toolCallId: callId,
            content: [{ type: 'text', text: 'Q0 tool completed' }],
            isError: false,
          },
        ],
        source: { kind: 'tool', callId },
      },
    },
    { surfaceOp: 'append', sourceEventSeqs: [call.seq] },
  );
}

async function executeHostTool(ctx, agent, suffix, operation, value, options = {}) {
  const callId = `${suffix}-${agent.id}`;
  const call = agent.session.append('tool/call', {
    turn: 0,
    step: 0,
    callId,
    name: 'openneko_q0_host_tool',
    arguments: JSON.stringify({ operation, value }),
  });
  const controller = new AbortController();
  const signal = controller.signal;
  if (options.abortAfterMs !== undefined) {
    setTimeout(() => controller.abort(), options.abortAfterMs);
  }
  const result = await ctx.tools.execute({
    callId,
    name: 'openneko_q0_host_tool',
    arguments: { operation, value },
    agent,
    signal,
  });
  agent.session.append(
    'tool/result',
    {
      turn: 0,
      step: 0,
      message: {
        id: `q0-result-${callId}`,
        role: 'user',
        content: [
          {
            type: 'tool-result',
            toolCallId: callId,
            content: result.content,
            isError: result.isError,
          },
        ],
        source: { kind: 'tool', callId },
      },
      ...(result.isError && result.error.info !== undefined ? { error: result.error.info } : {}),
    },
    { surfaceOp: 'append', sourceEventSeqs: [call.seq] },
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
}
