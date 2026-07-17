import { describe, expect, it } from 'vitest';
import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { createStrictTranslator } from '@neko/shared/i18n';
import { createAgentTerminalPresentationContext } from './context';
import {
  presentMediaCommand,
  presentModelCommand,
  presentPerceptionCommand,
} from './model-family-presentation';
import { CLI_TERMINAL_MESSAGE_SOURCE } from './terminal-messages';

function context(locale: 'en' | 'zh-cn') {
  return createAgentTerminalPresentationContext({
    translator: createStrictTranslator(locale, [
      AGENT_COMMAND_MESSAGE_SOURCE,
      CLI_TERMINAL_MESSAGE_SOURCE,
    ] as const),
    formatters: {
      count: String,
      dateTime: String,
      duration: String,
      bytes: String,
    },
  });
}

describe('model family presenters', () => {
  it('uses direct exhaustive dispatch for model, media and perception results', () => {
    expect(
      presentModelCommand({ kind: 'selected', modelId: 'openai:gpt-5' }, context('zh-cn')),
    ).toEqual({ kind: 'output', output: '对话模型已切换为：openai:gpt-5' });
    expect(
      presentMediaCommand(
        { kind: 'selected', category: 'image', modelId: 'openai:gpt-image-1' },
        context('zh-cn'),
      ),
    ).toEqual({ kind: 'output', output: '图像模型已设为：openai:gpt-image-1' });
    expect(
      presentPerceptionCommand({ kind: 'automatic', category: 'video' }, context('zh-cn')),
    ).toEqual({ kind: 'output', output: '视频感知模型已设为自动选择。' });
  });

  it('keeps stable menu identity and external labels unchanged while localizing owned chrome', () => {
    const projection = presentMediaCommand(
      {
        kind: 'menu',
        category: 'image',
        options: [
          {
            id: 'openai:gpt-image-1',
            label: 'Contributor Label',
            providerId: 'openai',
            modelId: 'gpt-image-1',
            active: true,
          },
        ],
      },
      context('zh-cn'),
    );

    expect(projection).toEqual({
      kind: 'model-menu',
      menu: {
        title: '图像模型',
        items: [
          {
            id: 'openai:gpt-image-1',
            label: 'Contributor Label',
            description: 'openai/gpt-image-1',
            active: true,
          },
          { id: '__none__', label: '无', description: '在本会话中禁用图像生成', active: false },
        ],
      },
    });
  });

  it('renders identical semantic rows across locales while preserving stable values and markers', () => {
    const semantic = {
      kind: 'status' as const,
      categories: [
        {
          category: 'image' as const,
          currentModelId: 'openai:gpt-image-1 (Contributor Label)',
          source: 'config-default' as const,
          options: [
            {
              id: 'openai:gpt-image-1',
              label: 'Contributor Label',
              providerId: 'openai',
              modelId: 'gpt-image-1',
              active: true,
            },
          ],
        },
      ],
      scope: 'category' as const,
    };

    const en = presentMediaCommand(semantic, context('en'));
    const zh = presentMediaCommand(semantic, context('zh-cn'));

    expect(en).toEqual({
      kind: 'output',
      output: [
        'Media Model Selection:',
        'image: openai:gpt-image-1 (Contributor Label) [config default]',
        'Available image models:',
        '* openai:gpt-image-1  Contributor Label',
        '',
        'Usage: /media <image|video|audio> <provider:model|provider/model|model-id|none>',
      ].join('\n'),
    });
    expect(zh).toEqual({
      kind: 'output',
      output: [
        '媒体模型选择：',
        '图像：openai:gpt-image-1 (Contributor Label) [配置默认值]',
        '可用图像模型：',
        '* openai:gpt-image-1  Contributor Label',
        '',
        '用法：/media <image|video|audio> <provider:model|provider/model|model-id|none>',
      ].join('\n'),
    });
  });

  it('projects reset failures without requiring an unrelated category', () => {
    expect(
      presentMediaCommand(
        {
          kind: 'diagnostic',
          diagnostic: {
            code: 'media.reset-failed',
            data: {},
            externalDetail: 'RESET_DETAIL',
          },
        },
        context('zh-cn'),
      ),
    ).toEqual({
      kind: 'error',
      diagnosticCode: 'media.reset-failed',
      error: '重置媒体模型失败。: RESET_DETAIL',
    });
  });

  it('projects stable diagnostic codes with localized wrappers and unchanged external detail', () => {
    expect(
      presentModelCommand(
        {
          kind: 'diagnostic',
          diagnostic: {
            code: 'model.unknown',
            data: { modelId: 'provider:model' },
            externalDetail: 'Provider says NO_TRANSLATE',
          },
        },
        context('zh-cn'),
      ),
    ).toEqual({
      kind: 'error',
      diagnosticCode: 'model.unknown',
      error:
        '未知的对话模型标识：provider:model。使用 /model chat 查看可用对话模型。: Provider says NO_TRANSLATE',
    });
  });
});
