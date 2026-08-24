import type { ChatModelOption } from '@neko/ai-contracts';
import type { MessageBundle, SupportedLocale } from '@neko/ui/i18n';
import { describe, expect, it } from 'vitest';
import { agentPresentationMessages } from '../../../i18n/presentation-messages';
import { buildModelTags, groupModelOptionsByProvider } from './model-option-presentation';

const llmModel: ChatModelOption = {
  id: 'neko-api:gpt-5.6-luna',
  label: 'Neko API Chat / GPT 5.6 Luna',
  providerLabel: 'Neko API Chat',
  providerId: 'neko-api',
  modelId: 'gpt-5.6-luna',
  source: 'explicit-config',
  connectionKind: 'gateway',
  category: 'llm',
  capabilities: ['chat', 'vision', 'function_calling', 'streaming'],
};

describe('model option presentation i18n', () => {
  it('presents model and provider tags in English', () => {
    const t = createTranslator('en');

    expect(buildModelTags(llmModel, t)).toEqual(['LLM', 'Vision', 'Tools', 'Streaming']);
    expect(groupModelOptionsByProvider([llmModel], t)[0]?.tags).toEqual(['Custom', 'Gateway']);
  });

  it('presents model and provider tags in Simplified Chinese', () => {
    const t = createTranslator('zh-cn');

    expect(buildModelTags(llmModel, t)).toEqual(['LLM', '视觉', '工具调用', '流式输出']);
    expect(groupModelOptionsByProvider([llmModel], t)[0]?.tags).toEqual(['自定义', '网关']);
  });

  it('localizes every visible media capability tag', () => {
    const t = createTranslator('zh-cn');
    const cases: readonly [ChatModelOption['category'], readonly string[], readonly string[]][] = [
      [
        'image',
        ['text_to_image', 'image_to_image', 'image_edit'],
        ['图像', '文生图', '图生图', '图像编辑'],
      ],
      [
        'video',
        ['text_to_video', 'image_to_video', 'video_to_video', 'video_edit'],
        ['视频', '文生视频', '图生视频', '视频转视频', '视频编辑'],
      ],
      [
        'audio',
        ['text_to_audio', 'audio.tts', 'audio.asr', 'text_to_music'],
        ['音频', '文生音频', '语音合成', '语音识别', '文生音乐'],
      ],
    ];

    for (const [category, capabilities, expected] of cases) {
      expect(buildModelTags({ ...llmModel, category, capabilities }, t)).toEqual(expected);
    }
  });
});

function createTranslator(locale: SupportedLocale): (key: string) => string {
  const messages: MessageBundle = agentPresentationMessages[locale];
  return (key) => messages[key] ?? key;
}
