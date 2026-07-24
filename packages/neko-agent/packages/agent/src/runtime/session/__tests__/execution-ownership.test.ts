import { describe, expect, it, vi } from 'vitest';
import {
  ExecutionOwnershipRegistryError,
  createExecutionOwnershipRegistry,
  createToolCallExecution,
  type ExecutionRef,
  type OwnedExecution,
} from '../execution-ownership';

function ref(
  kind: ExecutionRef['kind'],
  executionId: string,
  instanceId = 'conversation-1',
): ExecutionRef {
  return { kind, instanceId, executionId };
}

function execution(executionRef: ExecutionRef): OwnedExecution & {
  cancel: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  return {
    ref: executionRef,
    cancel: vi.fn(),
    release: vi.fn(),
  };
}

describe('ExecutionOwnershipRegistry', () => {
  it('cascades cancellation from a surface through its foreground run and tool call', async () => {
    const registry = createExecutionOwnershipRegistry();
    const surface = ref('surface', 'tab-1');
    const run = execution(ref('foreground-agent-run', 'run-1'));
    const tool = execution(ref('tool-call', 'tool-1'));
    registry.attach(surface, run);
    registry.attach(run.ref, tool);
    const reason = new Error('tab closed');

    await registry.cancelOwned(surface, reason);

    expect(tool.cancel).toHaveBeenCalledWith(reason);
    expect(run.cancel).toHaveBeenCalledWith(reason);
    expect(tool.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      run.cancel.mock.invocationCallOrder[0]!,
    );
  });

  it('transfers an explicit subagent run away from its creating tool call', async () => {
    const registry = createExecutionOwnershipRegistry();
    const tool = ref('tool-call', 'spawn-call');
    const supervisor = ref('surface', 'application-supervisor', 'application-1');
    const subagent = execution(ref('subagent-run', 'subagent-1'));
    registry.attach(tool, subagent);

    registry.transfer(subagent.ref, supervisor);
    await registry.cancelOwned(tool, new Error('creator turn cancelled'));

    expect(subagent.cancel).not.toHaveBeenCalled();
    await registry.cancelOwned(supervisor, new Error('explicit interrupt'));
    expect(subagent.cancel).toHaveBeenCalledTimes(1);
  });

  it('releases children exactly once and removes their ownership records', async () => {
    const registry = createExecutionOwnershipRegistry();
    const owner = ref('foreground-agent-run', 'run-1');
    const child = execution(ref('tool-call', 'tool-1'));
    registry.attach(owner, child);

    await registry.releaseOwned(owner);
    await registry.releaseOwned(owner);

    expect(child.release).toHaveBeenCalledTimes(1);
    expect(registry.has(child.ref)).toBe(false);
  });

  it('rejects duplicate attachment and ownership cycles visibly', () => {
    const registry = createExecutionOwnershipRegistry();
    const run = execution(ref('foreground-agent-run', 'run-1'));
    const tool = execution(ref('tool-call', 'tool-1'));
    registry.attach(run.ref, tool);

    expect(() => registry.attach(run.ref, tool)).toThrow(
      expect.objectContaining<Partial<ExecutionOwnershipRegistryError>>({
        code: 'duplicate-execution',
      }),
    );
    expect(() => registry.attach(tool.ref, run)).toThrow(
      expect.objectContaining<Partial<ExecutionOwnershipRegistryError>>({
        code: 'ownership-cycle',
      }),
    );
  });
});

describe('createToolCallExecution', () => {
  it('binds exact Pi identity and AbortSignal without active-run fallback', () => {
    const controller = new AbortController();
    const execution = createToolCallExecution(
      {
        workspaceId: 'workspace-1',
        conversationId: 'conversation-1',
        branchId: 'main',
        turnId: 'turn-1',
        agentRunId: 'run-1',
        toolCallId: 'tool-1',
      },
      controller.signal,
    );

    expect(execution.ref).toEqual({
      kind: 'tool-call',
      instanceId: 'conversation-1',
      executionId: 'tool-1',
    });
    expect(execution.signal).toBe(controller.signal);
  });

  it('rejects missing instance identity', () => {
    expect(() =>
      createToolCallExecution(
        {
          workspaceId: 'workspace-1',
          conversationId: '',
          branchId: 'main',
          turnId: 'turn-1',
          agentRunId: 'run-1',
          toolCallId: 'tool-1',
        },
        new AbortController().signal,
      ),
    ).toThrow(/conversationId must be non-empty/);
  });
});
