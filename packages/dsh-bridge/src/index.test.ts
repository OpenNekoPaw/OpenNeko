import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Session, SessionId, type SessionHeader } from '@deepseek-ai/dsh-session';
import { CallId, MessageId, createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm';
import { describe, expect, it } from 'vitest';

import {
  listOpenNekoSessions,
  projectDshExtensionCatalog,
  projectContextPressureNotification,
  projectExtensionSessionEvent,
  projectSessionEvent,
} from './index';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readPackageFile(path: string): string {
  return readFileSync(resolve(packageRoot, path), 'utf8');
}

const header = (input: Partial<SessionHeader> & Pick<SessionHeader, 'id'>): SessionHeader => ({
  version: 0,
  createdAt: 1,
  delegationDepth: 0,
  ...input,
});

describe('OpenNeko DSH ACP bridge projections', () => {
  it('projects the exact DSH context-pressure whole value without inventing an empty capability', () => {
    expect(
      projectContextPressureNotification('session-1', {
        asOfSeq: 42,
        values: {
          contextPressure: {
            pressureTokens: 38_924,
            projectedTokens: 41_100,
            contextWindow: 256_000,
          },
        },
      }),
    ).toEqual({
      sessionId: 'session-1',
      sourceSequence: 42,
      pressure: {
        pressureTokens: 38_924,
        projectedTokens: 41_100,
        contextWindow: 256_000,
      },
    });
    expect(
      projectContextPressureNotification('session-1', { asOfSeq: -1, values: {} }),
    ).toBeUndefined();
    expect(() =>
      projectContextPressureNotification('session-1', {
        asOfSeq: 42,
        values: { contextPressure: { projectedTokens: -1 } },
      }),
    ).toThrow(/projectedTokens must be a non-negative safe integer/u);
  });

  it('mounts the DSH-owned Workspace archive services and does not publish delete', () => {
    const patch = readPackageFile('cordis.patch.yml');
    expect(patch).toContain("name: '@deepseek-ai/dsh-storage-domain'");
    expect(patch).toContain("name: '@deepseek-ai/dsh-workspace'");
    expect(patch).not.toContain('session/delete');
  });

  it('projects the real Skill catalog without fabricating unavailable MCP contributions', () => {
    expect(
      projectDshExtensionCatalog({
        complete: true,
        skills: [
          {
            name: 'storyboard',
            description: 'Create a storyboard.',
            invocation: { userInvocable: true, modelInvocable: false },
            source: 'bundled',
            provider: 'openneko-builtin',
          },
        ],
      }),
    ).toEqual({
      skills: [
        {
          name: 'storyboard',
          description: 'Create a storyboard.',
          source: 'bundled',
          provider: 'openneko-builtin',
          userInvocable: true,
          modelInvocable: false,
        },
      ],
      mcp: [],
      diagnostics: [],
    });
    expect(projectDshExtensionCatalog({ complete: false, skills: [] })).toEqual({
      skills: [],
      mcp: [],
      diagnostics: [{ code: 'skill_catalog_incomplete', count: 1 }],
    });
  });

  it('lists only exact profile sessions without fabricating cwd', () => {
    expect(
      listOpenNekoSessions(
        [
          header({ id: SessionId('owned'), cwd: '/workspace', agentPreset: 'openneko' }),
          header({ id: SessionId('foreign'), cwd: '/workspace', agentPreset: 'web' }),
        ],
        'openneko',
        '/workspace',
      ),
    ).toEqual({ sessions: [{ sessionId: 'owned', cwd: '/workspace' }] });
    expect(
      listOpenNekoSessions(
        [header({ id: SessionId('invalid'), agentPreset: 'openneko' })],
        'openneko',
        '/workspace',
      ),
    ).toEqual({
      sessions: [],
      _meta: {
        opennekoDiagnostics: [
          {
            code: 'SESSION_CWD_MISSING',
            message: 'OpenNeko DSH session invalid has no working directory.',
            sessionId: 'invalid',
          },
        ],
      },
    });
  });

  it('rejects profile sessions outside the configured virtual cwd without projecting the path', () => {
    const result = listOpenNekoSessions(
      [
        header({
          id: SessionId('leaking'),
          cwd: '/Users/private/project',
          agentPreset: 'openneko',
        }),
      ],
      'openneko',
      '/virtual/workspace',
    );

    expect(result.sessions).toEqual([]);
    expect(result).toEqual({
      sessions: [],
      _meta: {
        opennekoDiagnostics: [
          {
            code: 'SESSION_CWD_MISMATCH',
            message: 'OpenNeko DSH session leaking is outside the configured virtual workspace.',
            sessionId: 'leaking',
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain('/Users/private/project');
  });

  it('projects committed text and Tool events onto standard ACP updates', () => {
    const session = Session.create(SessionId('session-1'));
    const user = session.append(
      'user/message',
      createUserMessage({
        content: [{ type: 'text', text: 'hello' }],
        source: { kind: 'user' },
      }),
      { surfaceOp: 'append' },
    );
    const call = session.append('tool/call', {
      turn: 0,
      step: 0,
      callId: CallId('call-1'),
      name: 'openneko.canvas',
      arguments: '{"node":"a"}',
    });

    expect(projectSessionEvent('session-1', user)).toEqual([
      {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'user_message_chunk',
          messageId: user.data.id,
          content: { type: 'text', text: 'hello' },
        },
        _meta: { opennekoSequence: user.seq },
      },
    ]);
    expect(projectSessionEvent('session-1', call)).toEqual([
      {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call-1',
          title: 'openneko.canvas',
          status: 'pending',
          rawInput: { node: 'a' },
        },
        _meta: { opennekoSequence: call.seq, opennekoTurn: call.data.turn },
      },
    ]);
  });

  it('replays OpenNeko resource links as structured ACP blocks without protocol text', () => {
    const session = Session.create(SessionId('session-resource'));
    const user = session.append(
      'user/message',
      createUserMessage({
        content: [{ type: 'text', text: 'Use the selected resource.' }],
        source: {
          kind: 'user',
          opennekoDisplayContent: [
            { type: 'text', text: '分析前10页' },
            {
              type: 'resource_link',
              name: '卷01.epub',
              uri: 'openneko-content:%7B%22file%22%3A%7B%22authority%22%3A%22workspace%22%2C%22path%22%3A%22books%2Fvol-01.epub%22%7D%7D',
            },
          ],
        },
      }),
      { surfaceOp: 'append' },
    );

    const notifications = projectSessionEvent('session-resource', user);
    expect(notifications).toHaveLength(2);
    expect(notifications[0]?.update).toMatchObject({
      sessionUpdate: 'user_message_chunk',
      content: { type: 'text', text: '分析前10页' },
    });
    expect(notifications[1]?.update).toMatchObject({
      sessionUpdate: 'user_message_chunk',
      content: {
        type: 'resource_link',
        name: '卷01.epub',
      },
    });
    expect(JSON.stringify(notifications)).not.toContain('[resource_link');
  });

  it('replays persisted image attachment identities as named ACP resource blocks', () => {
    const session = Session.create(SessionId('session-image'));
    const user = session.append(
      'user/message',
      createUserMessage({
        content: [{ type: 'text', text: 'Describe the image.' }],
        source: {
          kind: 'user',
          opennekoDisplayContent: [
            { type: 'text', text: '分析图片' },
            { type: 'image', name: 'clipboard.png', attachmentId: 'attachment-1' },
          ],
        },
      }),
      { surfaceOp: 'append' },
    );

    const notifications = projectSessionEvent('session-image', user);
    expect(notifications.map((notification) => notification.update)).toEqual([
      expect.objectContaining({ content: { type: 'text', text: '分析图片' } }),
      expect.objectContaining({
        content: {
          type: 'resource_link',
          name: 'clipboard.png',
          uri: 'openneko-dsh-attachment:attachment-1',
        },
      }),
    ]);
  });

  it('projects canonical Tool result failure without requiring internal error metadata', () => {
    const session = Session.create(SessionId('session-1'));
    const call = session.append('tool/call', {
      turn: 0,
      step: 0,
      callId: CallId('call-failed'),
      name: 'openneko.canvas',
      arguments: '{}',
    });
    const result = session.append(
      'tool/result',
      {
        turn: 0,
        step: 0,
        message: {
          id: MessageId('result-failed'),
          role: 'user',
          content: [
            {
              type: 'tool-result',
              toolCallId: CallId('call-failed'),
              content: [{ type: 'text', text: 'Error: rejected' }],
              isError: true,
            },
          ],
          source: { kind: 'tool', callId: CallId('call-failed') },
        },
      },
      { surfaceOp: 'append', sourceEventSeqs: [call.seq] },
    );

    expect(projectSessionEvent('session-1', result)).toEqual([
      {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'call-failed',
          status: 'failed',
          rawOutput: [{ type: 'text', text: 'Error: rejected' }],
        },
        _meta: { opennekoSequence: result.seq, opennekoTurn: result.data.turn },
      },
    ]);
  });

  it('projects DSH text and reasoning deltas through standard ACP chunks', () => {
    const session = Session.create(SessionId('session-1'));
    const text = session.append('assistant/chunk', {
      turn: 2,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'Hello' },
    });
    const reasoning = session.append('assistant/chunk', {
      turn: 2,
      step: 1,
      chunk: { type: 'reasoning-delta', index: 1, text: 'Inspect' },
    });

    expect(projectSessionEvent('session-1', text)).toEqual([
      {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          messageId: 'dsh:2:1:text',
          content: { type: 'text', text: 'Hello' },
        },
        _meta: {
          opennekoSequence: text.seq,
          opennekoTurn: 2,
          opennekoStep: 1,
          opennekoBlockIndex: 0,
          opennekoMessagePhase: 'delta',
        },
      },
    ]);
    expect(projectSessionEvent('session-1', reasoning)[0]).toMatchObject({
      update: { sessionUpdate: 'agent_thought_chunk', content: { text: 'Inspect' } },
      _meta: { opennekoBlockIndex: 1, opennekoMessagePhase: 'delta' },
    });
    expect(projectSessionEvent('session-1', text, { replay: true })).toEqual([]);
  });

  it('projects one DSH assistant message as ordered final reasoning and text frames', () => {
    const session = Session.create(SessionId('session-1'));
    const assistant = createAssistantMessage({
      content: [
        { type: 'reasoning', text: 'Consider.' },
        { type: 'text', text: 'Answer.' },
      ],
      source: { provider: 'provider', model: 'model' },
    });
    const message = session.append(
      'assistant/message',
      {
        turn: 0,
        step: 0,
        message: assistant,
      },
      { surfaceOp: 'append', sourceEventSeqs: [] },
    );

    expect(projectSessionEvent('session-1', message)).toEqual([
      expect.objectContaining({
        update: expect.objectContaining({
          sessionUpdate: 'agent_thought_chunk',
          messageId: assistant.id,
          content: { type: 'text', text: 'Consider.' },
        }),
        _meta: expect.objectContaining({
          opennekoSequence: message.seq,
          opennekoMessagePhase: 'final',
          opennekoFrameIndex: 0,
          opennekoFrameCount: 2,
        }),
      }),
      expect.objectContaining({
        update: expect.objectContaining({
          sessionUpdate: 'agent_message_chunk',
          messageId: assistant.id,
          content: { type: 'text', text: 'Answer.' },
        }),
        _meta: expect.objectContaining({
          opennekoSequence: message.seq,
          opennekoMessagePhase: 'final',
          opennekoFrameIndex: 1,
          opennekoFrameCount: 2,
        }),
      }),
    ]);
  });

  it('does not project non-standard DSH events as standard ACP messages', () => {
    const session = Session.create(SessionId('session-1'));
    const todo = session.append('todo/write', {
      todos: [{ content: 'Keep extension facts exact', status: 'pending' }],
    });

    expect(projectSessionEvent('session-1', todo)).toEqual([]);
    expect(projectExtensionSessionEvent('session-1', todo)).toEqual({
      sessionId: 'session-1',
      sequence: todo.seq,
      time: todo.time,
      type: 'todo/write',
      data: todo.data,
    });
  });

  it('does not project DSH runtime-context snapshots as user messages', () => {
    const session = Session.create(SessionId('session-1'));
    const context = session.append(
      'user/message',
      createUserMessage({
        content: [{ type: 'text', text: 'Current runtime context.' }],
        source: {
          kind: 'plugin',
          plugin: '@deepseek-ai/dsh-system-prompt',
          form: 'snapshot',
          sections: [{ name: 'openneko:product-context', text: 'Product context' }],
        },
      }),
      { surfaceOp: 'append' },
    );

    expect(projectSessionEvent('session-1', context)).toEqual([]);
  });
});

describe('OpenNeko DSH ACP bridge boundaries', () => {
  it('imports DSH only through public package entrypoints', () => {
    const source = readPackageFile('src/index.ts');
    const dshImports = [...source.matchAll(/from ['"](@deepseek-ai\/[^'"]+)['"]/g)].map(
      (match) => match[1],
    );

    expect(dshImports.length).toBeGreaterThan(0);
    expect(dshImports).not.toContainEqual(expect.stringMatching(/\/(?:lib|src)(?:\/|$)/));
  });

  it('mounts only the OpenNeko ACP bridge and never upstream dsh-acp', () => {
    const manifest = JSON.parse(readPackageFile('package.json')) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    const profile = readPackageFile('cordis.patch.yml');

    expect(manifest.dependencies).not.toHaveProperty('@deepseek-ai/dsh-acp');
    expect(profile).not.toMatch(/\bdsh-acp\b/);
    expect(profile.match(/^\s*- id:/gm)?.length).toBeGreaterThan(2);
    expect(profile).toContain('id: agent-presets');
    expect(profile).toContain("name: '@neko/dsh-bridge'");
  });

  it('forwards ToolRunContext.signal through the exact cancel extension and same bounded decoders', () => {
    const source = readPackageFile('src/index.ts');
    expect(source).toMatch(/DSH_ACP_EXTENSION_METHODS\.cancelDomainTool/);
    expect(source).toMatch(/execution\.signal\.addEventListener\('abort', sendCancel/);
    expect(source).toMatch(/decodeDshAcpDomainToolRequest/);
    expect(source).toMatch(/decodeDshAcpDomainToolResponse/);
  });

  it('does not define a second Agent, Session, queue, Tool, Skill, MCP, or Plugin runtime', () => {
    const source = readPackageFile('src/index.ts');
    const forbiddenAuthorities = [
      /\bclass\s+\w*(?:Agent|Session|Queue|Registry|Runtime)\w*\b/,
      /\bAgentLoop\b/,
      /\bSessionStore\b/,
      /\b(?:AgentQueue|ToolRegistry|SkillHost|McpManager|PluginRuntime)\b/,
    ];

    for (const forbiddenAuthority of forbiddenAuthorities) {
      expect(source).not.toMatch(forbiddenAuthority);
    }
    expect(source).not.toMatch(/ctx\.tools\.register|registerOpenNekoDomainTools/);
  });

  it('wires Prompt admission through prompt, cancel, close, and connection quiescence', () => {
    const source = readPackageFile('src/index.ts');

    expect(source).toContain("from './prompt-admission.js'");
    expect(source).toContain('const promptAdmission = new PromptAdmission<PromptResponse>()');
    expect(source).toMatch(/const runPrompt[\s\S]*promptAdmission\.run\(sessionId/u);
    expect(source).toMatch(
      /async prompt\(params\)[\s\S]*return runPrompt\(params\.sessionId, content, displayContent\)/u,
    );
    expect(source).toMatch(/cancel\(params\)[\s\S]*promptAdmission\.cancel\(params\.sessionId/u);
    expect(source).toMatch(
      /async closeSession\(params\)[\s\S]*promptAdmission\.cancel\(params\.sessionId/u,
    );
    expect(source).toMatch(/const quiesce[\s\S]*promptAdmission\.close\(\)/u);
  });

  it('uses standard ACP mode and model configuration on the same exact Session identity', () => {
    const source = readPackageFile('src/index.ts');

    expect(source).toMatch(/async setSessionMode\(params\)/u);
    expect(source).toMatch(/async setSessionConfigOption\(params\)/u);
    expect(source).toMatch(/params\.configId !== DSH_ACP_MODEL_CONFIG_ID/u);
    expect(source).toMatch(/current\.handle\.agent\.status !== 'idle'/u);
    expect(source).toMatch(
      /replaceOwnedAgent\(ctx, owned, params\.sessionId, current, configuration, preset\)/u,
    );
    expect(source).toMatch(/resumeSessionId: sessionId/u);
    expect(source).toMatch(/isSameModelConfiguration\(current\.configuration, configuration\)/u);
    expect(source).not.toMatch(/fallbackProvider|fallbackModel|tryNextProvider/u);
  });

  it('binds product context to the exact DSH Agent scope and preserves it across model rebuilds', () => {
    const source = readPackageFile('src/index.ts');

    expect(source).toMatch(/DSH_ACP_EXTENSION_METHODS\.setSessionContext/u);
    expect(source).toMatch(/decodeDshAcpSessionContextSetRequest\(params\)/u);
    expect(source).toMatch(/agentCtx\.systemPrompt\.context\(/u);
    expect(source).toMatch(/name: 'openneko:product-protocol'/u);
    expect(source).toMatch(/text: OPENNEKO_PRODUCT_SYSTEM_PROMPT/u);
    expect(source).toMatch(/name: 'openneko:product-context'/u);
    expect(source).toMatch(
      /setup: setupSessionRuntimeContext\(ctx, preset, current\.runtimeContext\)/u,
    );
    expect(source).toMatch(/ctx\.agentPresets\.mount\(agentCtx, preset\)/u);
    expect(source).toMatch(/createOwnedSession\(handle, configuration, current\.runtimeContext\)/u);
    expect(source).toMatch(/record\.handle\.agent\.status !== 'idle'/u);
  });

  it('selects the official standard DSH preset in the ACP profile', () => {
    expect(readPackageFile('cordis.patch.yml')).toContain('default: standard');
    expect(readPackageFile('cordis.patch.yml')).toContain('agentPreset: standard');
    expect(readPackageFile('src/index.ts')).toContain("Schema.string().default('standard')");
    expect(readPackageFile('src/index.ts')).toContain("config.agentPreset ?? 'standard'");
    for (const id of [
      'tool-bash',
      'tool-fs',
      'tool-skill',
      'tool-goal',
      'plan-mode',
      'tool-subagent',
      'tool-workflow',
      'tool-web',
    ]) {
      expect(readPackageFile('cordis.patch.yml')).toMatch(
        new RegExp(`- id: ${id}\\n  disabled: true`, 'u'),
      );
    }
  });
});
