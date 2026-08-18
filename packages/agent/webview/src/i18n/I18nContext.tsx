/**
 * React i18n bindings for neko-agent
 *
 * Re-exports shared Provider/hooks from @neko/shared.
 * Components import from './I18nContext' — no changes needed.
 */
import { I18nProvider, useTranslation as useUiTranslation } from '@neko/ui/i18n/react';

export { I18nProvider };

export function useTranslation(): {
  readonly locale: string;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
} {
  const value = useUiTranslation();
  const fallback = (key: string, params?: Record<string, string | number>): string => {
    const isZh = value.locale === 'zh-cn';
    const labels: Record<string, string> = isZh
      ? {
          'chat.input.attach': '添加上下文',
          'chat.input.send': '发送消息',
          'chat.input.cancel': '停止生成',
          'chat.input.message': '消息',
          'chat.modelMenu.trigger': '模型',
          'chat.executionMode.title': '执行模式',
          'chat.executionMode.plan': 'Plan',
          'chat.executionMode.ask': 'Ask',
          'chat.executionMode.auto': 'Auto',
          'chat.executionMode.planDesc': '规划后执行',
          'chat.executionMode.askDesc': '执行前询问',
          'chat.executionMode.autoDesc': '自动执行',
          'chat.input.entryPlaceholder': '输入创作指令…',
          'chat.input.workspaceCanvas.label': '工作区上下文',
          'chat.input.workspaceCanvas.canvasIndex': '画布',
          'chat.input.workspaceCanvas.board': '画板',
          'chat.entryContext.bindingBar': '上下文',
          'chat.entryContext.clearTarget': '清除上下文',
        }
      : {
          'chat.input.attach': 'Add context',
          'chat.input.send': 'Send message',
          'chat.input.cancel': 'Stop generation',
          'chat.input.message': 'Message',
          'chat.modelMenu.trigger': 'Model',
          'chat.executionMode.title': 'Execution mode',
          'chat.executionMode.plan': 'Plan',
          'chat.executionMode.ask': 'Ask',
          'chat.executionMode.auto': 'Auto',
          'chat.executionMode.planDesc': 'Plan before execution',
          'chat.executionMode.askDesc': 'Ask before execution',
          'chat.executionMode.autoDesc': 'Execute automatically',
          'chat.input.entryPlaceholder': 'Enter a creative instruction…',
          'chat.input.workspaceCanvas.label': 'Workspace context',
          'chat.input.workspaceCanvas.canvasIndex': 'Canvas',
          'chat.input.workspaceCanvas.board': 'Board',
          'chat.entryContext.bindingBar': 'Context',
          'chat.entryContext.clearTarget': 'Clear context',
        };
    const template = labels[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(params?.[name] ?? `{${name}}`),
    );
  };
  return {
    locale: value.locale,
    t: value.t ?? fallback,
  };
}
