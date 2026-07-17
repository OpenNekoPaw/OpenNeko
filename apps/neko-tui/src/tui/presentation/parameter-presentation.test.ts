import { describe, expect, it } from 'vitest';
import { createTestAgentTerminalPresentation } from './testing';
import { presentParameterCommand } from './parameter-presentation';

describe('presentParameterCommand', () => {
  it('preserves parameter identities and row order across locales', () => {
    const result = {
      kind: 'status',
      config: {
        reasoningPreset: 'deep',
        advanced: { temperature: 0.5, serviceTier: 'fast' },
      },
    } as const;

    expect(presentParameterCommand(result, createTestAgentTerminalPresentation('en'))).toEqual({
      kind: 'output',
      output:
        'LLM Parameters:\n  reasoning: deep\n  verbosity: (default)\n  creativity: (default)\n  advanced:\n    temperature: 0.5\n    serviceTier: fast\n\nUsage: /param set <reasoning|verbosity|creativity|temperature|topP|maxOutputTokens|reasoningEffort|thinkingBudget|serviceTier> <value>',
    });
    expect(presentParameterCommand(result, createTestAgentTerminalPresentation('zh-cn'))).toEqual({
      kind: 'output',
      output:
        'LLM 参数：\n  reasoning：deep\n  verbosity：（默认）\n  creativity：（默认）\n  高级参数：\n    temperature：0.5\n    serviceTier：fast\n\n用法：/param set <reasoning|verbosity|creativity|temperature|topP|maxOutputTokens|reasoningEffort|thinkingBudget|serviceTier> <value>',
    });
  });

  it('projects semantic validation diagnostics and preserves stable fields across locales', () => {
    const result = {
      kind: 'diagnostic',
      diagnostic: {
        code: 'validation-failed',
        causes: [
          { code: 'unsupported-temperature', field: 'temperature' },
          { code: 'model-not-configured', modelId: '模型/原文' },
        ],
      },
    } as const;

    expect(presentParameterCommand(result, createTestAgentTerminalPresentation('en'))).toEqual({
      kind: 'error',
      diagnosticCode: 'parameter.validation-failed',
      error:
        'Parameter validation failed\nSelected model does not support temperature parameter: temperature\nModel "模型/原文" is not configured.',
    });
    expect(presentParameterCommand(result, createTestAgentTerminalPresentation('zh-cn'))).toEqual({
      kind: 'error',
      diagnosticCode: 'parameter.validation-failed',
      error:
        '参数校验失败\n所选模型不支持 temperature 参数：temperature\n模型 "模型/原文" 未配置。',
    });
  });

  it('projects applied parameter rows without accepting a preformatted summary', () => {
    expect(
      presentParameterCommand(
        {
          kind: 'updated',
          name: 'reasoning',
          value: 'deep',
          application: {
            rows: [{ name: 'thinkingBudget', value: 12000 }],
            providerOptionNames: ['reasoning_effort'],
          },
        },
        createTestAgentTerminalPresentation('zh-cn'),
      ),
    ).toEqual({
      kind: 'output',
      output:
        '参数已更新：reasoning = deep\n已应用参数：\n  thinkingBudget = 12000\n  providerOptions = reasoning_effort',
    });
  });
});
