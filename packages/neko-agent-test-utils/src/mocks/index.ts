/**
 * Test Utilities - Mock Factories
 *
 * Shared mock factories for neko-agent tests.
 */

import { vi } from 'vitest';
import type { AgentSession, ILLMClient } from '@neko/agent';

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
