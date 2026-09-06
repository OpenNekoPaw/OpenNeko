import { describe, expect, it } from 'vitest';

import {
  DSH_ACP_MAX_JSON_DEPTH,
  DSH_ACP_MAX_PAYLOAD_BYTES,
  decodeDshAcpArchivedSessionsProjection,
  decodeDshAcpContextPressureNotification,
  decodeDshAcpDomainToolCancelRequest,
  decodeDshAcpDomainToolRequest,
  decodeDshAcpDomainToolResponse,
  decodeDshAcpExtensionProjection,
  decodeDshAcpMcpIdentityRequest,
  decodeDshAcpMcpServerInput,
  decodeDshAcpSkillMutationRequest,
  decodeDshAcpSkillDetailProjection,
  decodeDshAcpSkillDetailRequest,
  decodeDshAcpInboxSnapshot,
  decodeDshAcpInboxEnqueueRequest,
  decodeDshAcpImageAttachmentReadProjection,
  decodeDshAcpImageAttachmentReadRequest,
  decodeDshAcpJsonPayload,
  decodeDshAcpModelConfiguration,
  decodeDshAcpSessionContextSetRequest,
  decodeDshAcpSessionBranchProjection,
  decodeDshAcpSessionBranchRequest,
  decodeDshAcpSessionArchiveRequest,
  decodeDshAcpSessionEventNotification,
  decodeDshAcpSkillObservationProjection,
  decodeDshAcpStagedSkillValidationRequest,
  encodeDshAcpModelConfiguration,
} from './dsh-acp';

describe('DSH ACP extension contract', () => {
  it('accepts large image attachments while preserving exact byte metadata', () => {
    const bytes = Buffer.alloc(5 * 1024 * 1024, 97);
    const input = {
      attachment: {
        attachmentId: 'large-image',
        mediaType: 'image/png',
        bytes: bytes.length,
        width: 4096,
        height: 4096,
      },
      data: bytes.toString('base64'),
    };
    expect(decodeDshAcpImageAttachmentReadProjection(input)).toEqual(input);
  });

  it('decodes exact staged validation and scoped Skill observation payloads', () => {
    expect(
      decodeDshAcpStagedSkillValidationRequest({
        stagingRoot: '/tmp/staged-skill',
        layout: 'flat',
        entry: '.openneko-candidate.md',
      }),
    ).toEqual({
      stagingRoot: '/tmp/staged-skill',
      layout: 'flat',
      entry: '.openneko-candidate.md',
    });
    expect(() =>
      decodeDshAcpStagedSkillValidationRequest({
        stagingRoot: '/tmp/staged-skill',
        layout: 'flat',
        entry: '.openneko-candidate.md',
        target: 'workspace',
      }),
    ).toThrow(/must contain exactly/u);
    expect(
      decodeDshAcpSkillObservationProjection({
        complete: true,
        skill: {
          name: 'sample-skill',
          source: 'project-agents',
          provider: 'local',
          userInvocable: true,
          modelInvocable: false,
        },
      }),
    ).toMatchObject({ complete: true, skill: { source: 'project-agents' } });
  });

  it('accepts only Skill/MCP extension projection fields', () => {
    const projection = {
      catalogScope: 'global',
      skills: [],
      mcp: [],
      diagnostics: [],
    };
    expect(decodeDshAcpExtensionProjection(projection)).toEqual(projection);
    expect(() => decodeDshAcpExtensionProjection({ ...projection, plugins: [] })).toThrow(
      /must contain exactly/u,
    );
  });

  it('decodes exact on-demand Skill detail with a canonical content fingerprint', () => {
    expect(decodeDshAcpSkillDetailRequest({ name: 'review', source: 'user-dsh' })).toEqual({
      name: 'review',
      source: 'user-dsh',
    });
    expect(
      decodeDshAcpSkillDetailProjection({
        name: 'review',
        description: 'Review drafts.',
        source: 'user-dsh',
        provider: 'filesystem',
        userInvocable: true,
        modelInvocable: true,
        content: '# Review',
        fingerprint: `sha256:${'a'.repeat(64)}`,
      }),
    ).toMatchObject({ name: 'review', content: '# Review' });
    expect(() =>
      decodeDshAcpSkillDetailProjection({
        name: 'review',
        description: 'Review drafts.',
        source: 'user-dsh',
        provider: 'filesystem',
        userInvocable: true,
        modelInvocable: true,
        content: '# Review',
        fingerprint: 'sha256:short',
      }),
    ).toThrow(/canonical SHA-256/u);
  });

  it('decodes exact Skill and MCP lifecycle payloads', () => {
    expect(
      decodeDshAcpSkillMutationRequest({
        name: 'review',
        source: 'user-dsh',
        enabled: false,
      }),
    ).toEqual({ name: 'review', source: 'user-dsh', enabled: false });
    expect(
      decodeDshAcpMcpServerInput({
        serverName: 'filesystem',
        description: 'Approved files',
        transport: 'stdio',
        command: 'mcp-filesystem',
        args: ['--readonly'],
      }),
    ).toMatchObject({ transport: 'stdio', command: 'mcp-filesystem' });
    expect(decodeDshAcpMcpIdentityRequest({ id: 'openneko-mcp-filesystem' })).toEqual({
      id: 'openneko-mcp-filesystem',
    });
    expect(() =>
      decodeDshAcpMcpIdentityRequest({ id: 'openneko-mcp-filesystem', enabled: 'yes' }),
    ).toThrow(/enabled/u);
  });

  it('decodes an exact native image read without applying the generic JSON limit to bytes', () => {
    expect(
      decodeDshAcpImageAttachmentReadRequest({
        sessionId: 'session-1',
        attachmentId: 'attachment-1',
      }),
    ).toEqual({ sessionId: 'session-1', attachmentId: 'attachment-1' });
    expect(
      decodeDshAcpImageAttachmentReadProjection({
        attachment: {
          attachmentId: 'attachment-1',
          mediaType: 'image/png',
          bytes: 4,
          width: 1,
          height: 1,
        },
        data: 'YWJjZA==',
      }),
    ).toMatchObject({ attachment: { bytes: 4 }, data: 'YWJjZA==' });
    expect(() =>
      decodeDshAcpImageAttachmentReadProjection({
        attachment: {
          attachmentId: 'attachment-1',
          mediaType: 'image/png',
          bytes: 3,
          width: 1,
          height: 1,
        },
        data: 'YWJjZA==',
      }),
    ).toThrow(/byte length/u);
    expect(() =>
      decodeDshAcpImageAttachmentReadProjection({
        attachment: {
          attachmentId: 'attachment-oversized',
          mediaType: 'image/png',
          bytes: 4 * 1024 * 1024 + 1,
          width: 1,
          height: 1,
        },
        data: 'YQ==',
      }),
    ).toThrow(/byte length/u);
  });

  it('decodes exact bounded context pressure while allowing unavailable optional fields', () => {
    expect(
      decodeDshAcpContextPressureNotification({
        sessionId: 'session-1',
        sourceSequence: 12,
        pressure: {
          pressureTokens: 38_924,
          projectedTokens: 41_100,
          contextWindow: 256_000,
        },
      }),
    ).toEqual({
      sessionId: 'session-1',
      sourceSequence: 12,
      pressure: {
        pressureTokens: 38_924,
        projectedTokens: 41_100,
        contextWindow: 256_000,
      },
    });
    expect(
      decodeDshAcpContextPressureNotification({
        sessionId: 'session-1',
        sourceSequence: 0,
        pressure: {},
      }),
    ).toEqual({ sessionId: 'session-1', sourceSequence: 0, pressure: {} });
    expect(() =>
      decodeDshAcpContextPressureNotification({
        sessionId: 'session-1',
        sourceSequence: 1,
        pressure: { contextWindow: 0 },
      }),
    ).toThrow(/context window must be a positive safe integer/u);
    expect(() =>
      decodeDshAcpContextPressureNotification({
        sessionId: 'session-1',
        sourceSequence: 1,
        pressure: { projectedTokens: 1, unexpectedField: 1 },
      }),
    ).toThrow(/unsupported fields/u);
  });

  it('accepts exact Session archive requests and unique archive projections', () => {
    expect(decodeDshAcpSessionArchiveRequest({ sessionId: 'session-1' })).toEqual({
      sessionId: 'session-1',
    });
    expect(
      decodeDshAcpArchivedSessionsProjection({ sessionIds: ['session-1', 'session-2'] }),
    ).toEqual({ sessionIds: ['session-1', 'session-2'] });
    expect(() =>
      decodeDshAcpSessionArchiveRequest({ sessionId: 'session-1', delete: true }),
    ).toThrow(/must contain exactly/u);
    expect(() =>
      decodeDshAcpArchivedSessionsProjection({ sessionIds: ['session-1', 'session-1'] }),
    ).toThrow(/must be unique/u);
  });

  it('accepts one exact bounded live inbox message with its model context', () => {
    expect(
      decodeDshAcpInboxEnqueueRequest({
        sessionId: 'session-1',
        prompt: [{ type: 'text', text: 'next' }],
        displayContent: [{ type: 'text', text: 'next' }],
        contextText: 'workspace context',
        configuration: {
          model: '["openai","gpt-5",8192]',
          permissionPresetId: 'workspace-write',
        },
      }),
    ).toEqual({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'next' }],
      displayContent: [{ type: 'text', text: 'next' }],
      contextText: 'workspace context',
      configuration: {
        model: '["openai","gpt-5",8192]',
        permissionPresetId: 'workspace-write',
      },
    });
    expect(() =>
      decodeDshAcpInboxEnqueueRequest({
        sessionId: 'session-1',
        prompt: [{ type: 'text', text: 'next' }],
        displayContent: [{ type: 'text', text: 'next' }],
        contextText: 'workspace context',
        configuration: {
          model: '["openai","gpt-5",8192]',
          permissionPresetId: 'workspace-write',
        },
        fallbackQueue: true,
      }),
    ).toThrow(/must contain exactly/u);

    expect(
      decodeDshAcpInboxEnqueueRequest({
        sessionId: 'session-1',
        prompt: [
          {
            type: 'image',
            data: 'AQID',
            mimeType: 'image/png',
            _meta: { opennekoDisplayName: 'clipboard.png' },
          },
        ],
        displayContent: [{ type: 'image', name: 'clipboard.png' }],
        contextText: 'workspace context',
        configuration: {
          model: '["openai","gpt-5",8192]',
          permissionPresetId: 'workspace-write',
        },
      }),
    ).toMatchObject({
      prompt: [{ type: 'image', _meta: { opennekoDisplayName: 'clipboard.png' } }],
      displayContent: [{ type: 'image', name: 'clipboard.png' }],
    });

    const imageData = 'AAAA'.repeat(70_000);
    expect(
      decodeDshAcpInboxEnqueueRequest({
        sessionId: 'session-1',
        prompt: [
          {
            type: 'image',
            data: imageData,
            mimeType: 'image/png',
            _meta: { opennekoDisplayName: 'large.png' },
          },
        ],
        displayContent: [{ type: 'image', name: 'large.png' }],
        contextText: 'workspace context',
        configuration: {
          model: '["openai","gpt-5",8192]',
          permissionPresetId: 'workspace-write',
        },
      }).prompt[0],
    ).toMatchObject({ type: 'image', data: imageData });
    expect(() =>
      decodeDshAcpInboxEnqueueRequest({
        sessionId: 'session-1',
        prompt: [{ type: 'text', text: 'next' }],
        displayContent: [{ type: 'text', text: 'next' }],
        contextText: 'workspace context',
        configuration: {
          model: '["openai","gpt-5",8192]',
          permissionPresetId: '',
        },
      }),
    ).toThrow(/turn permissionPresetId/u);
  });

  it('accepts only the exact bounded Session context payload', () => {
    expect(
      decodeDshAcpSessionContextSetRequest({ sessionId: 'session-1', text: 'workspace.nkc' }),
    ).toEqual({ sessionId: 'session-1', text: 'workspace.nkc' });
    expect(() =>
      decodeDshAcpSessionContextSetRequest({ sessionId: 'session-1', text: '', stale: true }),
    ).toThrow(/must contain exactly/u);
  });

  it('accepts only an exact assistant reply branch identity and result', () => {
    expect(
      decodeDshAcpSessionBranchRequest({ sessionId: 'session-1', messageId: 'assistant-1' }),
    ).toEqual({ sessionId: 'session-1', messageId: 'assistant-1' });
    expect(decodeDshAcpSessionBranchProjection({ sessionId: 'session-branch' })).toEqual({
      sessionId: 'session-branch',
    });
    expect(() =>
      decodeDshAcpSessionBranchRequest({
        sessionId: 'session-1',
        messageId: 'assistant-1',
        boundary: 7,
      }),
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
        sandboxMode: 'workspace-write',
        tool: 'openneko_generation',
        operation: 'generate-image',
        input: { prompt: 'cat' },
      }),
    ).toEqual({
      sessionId: 'session-1',
      turn: 2,
      toolCallId: 'call-3',
      sandboxMode: 'workspace-write',
      tool: 'openneko_generation',
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
        sandboxMode: 'workspace-write',
        tool: 'openneko_generation',
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
    expect(
      decodeDshAcpSessionEventNotification({
        sessionId: 'session-1',
        sequence: 1,
        time: 1_000,
        type: 'turn/start',
        data: { turn: 1 },
        replay: false,
      }),
    ).toEqual({
      sessionId: 'session-1',
      sequence: 1,
      time: 1_000,
      type: 'turn/start',
      data: { turn: 1 },
      replay: false,
    });
    expect(() =>
      decodeDshAcpSessionEventNotification({
        sessionId: 'session-1',
        sequence: -1,
        time: 1_000,
        type: 'tool/call',
        data: {},
        replay: false,
      }),
    ).toThrow(/sequence must be a non-negative safe integer/);
    expect(() =>
      decodeDshAcpSessionEventNotification({
        sessionId: 'session-1',
        sequence: 1,
        type: 'turn/start',
        data: { turn: 1 },
        replay: false,
      }),
    ).toThrow(/must contain exactly/u);
    expect(() =>
      decodeDshAcpSessionEventNotification({
        sessionId: 'session-1',
        sequence: 1,
        time: -1,
        type: 'turn/start',
        data: { turn: 1 },
        replay: false,
      }),
    ).toThrow(/time must be a non-negative safe integer/u);
    expect(() =>
      decodeDshAcpSessionEventNotification({
        sessionId: 'session-1',
        sequence: 1,
        time: 1_000,
        type: 'turn/start',
        data: { turn: 1 },
      }),
    ).toThrow(/must contain exactly/u);
    expect(() =>
      decodeDshAcpSessionEventNotification({
        sessionId: 'session-1',
        sequence: 1,
        time: 1_000,
        type: 'turn/start',
        data: { turn: 1 },
        replay: 'yes',
      }),
    ).toThrow(/replay must be boolean/u);
    expect(() =>
      decodeDshAcpInboxSnapshot({
        nextTurn: [],
        nextStep: [{ messageId: 'message-1', createdAt: 0, content: [], extra: true }],
      }),
    ).toThrow(/must contain exactly/u);
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
        sandboxMode: 'workspace-write',
        tool: 'openneko_canvas',
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

  it('requires one exact DSH sandbox mode on every Host Tool request', () => {
    const request = {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-1',
      tool: 'openneko_canvas',
      operation: 'query',
      input: { documentPath: 'neko/boards/workspace.nkc' },
    };

    expect(() => decodeDshAcpDomainToolRequest(request)).toThrow(/sandboxMode/u);
    expect(() => decodeDshAcpDomainToolRequest({ ...request, sandboxMode: 'ask' })).toThrow(
      /sandboxMode is invalid/u,
    );
    expect(() =>
      decodeDshAcpDomainToolRequest({
        ...request,
        sandboxMode: 'read-only',
        permissionPreset: 'workspace-write',
      }),
    ).toThrow(/must contain exactly/u);
  });
});
