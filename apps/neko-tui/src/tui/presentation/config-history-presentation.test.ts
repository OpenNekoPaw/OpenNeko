import { describe, expect, it } from 'vitest';
import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { createStrictTranslator, type SupportedLocale } from '@neko/shared/i18n';
import { createAgentTerminalPresentationContext } from './context';
import {
  presentConfigCommand,
  presentHistoryCommand,
  presentResumeCommand,
} from './config-history-presentation';
import { CLI_TERMINAL_MESSAGE_SOURCE } from './terminal-messages';

const FIXED_TIME = Date.UTC(2026, 6, 11, 4, 5, 6);

describe('config, resume, and history presentation', () => {
  it('localizes owned config chrome while preserving provider and model values', () => {
    const semantic = {
      kind: 'providers' as const,
      providers: [
        {
          id: 'provider-原文',
          displayName: 'External Provider 名称',
          type: 'openai-compatible',
          hasApiKey: true,
          models: ['model-alpha', '模型-beta'],
        },
      ],
    };

    const en = presentConfigCommand(semantic, createContext('en'));
    const zh = presentConfigCommand(semantic, createContext('zh-cn'));

    expect(en.kind).toBe('output');
    expect(zh.kind).toBe('output');
    if (en.kind !== 'output' || zh.kind !== 'output') throw new Error('Expected output');
    expect(en.output).toContain('Available Providers:');
    expect(zh.output).toContain('可用提供者：');
    for (const value of [
      'provider-原文',
      'External Provider 名称',
      'openai-compatible',
      'model-alpha',
      '模型-beta',
    ]) {
      expect(en.output).toContain(value);
      expect(zh.output).toContain(value);
    }
  });

  it('localizes process config status without slash-only usage while preserving values', () => {
    const semantic = {
      kind: 'status' as const,
      surface: 'process' as const,
      config: {
        provider: 'provider-原文',
        model: 'model/原文',
        maskedApiKey: '***原文',
        baseUrl: 'https://example.invalid/原文',
        maxOutputTokens: 4096,
        temperature: 0.7,
        verbose: true,
        outputFormat: 'markdown-original',
        workDir: '/workspace/原文',
        mcpServerCount: 2,
      },
    };

    const en = presentConfigCommand(semantic, createContext('en'));
    const zh = presentConfigCommand(semantic, createContext('zh-cn'));
    if (en.kind !== 'output' || zh.kind !== 'output') throw new Error('Expected output');

    expect(en.output).toContain('Current Configuration:');
    expect(en.output).toContain('  Provider: provider-原文');
    expect(en.output).toContain('  Work Dir: /workspace/原文');
    expect(en.output).toContain('  MCP Servers: 2');
    expect(zh.output).toContain('当前配置：');
    expect(zh.output).toContain('  提供者：provider-原文');
    expect(zh.output).toContain('  工作目录：/workspace/原文');
    expect(zh.output).toContain('  MCP 服务器：2');
    expect(en.output).not.toContain('/config set');
    expect(zh.output).not.toContain('/config set');

    for (const value of [
      'provider-原文',
      'model/原文',
      '***原文',
      'https://example.invalid/原文',
      'markdown-original',
      '/workspace/原文',
    ]) {
      expect(en.output).toContain(value);
      expect(zh.output).toContain(value);
    }
  });

  it('uses explicit resume count variants and deterministic invocation formatting', () => {
    const one = presentResumeCommand(
      { kind: 'resumed', title: '标题 Original', messageCount: 1, updatedAt: FIXED_TIME },
      createContext('en'),
    );
    const many = presentResumeCommand(
      { kind: 'resumed', title: '标题 Original', messageCount: 2, updatedAt: FIXED_TIME },
      createContext('en'),
    );
    const zh = presentResumeCommand(
      { kind: 'resumed', title: '标题 Original', messageCount: 2, updatedAt: FIXED_TIME },
      createContext('zh-cn'),
    );

    expect(one).toEqual({
      kind: 'output',
      output: 'Resumed: "标题 Original" (1 message, 2026-07-11T04:05:06.000Z)',
    });
    expect(many).toEqual({
      kind: 'output',
      output: 'Resumed: "标题 Original" (2 messages, 2026-07-11T04:05:06.000Z)',
    });
    expect(zh).toEqual({
      kind: 'output',
      output: '已恢复：“标题 Original”（2 条消息，2026-07-11T04:05:06.000Z）',
    });
  });

  it('preserves conversation identity and custom history preview across locales', () => {
    const conversations = {
      kind: 'conversations' as const,
      conversations: [
        {
          id: 'conv-原文-42',
          title: 'Storyboard 原标题',
          updatedAt: FIXED_TIME,
          messageCount: 3,
          current: true,
        },
      ],
    };
    const history = {
      kind: 'history' as const,
      rows: [{ role: 'user' as const, preview: '用户原始内容 / untouched' }],
    };

    for (const locale of ['en', 'zh-cn'] as const) {
      const resumeProjection = presentResumeCommand(conversations, createContext(locale));
      const historyProjection = presentHistoryCommand(history, createContext(locale));
      if (resumeProjection.kind !== 'output' || historyProjection.kind !== 'output') {
        throw new Error('Expected output');
      }
      expect(resumeProjection.output).toContain('conv-原文-42');
      expect(resumeProjection.output).toContain('Storyboard 原标题');
      expect(historyProjection.output).toContain('用户原始内容 / untouched');
    }
  });

  it('keeps diagnostic codes stable and wraps storage detail unchanged', () => {
    const semantic = {
      kind: 'diagnostic' as const,
      code: 'storage-failed' as const,
      detail: 'EACCES: /external/路径',
    };

    const en = presentResumeCommand(semantic, createContext('en'));
    const zh = presentResumeCommand(semantic, createContext('zh-cn'));

    expect(en).toEqual({
      kind: 'error',
      diagnosticCode: 'resume.storage-failed',
      error: 'Failed to read conversation storage: EACCES: /external/路径',
    });
    expect(zh).toEqual({
      kind: 'error',
      diagnosticCode: 'resume.storage-failed',
      error: '读取对话存储失败：EACCES: /external/路径',
    });
  });
});

function createContext(locale: SupportedLocale) {
  return createAgentTerminalPresentationContext({
    translator: createStrictTranslator(locale, [
      AGENT_COMMAND_MESSAGE_SOURCE,
      CLI_TERMINAL_MESSAGE_SOURCE,
    ] as const),
    formatters: {
      count: String,
      dateTime: (value) => new Date(value).toISOString(),
      duration: String,
      bytes: String,
    },
  });
}
