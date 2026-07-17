/**
 * Test Utilities - Mock Factories
 *
 * Shared mock factories for neko-agent tests.
 */

import { vi } from 'vitest';
import type { AgentSession, CommandContext, ILLMClient } from '@neko/agent';

/**
 * Create mock AgentSession
 */
export function createMockSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    id: 'test-session-id',
    messages: [],
    config: {
      model: 'claude-sonnet-4-6',
      temperature: 0.7,
      maxTokens: 4096,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AgentSession;
}

/**
 * Create mock CommandContext
 */
export function createMockCommandContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    session: createMockSession(),
    config: {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      delete: vi.fn(),
    },
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    workspace: {
      rootPath: '/test/workspace',
      name: 'test-workspace',
    },
    ...overrides,
  } as unknown as CommandContext;
}

/**
 * Create mock LLM Client
 */
export function createMockLLMClient(): ILLMClient {
  return {
    chat: vi.fn().mockResolvedValue({
      content: 'Mock LLM response',
      role: 'assistant',
    }),
    stream: vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_delta', delta: 'Mock ' };
        yield { type: 'content_delta', delta: 'stream' };
      },
    }),
    abort: vi.fn(),
  } as unknown as ILLMClient;
}

/**
 * Create mock VSCode API
 */
export function createMockVSCodeAPI() {
  return {
    workspace: {
      fs: {
        readFile: vi.fn().mockResolvedValue(new Uint8Array()),
        writeFile: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        stat: vi.fn().mockResolvedValue({ type: 1, size: 0, ctime: 0, mtime: 0 }),
      },
      workspaceFolders: [
        {
          uri: { fsPath: '/test/workspace' },
          name: 'test-workspace',
          index: 0,
        },
      ],
    },
    window: {
      showInformationMessage: vi.fn().mockResolvedValue(undefined),
      showWarningMessage: vi.fn().mockResolvedValue(undefined),
      showErrorMessage: vi.fn().mockResolvedValue(undefined),
    },
    commands: {
      registerCommand: vi.fn(),
      executeCommand: vi.fn().mockResolvedValue(undefined),
    },
  };
}

/**
 * Create mock file system
 */
export function createMockFileSystem() {
  const files = new Map<string, string>();

  return {
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (!content) throw new Error(`File not found: ${path}`);
      return Buffer.from(content);
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
    exists: vi.fn(async (path: string) => files.has(path)),
    delete: vi.fn(async (path: string) => files.delete(path)),
    list: vi.fn(async () => Array.from(files.keys())),
    clear: () => files.clear(),
    _files: files, // For test inspection
  };
}

/**
 * Create mock logger
 */
export function createMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  };
}
