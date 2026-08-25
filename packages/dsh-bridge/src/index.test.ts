import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Session, SessionId, type SessionHeader } from '@deepseek-ai/dsh-session';
import { CallId, MessageId, createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm';
import { Context } from '@deepseek-ai/cordis';
import { describe, expect, it, vi } from 'vitest';

import {
  listOpenNekoSessions,
  DshExtensionLifecycle,
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
  it('moves only personal Skills between enabled and disabled roots and deletes the selected entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-dsh-extension-test-'));
    const previousHome = process.env.DSH_HOME;
    process.env.DSH_HOME = root;
    try {
      const active = join(root, 'skills', 'review');
      await mkdir(active, { recursive: true });
      await writeFile(join(active, 'SKILL.md'), '# Review\n', 'utf8');
      const lifecycle = new DshExtensionLifecycle({} as Context);

      await lifecycle.setSkillEnabled({ name: 'review', source: 'user-dsh', enabled: false });
      await expect(
        readFile(join(root, 'disabled-skills', 'review', 'SKILL.md'), 'utf8'),
      ).resolves.toBe('# Review\n');
      await expect(
        lifecycle.setSkillEnabled({ name: 'review', source: 'bundled', enabled: true }),
      ).rejects.toThrow('Only canonical personal DSH Skills');
      await lifecycle.removeSkill({ name: 'review', source: 'user-dsh' });
      await expect(
        readFile(join(root, 'disabled-skills', 'review', 'SKILL.md'), 'utf8'),
      ).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previousHome;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('persists MCP enablement and reconciles the one canonical Loader entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-dsh-mcp-test-'));
    const previousHome = process.env.DSH_HOME;
    process.env.DSH_HOME = root;
    const loader = {
      create: vi.fn(async () => 'loader-filesystem'),
      update: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      resolve: vi.fn(() => ({ fiber: { state: 2 } })),
    };
    try {
      const lifecycle = new DshExtensionLifecycle({ loader } as unknown as Context);
      await lifecycle.addMcp({
        serverName: 'filesystem',
        description: 'Approved files',
        transport: 'stdio',
        command: 'mcp-filesystem',
        args: ['--readonly'],
      });
      await expect(lifecycle.readMcp()).resolves.toMatchObject([
        { id: 'openneko-mcp-filesystem', enabled: true, status: 'ready' },
      ]);

      await lifecycle.setMcpEnabled('openneko-mcp-filesystem', false);
      await expect(lifecycle.readMcp()).resolves.toMatchObject([
        { id: 'openneko-mcp-filesystem', enabled: false, status: 'disabled' },
      ]);
      expect(loader.update).toHaveBeenCalledWith(
        'loader-filesystem',
        expect.objectContaining({ disabled: true }),
      );
      expect(
        JSON.parse(await readFile(join(root, 'extensions', 'mcp.json'), 'utf8')),
      ).toMatchObject([{ id: 'openneko-mcp-filesystem', enabled: false }]);

      await lifecycle.removeMcp('openneko-mcp-filesystem');
      await expect(lifecycle.readMcp()).resolves.toEqual([]);
      expect(loader.remove).toHaveBeenCalledWith('loader-filesystem');
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previousHome;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('linearizes concurrent MCP mutations through persistence and Loader reconciliation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-dsh-mcp-concurrency-test-'));
    const previousHome = process.env.DSH_HOME;
    process.env.DSH_HOME = root;
    const firstCreate = createVoidDeferred();
    const loader = {
      create: vi.fn(async (input: { readonly config: { readonly serverName: string } }) => {
        if (input.config.serverName === 'alpha') await firstCreate.promise;
        return `loader-${input.config.serverName}`;
      }),
      update: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      resolve: vi.fn(() => ({ fiber: { state: 2 } })),
    };
    try {
      const lifecycle = new DshExtensionLifecycle({ loader } as unknown as Context);
      const alpha = lifecycle.addMcp({
        serverName: 'alpha',
        description: 'Alpha tools',
        transport: 'stdio',
        command: 'mcp-alpha',
        args: [],
      });
      await vi.waitFor(() => expect(loader.create).toHaveBeenCalledTimes(1));

      const beta = lifecycle.addMcp({
        serverName: 'beta',
        description: 'Beta tools',
        transport: 'stdio',
        command: 'mcp-beta',
        args: [],
      });
      let readSettled = false;
      const readDuringMutation = lifecycle.readMcp().then((projection) => {
        readSettled = true;
        return projection;
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(loader.create).toHaveBeenCalledTimes(1);
      expect(readSettled).toBe(false);
      firstCreate.resolve();

      await Promise.all([alpha, beta]);
      await expect(readDuringMutation).resolves.toMatchObject([
        { id: 'openneko-mcp-alpha', status: 'ready' },
        { id: 'openneko-mcp-beta', status: 'ready' },
      ]);
      expect(loader.create.mock.calls.map(([input]) => input.config.serverName)).toEqual([
        'alpha',
        'beta',
      ]);
      await expect(
        readFile(join(root, 'extensions', 'mcp.json'), 'utf8').then(JSON.parse),
      ).resolves.toMatchObject([
        { id: 'openneko-mcp-alpha', enabled: true },
        { id: 'openneko-mcp-beta', enabled: true },
      ]);

      await expect(
        lifecycle.addMcp({
          serverName: 'alpha',
          description: 'Duplicate Alpha tools',
          transport: 'stdio',
          command: 'mcp-alpha-duplicate',
          args: [],
        }),
      ).rejects.toThrow("MCP server 'alpha' already exists.");
      await lifecycle.setMcpEnabled('openneko-mcp-beta', false);
      await expect(lifecycle.readMcp()).resolves.toMatchObject([
        { id: 'openneko-mcp-alpha', status: 'ready' },
        { id: 'openneko-mcp-beta', status: 'disabled' },
      ]);
    } finally {
      firstCreate.resolve();
      if (previousHome === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previousHome;
      await rm(root, { recursive: true, force: true });
    }
  });

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

  it('projects only the real Skill catalog without exposing Plugin inventory', () => {
    expect(
      projectDshExtensionCatalog(
        {
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
        },
        'global',
      ),
    ).toEqual({
      catalogScope: 'global',
      skills: [
        {
          name: 'storyboard',
          description: 'Create a storyboard.',
          source: 'bundled',
          provider: 'openneko-builtin',
          userInvocable: true,
          modelInvocable: false,
          enabled: true,
          manageable: false,
          removable: false,
        },
      ],
      mcp: [],
      diagnostics: [],
    });
    expect(projectDshExtensionCatalog({ complete: false, skills: [] }, 'global')).toEqual({
      catalogScope: 'global',
      skills: [],
      mcp: [],
      diagnostics: [{ code: 'skill_catalog_incomplete', count: 1 }],
    });
    expect(projectDshExtensionCatalog({ complete: true, skills: [] }, 'global')).not.toHaveProperty(
      'plugins',
    );
  });

  it('lists all exact profile sessions with their authoritative absolute cwd', () => {
    expect(
      listOpenNekoSessions(
        [
          header({ id: SessionId('owned'), cwd: '/workspace', agentPreset: 'openneko' }),
          header({ id: SessionId('foreign'), cwd: '/workspace', agentPreset: 'web' }),
        ],
        'openneko',
      ),
    ).toEqual({ sessions: [{ sessionId: 'owned', cwd: '/workspace' }] });
    expect(
      listOpenNekoSessions(
        [header({ id: SessionId('invalid'), agentPreset: 'openneko' })],
        'openneko',
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

  it('rejects a profile session whose persisted cwd is not absolute', () => {
    const result = listOpenNekoSessions(
      [
        header({
          id: SessionId('invalid'),
          cwd: 'relative/project',
          agentPreset: 'openneko',
        }),
      ],
      'openneko',
    );

    expect(result.sessions).toEqual([]);
    expect(result).toEqual({
      sessions: [],
      _meta: {
        opennekoDiagnostics: [
          {
            code: 'SESSION_CWD_INVALID',
            message: 'OpenNeko DSH session invalid has a non-absolute working directory.',
            sessionId: 'invalid',
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain('relative/project');
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
        _meta: { opennekoSequence: user.seq, opennekoReplay: false },
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
        _meta: {
          opennekoSequence: call.seq,
          opennekoTurn: call.data.turn,
          opennekoReplay: false,
        },
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
            {
              type: 'image',
              name: 'clipboard.png',
              attachmentId: 'attachment-1',
              mediaType: 'image/png',
              bytes: 4,
              width: 1,
              height: 1,
            },
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
          uri: `openneko-dsh-attachment:${encodeURIComponent(
            JSON.stringify({
              attachmentId: 'attachment-1',
              mediaType: 'image/png',
              bytes: 4,
              width: 1,
              height: 1,
            }),
          )}`,
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
        _meta: {
          opennekoSequence: result.seq,
          opennekoTurn: result.data.turn,
          opennekoReplay: false,
        },
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
          opennekoReplay: false,
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

  it('marks standard ACP notifications as live or replay without inference', () => {
    const session = Session.create(SessionId('session-1'));
    const message = session.append(
      'user/message',
      createUserMessage({
        content: [{ type: 'text', text: 'Replay me.' }],
        source: { kind: 'user' },
      }),
      { surfaceOp: 'append' },
    );

    expect(projectSessionEvent('session-1', message)[0]?._meta).toMatchObject({
      opennekoReplay: false,
    });
    expect(projectSessionEvent('session-1', message, { replay: true })[0]?._meta).toMatchObject({
      opennekoReplay: true,
    });
  });

  it('does not project non-standard DSH events as standard ACP messages', () => {
    const session = Session.create(SessionId('session-1'));
    const todo = session.append('todo/write', {
      todos: [{ content: 'Keep extension facts exact', status: 'pending' }],
    });

    expect(projectSessionEvent('session-1', todo)).toEqual([]);
    expect(projectExtensionSessionEvent('session-1', todo, false)).toEqual({
      sessionId: 'session-1',
      sequence: todo.seq,
      time: todo.time,
      type: 'todo/write',
      data: todo.data,
      replay: false,
    });
    expect(projectExtensionSessionEvent('session-1', todo, true)).toMatchObject({ replay: true });
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

function createVoidDeferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

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

  it('resolves the exact DSH Session sandbox policy for every Host Tool dispatch', () => {
    const source = readPackageFile('src/index.ts');
    const hostTools = source.slice(
      source.indexOf('const hostTools:'),
      source.indexOf("ctx.provide('opennekoHostTools'"),
    );
    expect(source).toContain("import type {} from '@deepseek-ai/dsh-sandbox-policy'");
    expect(source).toContain("'sandboxPolicy'");
    expect(hostTools).toMatch(
      /ctx\.sandboxPolicy\.resolve\(\{ session: agent\.session \}\)\.mode/u,
    );
    expect(hostTools).toMatch(/decodeDshAcpDomainToolRequest\(\{[\s\S]*sandboxMode,/u);
    expect(hostTools).not.toMatch(/permissionPresets|defaultPreset/u);
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

  it('records an actionable command diagnostic when connection teardown interrupts compaction', () => {
    const source = readPackageFile('src/index.ts');

    expect(source).toContain(
      'Command interrupted because the OpenNeko Agent runtime connection closed. Retry after the runtime is available.',
    );
    expect(source).toMatch(
      /record\.commandAbort\?\.abort\(new Error\(COMMAND_CONNECTION_CLOSED_DIAGNOSTIC\)\)/u,
    );
    expect(source).not.toContain(
      "record.commandAbort?.abort(new Error('OpenNeko ACP bridge closed.'))",
    );
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
    expect(source).toContain('const requireReadyOwned = async');
    expect(source).toContain('current.replacement = replacement');
    expect(source).toMatch(
      /DSH_ACP_EXTENSION_METHODS\.readPermissionPresets[\s\S]*await requireReadyOwned\(sessionId\)/u,
    );
    expect(source).not.toMatch(
      /async function replaceOwnedAgent[\s\S]*owned\.delete\(rawSessionId\);\s*await current\.outputTail/u,
    );
    expect(source).toMatch(
      /catch \(error\) \{\s*if \(owned\.get\(rawSessionId\) === current\) owned\.delete\(rawSessionId\);\s*throw error/u,
    );
    expect(source).toMatch(
      /const quiesce[\s\S]*record\.replacement !== undefined[\s\S]*await record\.replacement\.catch/u,
    );
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

  it('implements inbox send-now only through the public DSH Inbox and keepInbox cancellation', () => {
    const source = readPackageFile('src/index.ts');

    expect(source).toMatch(/DSH_ACP_EXTENSION_METHODS\.sendInboxMessageNow/u);
    expect(source).toMatch(
      /agent\.inbox\.nextTurn\.findIndex[\s\S]*agent\.inbox\.splice\('next-turn'[\s\S]*agent\.inbox\.prepend\('next-turn'[\s\S]*agent\.cancel\(\{ kind: 'user' \}, \{ keepInbox: true \}\)/u,
    );
    expect(source).toContain('Inbox send-now requires a running Session');
    expect(source).toContain('Inbox message is not pending for a future Turn');
    expect(source).not.toMatch(/sendInboxMessageNow[\s\S]*agent\.steer\(/u);
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
