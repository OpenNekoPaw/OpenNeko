export const name = 'openneko-dsh-w2-seed'
export const inject = ['agents', 'tools']

export function apply(ctx) {
  ctx.on('agent/session-start', ({ agent, source }) => {
    if (source !== 'startup') return
    setTimeout(() => appendW2ToolEvents(ctx, agent), 0)
  })
}

async function appendW2ToolEvents(ctx, agent) {
  await executeDomainTool(
    ctx,
    agent,
    'w2-generation-describe',
    'openneko.generation',
    { operation: 'describe', input: { jobId: 'w2-job' } },
  )
  await executeDomainTool(
    ctx,
    agent,
    'w2-canvas-query',
    'openneko.canvas',
    { operation: 'query', input: { documentPath: 'boards/w2.nkc' } },
  )
}

async function executeDomainTool(ctx, agent, suffix, name, argumentsValue) {
  const callId = `${suffix}-${agent.id}`
  const call = agent.session.append('tool/call', {
    turn: 0,
    step: 0,
    callId,
    name,
    arguments: JSON.stringify(argumentsValue),
  })
  const result = await ctx.tools.execute({
    callId,
    name,
    arguments: argumentsValue,
    agent,
    signal: new AbortController().signal,
  })
  agent.session.append(
    'tool/result',
    {
      turn: 0,
      step: 0,
      message: {
        id: `w2-result-${callId}`,
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
  )
}
