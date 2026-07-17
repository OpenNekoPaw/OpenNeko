import { describe, expect, it } from 'vitest';
import {
  requireToolExecutionRunScope,
  withToolExecutionRunMetadata,
  type ToolExecuteOptions,
} from '../tool';

const OWNER = {
  conversationId: 'conversation-1',
  runId: 'run-1',
} as const;

function options(input: ToolExecuteOptions): ToolExecuteOptions {
  return input;
}

describe('tool execution owner scope', () => {
  it('accepts ownership from metadata', () => {
    expect(requireToolExecutionRunScope(options({ metadata: OWNER }))).toEqual(OWNER);
  });

  it('accepts ownership from trace', () => {
    expect(requireToolExecutionRunScope(options({ trace: OWNER }))).toEqual(OWNER);
  });

  it('accepts matching metadata and trace ownership', () => {
    expect(requireToolExecutionRunScope(options({ metadata: OWNER, trace: OWNER }))).toEqual(OWNER);
  });

  it('treats an unknown trace conversation as absent when metadata owns the execution', () => {
    expect(
      requireToolExecutionRunScope(
        options({ metadata: OWNER, trace: { conversationId: 'unknown', runId: OWNER.runId } }),
      ),
    ).toEqual(OWNER);
  });

  it('rejects mismatched conversation ownership', () => {
    expect(() =>
      requireToolExecutionRunScope(
        options({ metadata: OWNER, trace: { ...OWNER, conversationId: 'conversation-2' } }),
      ),
    ).toThrow(/conversationId owner mismatch/);
  });

  it('rejects mismatched run ownership', () => {
    expect(() =>
      requireToolExecutionRunScope(
        options({ metadata: OWNER, trace: { ...OWNER, runId: 'run-2' } }),
      ),
    ).toThrow(/runId owner mismatch/);
  });

  it.each([
    [{ metadata: { runId: OWNER.runId } }, /conversationId ownership/],
    [{ metadata: { conversationId: OWNER.conversationId } }, /runId ownership/],
    [{ trace: { conversationId: 'unknown', runId: OWNER.runId } }, /conversationId ownership/],
  ] satisfies readonly [ToolExecuteOptions, RegExp][])(
    'rejects incomplete ownership %#',
    (input, error) => {
      expect(() => requireToolExecutionRunScope(input)).toThrow(error);
    },
  );

  it('rejects an unknown metadata conversation owner', () => {
    expect(() =>
      requireToolExecutionRunScope(
        options({ metadata: { conversationId: 'unknown', runId: OWNER.runId } }),
      ),
    ).toThrow(/concrete conversationId owner/);
  });

  it('overrides request metadata with the canonical execution owner', () => {
    expect(
      withToolExecutionRunMetadata(options({ metadata: OWNER }), {
        conversationId: 'forged-conversation',
        runId: 'forged-run',
        nodeId: 'node-1',
      }),
    ).toEqual({ ...OWNER, nodeId: 'node-1' });
  });
});
