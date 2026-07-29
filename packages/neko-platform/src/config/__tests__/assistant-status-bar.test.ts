import { describe, expect, it } from 'vitest';
import type { Model } from '../../types/provider';
import { buildAssistantStatusBarPresentation } from '../assistant-status-bar';

const chatModel: Pick<Model, 'name' | 'capabilities'> = {
  name: 'claude-sonnet-4-20250514',
  capabilities: ['chat'],
};

describe('assistant status bar presenter', () => {
  it('shows a warning presentation when no chat model is enabled', () => {
    expect(
      buildAssistantStatusBarPresentation({
        enabledModels: [{ name: 'dall-e-3', capabilities: ['image_generation'] }],
      }),
    ).toEqual({
      text: '$(hubot) OpenNeko AI',
      tooltip: 'OpenNeko AI Assistant — click to open chat',
      warning: true,
    });
  });

  it('projects chat and generation models into a compact status bar label', () => {
    expect(
      buildAssistantStatusBarPresentation({
        enabledModels: [chatModel],
        generationConfig: {
          image: 'black-forest-labs/flux-dev-ultra',
          video: 'wan.wan2.1',
        },
      }),
    ).toEqual({
      text: '$(hubot) claude-sonnet-4-20…  ✨ flux-dev-ul…  🎬 wan2.1',
      tooltip: 'OpenNeko AI Assistant — click to open chat',
      warning: false,
    });
  });
});
