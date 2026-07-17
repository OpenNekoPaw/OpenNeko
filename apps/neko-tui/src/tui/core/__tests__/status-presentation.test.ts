import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { createStrictTranslator } from '@neko/shared/i18n';
import { DEFAULT_CLI_CONFIG } from '../types';
import { presentTuiStatus, type TuiStatusSnapshot } from '../status-presentation';
import { createAgentTerminalPresentationContext } from '../../presentation/context';
import { CLI_TERMINAL_MESSAGE_SOURCE } from '../../presentation/terminal-messages';

function createContext(locale: 'en' | 'zh-cn') {
  return createAgentTerminalPresentationContext({
    translator: createStrictTranslator(locale, [
      AGENT_COMMAND_MESSAGE_SOURCE,
      CLI_TERMINAL_MESSAGE_SOURCE,
    ] as const),
    formatters: {
      count: (value) => new Intl.NumberFormat(locale).format(value),
      dateTime: (value) => String(value),
      duration: (value) => String(value),
      bytes: (value) => String(value),
    },
  });
}

function createSnapshot(overrides: Partial<TuiStatusSnapshot> = {}): TuiStatusSnapshot {
  return {
    config: {
      ...DEFAULT_CLI_CONFIG,
      chatModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
      defaultMediaModels: { image: 'openai:gpt-image-1' },
      perceptionModels: { image: 'google:gemini-flash' },
      llmConfig: { reasoningPreset: 'deep' },
    },
    execution: { sessionMode: 'agent', executionMode: 'auto', status: 'idle' },
    usage: { input: 1000, output: 234, total: 1234 },
    contextTokenCount: 321,
    userConfigPath: '/Users/neko/.neko/config.toml',
    ...overrides,
  };
}

describe('presentTuiStatus', () => {
  it('renders the same semantic snapshot in English and Chinese while preserving stable values', () => {
    const snapshot = createSnapshot();

    const english = presentTuiStatus(snapshot, createContext('en'));
    const chinese = presentTuiStatus(snapshot, createContext('zh-cn'));

    expect(english).toBe(
      [
        'Model: anthropic:claude-sonnet',
        'Session: agent',
        'Mode: auto',
        'Status: idle',
        'Media (image): openai:gpt-image-1',
        'Perception (image): google:gemini-flash',
        'Parameter (reasoning): deep',
        'Tokens: 1,234',
        'Context tokens: 321',
        'User config: /Users/neko/.neko/config.toml',
      ].join('\n'),
    );
    expect(chinese).toBe(
      [
        '模型：anthropic:claude-sonnet',
        '会话类型：智能体',
        '执行模式：自动',
        '状态：空闲',
        '媒体模型（图像）：openai:gpt-image-1',
        '感知模型（图像）：google:gemini-flash',
        '参数（reasoning）：deep',
        'Token：1,234',
        '上下文 Token：321',
        '用户配置：/Users/neko/.neko/config.toml',
      ].join('\n'),
    );
  });

  it('omits optional rows by semantic absence without fallback prose', () => {
    const output = presentTuiStatus(
      createSnapshot({
        contextTokenCount: undefined,
        messageQueue: undefined,
        runningTask: undefined,
      }),
      createContext('en'),
    );

    expect(output).not.toContain('Context tokens:');
    expect(output).not.toContain('Queue:');
    expect(output).not.toContain('Task:');
    expect(output).not.toMatch(/unknown|N\/A|unavailable/i);
  });

  it('preserves the required config path exactly and fails visibly when it is absent', () => {
    const exactPath = '/Users/neko/../neko/.neko/missing-config.toml';
    const output = presentTuiStatus(
      createSnapshot({ userConfigPath: exactPath }),
      createContext('en'),
    );

    expect(output).toContain(`User config: ${exactPath}`);
    expect(() =>
      presentTuiStatus(createSnapshot({ userConfigPath: '' }), createContext('en')),
    ).toThrow('requires userConfigPath');
  });

  it('is deterministic for a repeated readonly snapshot without freezing runtime data', () => {
    const snapshot = createSnapshot();
    const context = createContext('en');

    expect(Object.isFrozen(snapshot)).toBe(false);
    expect(Object.isFrozen(snapshot.config)).toBe(false);
    const first = presentTuiStatus(snapshot, context);
    const second = presentTuiStatus(snapshot, context);

    expect(second).toBe(first);
    expect(Object.isFrozen(snapshot)).toBe(false);
    expect(Object.isFrozen(snapshot.config)).toBe(false);
  });

  it('keeps the pure Presenter module free of stores, config readers, paths, and filesystem access', () => {
    const source = readFileSync(new URL('../status-presentation.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(
      /from ['"][^'"]*(?:store|config-reader|node:path|node:fs)[^'"]*['"]/,
    );
    expect(source).not.toContain('getUserConfigPath');
    expect(source).not.toContain('useAgentStore');
    expect(source).not.toContain('useConfigStore');
  });
});
