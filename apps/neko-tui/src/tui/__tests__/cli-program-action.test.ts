import React from 'react';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createAgentPoisonPaths, type AgentPoisonPaths } from '@neko-agent/test-utils';
import { createTuiConversationId } from '../core/tui-conversation-id';
import type { AgentTerminalInvocationContext } from '../core/node-locale-bootstrap';
import type { CLIConfig } from '../core/types';

import { createTestAgentTerminalInvocationContext } from '../presentation/testing';
interface CapturedAppProps {
  readonly config: CLIConfig;
  readonly initialPrompt?: string;
  readonly resumeConversationId?: string;
  readonly terminal: AgentTerminalInvocationContext;
}

let tempRoot: string | undefined;
const mockState = vi.hoisted(
  (): {
    capturedAppProps?: CapturedAppProps;
    config?: CLIConfig;
    poisonPaths?: AgentPoisonPaths;
    debugManagerOptions?: unknown;
    runDebugServer?: Mock;
    disposeDebugManager?: Mock;
  } => ({}),
);

vi.mock('ink', () => ({
  render: (element: { readonly props?: CapturedAppProps }) => {
    mockState.capturedAppProps = element.props;
    return { waitUntilExit: async () => undefined };
  },
}));

vi.mock('../components/App', () => ({
  App: (props: CapturedAppProps) => React.createElement('mock-app', props),
}));

vi.mock('../core/config', () => ({
  loadConfig: vi.fn(() => {
    if (!mockState.config) {
      throw new Error('Mock CLI config was not initialized');
    }
    return mockState.config;
  }),
  validateConfig: vi.fn(() => ({ valid: true, diagnostics: [] })),
  listProviders: vi.fn(() => []),
  getProviderModels: vi.fn(() => []),
}));

vi.mock('../utils/terminal', () => ({
  detectCapabilities: () => ({ supportsColor: true }),
}));

vi.mock('../core/debug-automation/session-manager', () => ({
  TuiDebugAutomationSessionManager: class {
    constructor(options: unknown) {
      mockState.debugManagerOptions = options;
      mockState.disposeDebugManager = vi.fn(async () => undefined);
    }

    async disposeAll(): Promise<void> {
      await mockState.disposeDebugManager?.();
    }
  },
}));

vi.mock('../core/debug-automation/stdio', () => ({
  runTuiDebugAutomationJsonLineServer: (...args: readonly unknown[]) => {
    if (!mockState.runDebugServer) {
      throw new Error('Mock debug automation server was not initialized');
    }
    return mockState.runDebugServer(...args);
  },
}));

afterEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mockState.capturedAppProps = undefined;
  mockState.config = undefined;
  mockState.poisonPaths = undefined;
  mockState.debugManagerOptions = undefined;
  mockState.runDebugServer = undefined;
  mockState.disposeDebugManager = undefined;
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe('createCliProgram actions', () => {
  it('passes top-level prompt arguments to the interactive App when -C selects workDir', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    const config = createConfig(tempRoot);
    mockState.config = config;

    const { createCliProgram } = await import('../cli');
    const terminal = createTestAgentTerminalInvocationContext('en');
    const program = createCliProgram(terminal);
    program.exitOverride();

    await program.parseAsync(['node', 'neko', '-C', tempRoot, '你好']);

    expect(mockState.capturedAppProps?.config.workDir).toBe(tempRoot);
    expect(mockState.capturedAppProps?.initialPrompt).toBe('你好');
    expect(mockState.capturedAppProps?.resumeConversationId).toBeUndefined();
    expect(mockState.capturedAppProps?.terminal).toBe(terminal);
  }, 30_000);

  it('rejects old cli conversation ids instead of routing them into TUI resume', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    const config = createConfig(tempRoot);
    const poison = createAgentPoisonPaths();
    mockState.config = config;
    mockState.poisonPaths = poison;

    const { createCliProgram } = await import('../cli');
    const program = createCliProgram(createTestAgentTerminalInvocationContext('en'));
    program.exitOverride();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let errorOutput = '';

    try {
      await expect(
        program.parseAsync([
          'node',
          'neko',
          '-C',
          tempRoot,
          '--resume',
          'cli-legacy-123',
          '继续刚才的任务',
        ]),
      ).rejects.toThrow('process.exit unexpectedly called with "1"');
    } finally {
      errorOutput = errorSpy.mock.calls.flat().join('\n');
      errorSpy.mockRestore();
    }

    expect(errorOutput).toContain('TUI resume conversation id must be canonical');
    expect(mockState.capturedAppProps).toBeUndefined();
    poison.readlineInteractiveResume.assertNotHit();
  });

  it('writes localized working-directory diagnostics before config or TUI startup', async () => {
    const missingPath = path.join(os.tmpdir(), `neko-cli-missing-${Date.now()}`);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { createCliProgram } = await import('../cli');
      const program = createCliProgram(createTestAgentTerminalInvocationContext('zh-cn'));
      program.exitOverride();

      await expect(program.parseAsync(['node', 'neko', '-C', missingPath, '你好'])).rejects.toThrow(
        'process.exit unexpectedly called with "1"',
      );

      expect(error.mock.calls.flat().join('\n')).toContain(`工作目录不存在：${missingPath}`);
      expect(mockState.capturedAppProps).toBeUndefined();
    } finally {
      error.mockRestore();
    }
  });

  it('routes the resume command through the Ink TUI App with an optional prompt', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    const config = createConfig(tempRoot);
    const poison = createAgentPoisonPaths();
    const conversationId = createTuiConversationId(tempRoot, {
      now: 1_714_040_000_123,
      random: new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]),
    });
    mockState.config = config;
    mockState.poisonPaths = poison;

    const { createCliProgram } = await import('../cli');
    const program = createCliProgram(createTestAgentTerminalInvocationContext('en'));
    program.exitOverride();

    await program.parseAsync([
      'node',
      'neko',
      'resume',
      '--cd',
      tempRoot,
      conversationId,
      '继续生成分镜',
    ]);

    expect(mockState.capturedAppProps?.config.workDir).toBe(tempRoot);
    expect(mockState.capturedAppProps?.resumeConversationId).toBe(conversationId);
    expect(mockState.capturedAppProps?.initialPrompt).toBe('继续生成分镜');
    poison.readlineInteractiveResume.assertNotHit();
  });

  it('routes debug automation through the local developer automation stdio server', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    mockState.config = createConfig(tempRoot);
    mockState.runDebugServer = vi.fn(async () => undefined);

    const { createCliProgram } = await import('../cli');
    const program = createCliProgram(createTestAgentTerminalInvocationContext('en'));
    program.exitOverride();

    await program.parseAsync(['node', 'neko', 'debug', 'automation', '--stdio', '-C', tempRoot]);

    expect(mockState.capturedAppProps).toBeUndefined();
    expect(mockState.debugManagerOptions).toMatchObject({ defaultWorkDir: tempRoot });
    expect(mockState.runDebugServer).toHaveBeenCalledOnce();
    expect(mockState.disposeDebugManager).toHaveBeenCalledOnce();
  });

  it('writes a localized debug automation option failure to stderr without starting the protocol', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    mockState.runDebugServer = vi.fn(async () => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const { createCliProgram } = await import('../cli');
      const program = createCliProgram(createTestAgentTerminalInvocationContext('zh-cn'));
      program.exitOverride();

      await expect(
        program.parseAsync(['node', 'neko', 'debug', 'automation', '-C', tempRoot]),
      ).rejects.toThrow('process.exit unexpectedly called with "1"');

      expect(error.mock.calls.flat().join('\n')).toContain('调试自动化需要 --stdio 选项。');
      expect(log).not.toHaveBeenCalled();
      expect(mockState.runDebugServer).not.toHaveBeenCalled();
      expect(mockState.debugManagerOptions).toBeUndefined();
    } finally {
      error.mockRestore();
      log.mockRestore();
    }
  });

  it('localizes startup chrome with the same invocation context passed to Ink', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    mockState.config = createConfig(tempRoot);
    const terminal = createTestAgentTerminalInvocationContext('zh-cn');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const { createCliProgram } = await import('../cli');
      const program = createCliProgram(terminal);
      program.exitOverride();
      await program.parseAsync(['node', 'neko', '-C', tempRoot, '开始']);
    } finally {
      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain('模型：gpt-5.5');
      expect(output).toContain(`工作目录：${tempRoot}`);
      expect(output).toContain('模式：自动');
      log.mockRestore();
    }
    expect(mockState.capturedAppProps?.terminal).toBe(terminal);
  });

  it('uses the canonical config Presenter for localized one-shot config output', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    mockState.config = createConfig(tempRoot);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const { createCliProgram } = await import('../cli');
      const program = createCliProgram(createTestAgentTerminalInvocationContext('zh-cn'));
      program.exitOverride();
      await program.parseAsync(['node', 'neko', 'config', 'show', '-C', tempRoot]);
    } finally {
      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain('当前配置：');
      expect(output).toContain('提供者：nekoapi-chat');
      expect(output).toContain('模型：gpt-5.5');
      expect(output).toContain(`工作目录：${tempRoot}`);
      expect(output).toContain('MCP 服务器：0');
      expect(output).not.toContain('/config set');
      log.mockRestore();
    }
  });

  it('keeps generated completion scripts byte-stable across UI locales', async () => {
    const outputs: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((value: unknown) => {
      outputs.push(String(value));
    });
    try {
      const { createCliProgram } = await import('../cli');
      for (const locale of ['en', 'zh-cn'] as const) {
        const program = createCliProgram(createTestAgentTerminalInvocationContext(locale));
        program.exitOverride();
        await program.parseAsync(['node', 'neko', 'completion', 'zsh']);
      }
    } finally {
      log.mockRestore();
    }
    expect(outputs).toHaveLength(2);
    expect(outputs[0]).toBe(outputs[1]);
    expect(outputs[0]).toContain('#compdef neko');
  });
});

function createConfig(workDir: string): CLIConfig {
  return {
    provider: 'nekoapi-chat',
    providerType: 'openai-chat',
    providerRequiresApiKey: false,
    model: 'gpt-5.5',
    chatModel: {
      providerId: 'nekoapi-chat',
      modelId: 'gpt-5.5',
    },
    mediaModels: [],
    maxTokens: 8192,
    temperature: 0.7,
    verbose: false,
    workDir,
    mcpServers: [],
    outputFormat: 'text',
    executionMode: 'ask',
    thinkingBudget: 0,
  };
}
