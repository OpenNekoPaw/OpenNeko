/**
 * Test Utilities - Fixtures
 *
 * Shared test fixtures for neko-agent tests.
 */

/**
 * Valid skill markdown fixtures
 */
export const SKILL_FIXTURES = {
  valid: `---
name: test-skill
description: Test skill for unit tests
trigger: /test
tools: [read, write]
priority: 10
---

# Test Skill

This is a test skill content.

## Usage

Use this skill by typing \`/test\`.
`,

  minimal: `---
name: minimal
description: Minimal skill
---

Minimal content.
`,

  withMultipleTriggers: `---
name: multi-trigger
description: Skill with multiple triggers
trigger:
  - /cmd1
  - /cmd2
  - /cmd3
---

Multi-trigger skill.
`,

  withContext: `---
name: context-skill
description: Skill with context requirements
trigger: /deploy
context:
  fileTypes: [yaml, json]
  requiresGit: true
tools: [bash, read]
---

Context-aware skill.
`,

  invalidYaml: `---
invalid: yaml: syntax:
---

Invalid YAML frontmatter.
`,

  missingName: `---
description: Missing name field
trigger: /test
---

Missing required name field.
`,

  missingDescription: `---
name: no-desc
trigger: /test
---

Missing required description field.
`,
};

/**
 * Command fixtures
 */
export const COMMAND_FIXTURES = {
  help: '/help',
  helpWithArgs: '/help config',
  config: '/config get model',
  configSet: '/config set model claude-sonnet-4-6',
  unknown: '/unknown-command',
  withExtraSpaces: '  /help   arg1   arg2  ',
  uppercase: '/HELP',
  alias: '/h',
};

/**
 * Session message fixtures
 */
export const MESSAGE_FIXTURES = {
  userMessage: {
    role: 'user' as const,
    content: 'Test user message',
  },
  assistantMessage: {
    role: 'assistant' as const,
    content: 'Test assistant response',
  },
  systemMessage: {
    role: 'system' as const,
    content: 'Test system prompt',
  },
  toolUseMessage: {
    role: 'assistant' as const,
    content: [
      {
        type: 'tool_use' as const,
        id: 'tool-1',
        name: 'read',
        input: { path: '/test/file.ts' },
      },
    ],
  },
  toolResultMessage: {
    role: 'user' as const,
    content: [
      {
        type: 'tool_result' as const,
        tool_use_id: 'tool-1',
        content: 'File content',
      },
    ],
  },
};

/**
 * File content fixtures
 */
export const FILE_FIXTURES = {
  typescript: `export function hello(name: string): string {
  return \`Hello, \${name}!\`;
}`,

  json: `{
  "name": "test-package",
  "version": "1.0.0"
}`,

  markdown: `# Test Document

This is a test markdown file.

## Section 1

Content here.
`,

  empty: '',

  binary: Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG header
};

/**
 * Error fixtures
 */
export const ERROR_FIXTURES = {
  fileNotFound: new Error('ENOENT: no such file or directory'),
  permissionDenied: new Error('EACCES: permission denied'),
  networkError: new Error('ECONNREFUSED: connection refused'),
  timeout: new Error('ETIMEDOUT: operation timed out'),
  llmError: new Error('LLM API error: rate limit exceeded'),
};

/**
 * Config fixtures
 */
export const CONFIG_FIXTURES = {
  default: {
    model: 'claude-sonnet-4-6',
    temperature: 0.7,
    maxTokens: 4096,
    apiKey: 'test-api-key',
  },
  custom: {
    model: 'claude-opus-4-6',
    temperature: 0.9,
    maxTokens: 8192,
    apiKey: 'custom-api-key',
  },
};

export {
  createAgentWorkspaceRuntimeFixture,
  createAgentWorkspaceRuntimeFixturePaths,
  createDefaultAgentWorkspaceRuntimeUserConfig,
  createDefaultAgentWorkspaceRuntimeWorkspaceConfig,
  writeAgentWorkspaceRuntimeFixture,
  type AgentWorkspaceRuntimeFixture,
  type AgentWorkspaceRuntimeFixtureOptions,
  type AgentWorkspaceRuntimeFixturePaths,
} from './workspace-runtime';

export {
  TABLE_HEAVY_STREAM_CHUNK_COUNT,
  TABLE_HEAVY_STREAM_SOURCE_LENGTH,
  createAgentStreamRegressionCounters,
  createTableHeavyStreamFixture,
  type AgentStreamRegressionCounters,
  type TableHeavyStreamFixture,
} from './table-heavy-stream';
