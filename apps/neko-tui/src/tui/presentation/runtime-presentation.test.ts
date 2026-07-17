import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { createStrictTranslator } from '@neko/shared/i18n';
import { describe, expect, it } from 'vitest';
import { createAgentTerminalPresentationContext } from './context';
import { createAgentTerminalFormatters } from './formatters';
import {
  presentMediaBackgroundDiagnostic,
  presentMediaResultPersistenceFailure,
  presentContinuationReady,
  presentQueuedContinuation,
  presentResourceCacheGcFailure,
  presentResumeFallback,
  presentSkillInvocationRejected,
  presentTaskResultContinuation,
  presentWorkspaceContentDiagnostic,
} from './runtime-presentation';
import { CLI_TERMINAL_MESSAGE_SOURCE } from './terminal-messages';

function createPresentation(locale: 'en' | 'zh-cn') {
  return createAgentTerminalPresentationContext({
    translator: createStrictTranslator(locale, [
      AGENT_COMMAND_MESSAGE_SOURCE,
      CLI_TERMINAL_MESSAGE_SOURCE,
    ] as const),
    formatters: createAgentTerminalFormatters({ locale, timeZone: 'UTC' }),
  });
}

describe('runtime presentation', () => {
  it('localizes workspace diagnostics while preserving paths and external details', () => {
    expect(
      presentWorkspaceContentDiagnostic(
        {
          code: 'parse-failed',
          filePath: '/external/项目/settings.json',
          detail: 'Unexpected token 原文',
        },
        createPresentation('zh-cn'),
      ),
    ).toBe('解析 /external/项目/settings.json 失败：Unexpected token 原文');
  });

  it('localizes task continuation chrome without rewriting the prompt', () => {
    expect(
      presentTaskResultContinuation('Inspect task-42 /external/原文', createPresentation('zh-cn')),
    ).toBe('任务结果已就绪。继续执行：Inspect task-42 /external/原文');
  });

  it('localizes continuation transcript chrome without rewriting stable identifiers', () => {
    const presentation = createPresentation('zh-cn');

    expect(
      presentContinuationReady('task-result-continuation', { taskId: 'task-原文' }, presentation),
    ).toBe('任务结果 task-原文 已就绪，将从已完成的异步结果继续执行。');
    expect(
      presentContinuationReady(
        'subagent-result-continuation',
        { subagentId: 'subagent-原文' },
        presentation,
      ),
    ).toBe('子 Agent 结果 subagent-原文 已就绪，将从已完成的子 Agent 结果继续执行。');
    expect(presentContinuationReady('system-continuation', undefined, presentation)).toBe(
      '系统续跑已就绪，将继续执行 Agent。',
    );
  });

  it('localizes queued continuation variants while preserving stable identifiers', () => {
    const presentation = createPresentation('zh-cn');
    const base = {
      conversationId: 'conv-原文',
      content: 'external prompt',
      createdAt: 1,
    };

    expect(
      presentQueuedContinuation(
        {
          ...base,
          id: 'queue-task',
          source: 'task-result-continuation',
          metadata: { taskId: 'task-42' },
        },
        2,
        presentation,
      ),
    ).toBe('任务续跑已入队：task-42（2 条待处理）');
    expect(
      presentQueuedContinuation(
        {
          ...base,
          id: 'queue-subagent',
          source: 'subagent-result-continuation',
          metadata: { subagentId: 'subagent-原文' },
        },
        3,
        presentation,
      ),
    ).toBe('子 Agent 结果续跑已入队：subagent-原文（3 条待处理）');
    expect(
      presentQueuedContinuation(
        { ...base, id: 'system-原文', source: 'system-continuation' },
        1,
        presentation,
      ),
    ).toBe('系统续跑已入队：system-原文（1 条待处理）');
  });

  it('localizes runtime recovery notices without rewriting external values', () => {
    const presentation = createPresentation('zh-cn');

    expect(presentResourceCacheGcFailure('EACCES 原文', presentation)).toBe(
      '启动时清理资源缓存失败：EACCES 原文',
    );
    expect(presentResumeFallback('conv-原文', presentation)).toBe(
      '未找到对话“conv-原文”；将开始新对话。',
    );
    expect(presentSkillInvocationRejected('skill-原文', presentation)).toBe(
      'Skill“skill-原文”不可用。',
    );
  });

  it('projects typed media diagnostics instead of wrapping legacy English prose', () => {
    expect(
      presentMediaBackgroundDiagnostic(
        { code: 'progress-delivery-failed', taskId: 'task-42', error: new Error('EACCES 原文') },
        createPresentation('zh-cn'),
      ),
    ).toBe('传递媒体任务进度失败：task-42：EACCES 原文');
    expect(
      presentMediaResultPersistenceFailure(new Error('provider 原文'), createPresentation('zh-cn')),
    ).toBe('保存媒体任务结果 URL 失败：provider 原文');
  });
});
