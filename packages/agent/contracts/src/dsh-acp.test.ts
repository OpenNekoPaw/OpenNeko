import { describe, expect, it } from 'vitest';

import {
  DSH_ACP_MAX_JSON_DEPTH,
  DSH_ACP_MAX_PAYLOAD_BYTES,
  decodeDshAcpDomainToolCancelRequest,
  decodeDshAcpDomainToolRequest,
  decodeDshAcpDomainToolResponse,
  decodeDshAcpInboxSnapshot,
  decodeDshAcpJsonPayload,
  decodeDshAcpModelConfiguration,
  decodeDshAcpSessionContextSetRequest,
  decodeDshAcpSessionEventNotification,
  encodeDshAcpModelConfiguration,
} from './dsh-acp';

describe('DSH ACP extension contract', () => {
  it('accepts only the exact bounded Session context payload', () => {
    expect(
      decodeDshAcpSessionContextSetRequest({ sessionId: 'session-1', text: 'Workspace Board' }),
    ).toEqual({ sessionId: 'session-1', text: 'Workspace Board' });
    expect(() =>
      decodeDshAcpSessionContextSetRequest({ sessionId: 'session-1', text: '', stale: true }),
    ).toThrow(/must contain exactly/u);
  });

  it('round-trips one strict provider, model, and output limit tuple', () => {
    const encoded = encodeDshAcpModelConfiguration({
      providerId: 'deepseek-official',
      modelId: 'deepseek-v4',
      maxTokens: 8192,
    });
    expect(encoded).toBe('["deepseek-official","deepseek-v4",8192]');
    expect(decodeDshAcpModelConfiguration(encoded)).toEqual({
      providerId: 'deepseek-official',
      modelId: 'deepseek-v4',
      maxTokens: 8192,
    });
    expect(() =>
      decodeDshAcpModelConfiguration('["deepseek-official","deepseek-v4",8192,"fallback"]'),
    ).toThrow(/must contain provider, model, and maxTokens/u);
    expect(() => decodeDshAcpModelConfiguration('["","deepseek-v4",8192]')).toThrow(
      /providerId must not be empty/u,
    );
  });

  it('decodes exact DSH session and Tool identities', () => {
    expect(
      decodeDshAcpDomainToolRequest({
        sessionId: 'session-1',
        turn: 2,
        toolCallId: 'call-3',
        tool: 'openneko.generation',
        operation: 'generate-image',
        input: { prompt: 'cat' },
      }),
    ).toEqual({
      sessionId: 'session-1',
      turn: 2,
      toolCallId: 'call-3',
      tool: 'openneko.generation',
      operation: 'generate-image',
      input: { prompt: 'cat' },
    });
  });

  it('decodes the exact cancel identity with the same payload boundary', () => {
    expect(
      decodeDshAcpDomainToolCancelRequest({
        sessionId: 'session-1',
        turn: 2,
        toolCallId: 'call-3',
      }),
    ).toEqual({
      sessionId: 'session-1',
      turn: 2,
      toolCallId: 'call-3',
    });
  });

  it('enforces the frozen lossless JSON byte and depth limits', () => {
    expect(DSH_ACP_MAX_PAYLOAD_BYTES).toBe(262_144);
    expect(DSH_ACP_MAX_JSON_DEPTH).toBe(32);
    const tooDeep: unknown[] = [];
    let cursor: unknown[] = tooDeep;
    for (let index = 0; index <= DSH_ACP_MAX_JSON_DEPTH; index += 1) {
      const next: unknown[] = [];
      cursor.push(next);
      cursor = next;
    }
    expect(() => decodeDshAcpJsonPayload(tooDeep, 'too deep')).toThrow(
      /exceeds 32 container depth/,
    );
    const oversized = { value: 'x'.repeat(DSH_ACP_MAX_PAYLOAD_BYTES) };
    expect(() => decodeDshAcpJsonPayload(oversized, 'oversized')).toThrow(
      /exceeds 262144 UTF-8 bytes/,
    );
    expect(() =>
      decodeDshAcpDomainToolRequest({
        sessionId: 'session-1',
        turn: 0,
        toolCallId: 'call-1',
        tool: 'openneko.generation',
        operation: 'submit',
        input: oversized,
      }),
    ).toThrow(/exceeds 262144 UTF-8 bytes/);
    expect(() =>
      decodeDshAcpDomainToolResponse({
        outcome: 'success',
        result: oversized,
      }),
    ).toThrow(/exceeds 262144 UTF-8 bytes/);
  });

  it('rejects malformed event and inbox records locally', () => {
    expect(() =>
      decodeDshAcpSessionEventNotification({
        sessionId: 'session-1',
        sequence: -1,
        type: 'tool/call',
        data: {},
      }),
    ).toThrow(/sequence must be a non-negative safe integer/);
    expect(() => decodeDshAcpInboxSnapshot({ nextTurn: [], nextStep: [{ content: [] }] })).toThrow(
      /messageId must be a string/,
    );
  });

  it('decodes exact typed Host Tool success and failure responses', () => {
    expect(
      decodeDshAcpDomainToolResponse({
        outcome: 'success',
        result: { artifactId: 'artifact-1' },
        jobId: 'job-1',
      }),
    ).toEqual({
      outcome: 'success',
      result: { artifactId: 'artifact-1' },
      jobId: 'job-1',
    });
    expect(
      decodeDshAcpDomainToolResponse({
        outcome: 'failure',
        diagnostic: { code: 'CANVAS_NODE_MISSING', message: 'Node does not exist.' },
      }),
    ).toEqual({
      outcome: 'failure',
      diagnostic: { code: 'CANVAS_NODE_MISSING', message: 'Node does not exist.' },
    });
  });

  it('rejects non-JSON Tool payloads and malformed Host outcomes', () => {
    expect(() =>
      decodeDshAcpDomainToolRequest({
        sessionId: 'session-1',
        turn: 0,
        toolCallId: 'call-1',
        tool: 'openneko.canvas',
        operation: 'apply',
        input: { value: undefined },
      }),
    ).toThrow(/input\.value must be lossless JSON/);
    expect(() =>
      decodeDshAcpDomainToolResponse({
        outcome: 'failure',
        diagnostic: { code: '', message: 'Missing code.' },
      }),
    ).toThrow(/diagnostic\.code must not be empty/);
    expect(() =>
      decodeDshAcpDomainToolResponse({ outcome: 'success', result: new Date(0) }),
    ).toThrow(/result must be a plain JSON object/);
    const sparse: unknown[] = [];
    sparse.length = 2;
    sparse[1] = 'sparse';
    expect(() => decodeDshAcpDomainToolResponse({ outcome: 'success', result: sparse })).toThrow(
      /result must be a dense plain JSON array/,
    );
  });
});
