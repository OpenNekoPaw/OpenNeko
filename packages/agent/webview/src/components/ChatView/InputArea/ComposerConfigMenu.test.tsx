import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentPresentationI18nProvider } from '../../../i18n/I18nContext';
import { ComposerConfigMenu } from './ComposerConfigMenu';
import { DEFAULT_GENERATION_PARAMS } from './types';

describe('Composer model configuration', () => {
  it('distinguishes a loading catalog from a ready empty catalog', () => {
    const view = render(
      <AgentPresentationI18nProvider locale="en">
        <ComposerConfigMenu
          activeMode="agent"
          modelCatalogStatus="loading"
          availableModels={[]}
          selectedModel=""
          onModelSelect={vi.fn()}
          mediaModelSelection={{ image: 'none', video: 'none', audio: 'none', music: 'none' }}
          availableMediaModels={[]}
          onMediaModelSelect={vi.fn()}
          genParams={DEFAULT_GENERATION_PARAMS}
          onGenParamsChange={vi.fn()}
        />
      </AgentPresentationI18nProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Configure models' });
    if (!(trigger instanceof HTMLButtonElement)) throw new Error('Model trigger is not a button.');
    expect(trigger.disabled).toBe(true);
    expect(trigger.textContent).toContain('Loading models...');
    expect(screen.queryByText('No available models')).toBeNull();

    view.rerender(
      <AgentPresentationI18nProvider locale="en">
        <ComposerConfigMenu
          activeMode="agent"
          modelCatalogStatus="ready"
          availableModels={[]}
          selectedModel=""
          onModelSelect={vi.fn()}
          mediaModelSelection={{ image: 'none', video: 'none', audio: 'none', music: 'none' }}
          availableMediaModels={[]}
          onMediaModelSelect={vi.fn()}
          genParams={DEFAULT_GENERATION_PARAMS}
          onGenParamsChange={vi.fn()}
        />
      </AgentPresentationI18nProvider>,
    );

    expect(trigger.disabled).toBe(false);
    expect(trigger.textContent).toContain('No available models');
  });

  it('shows only media generation choices', () => {
    render(
      <AgentPresentationI18nProvider locale="en">
        <ComposerConfigMenu
          activeMode="agent"
          availableModels={[
            {
              id: 'chat-provider:multimodal-chat',
              label: 'Multimodal Chat',
              providerId: 'chat-provider',
              modelId: 'multimodal-chat',
              category: 'llm',
              capabilities: ['chat', 'vision'],
            },
          ]}
          selectedModel="chat-provider:multimodal-chat"
          onModelSelect={vi.fn()}
          mediaModelSelection={{
            image: 'media-provider:image-generator',
            video: 'none',
            audio: 'none',
            music: 'media-provider:music-generator',
          }}
          availableMediaModels={[
            {
              id: 'media-provider:image-generator',
              label: 'Image Generator',
              providerId: 'media-provider',
              modelId: 'image-generator',
              category: 'image',
              capabilities: ['image.generate'],
            },
            {
              id: 'media-provider:music-generator',
              label: 'Music Generator',
              providerId: 'media-provider',
              modelId: 'music-generator',
              category: 'music',
              capabilities: ['audio.music.generate'],
            },
          ]}
          onMediaModelSelect={vi.fn()}
          genParams={DEFAULT_GENERATION_PARAMS}
          onGenParamsChange={vi.fn()}
        />
      </AgentPresentationI18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Configure models' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Image' }));

    const dialog = screen.getByRole('dialog', { name: 'Creation configuration' });
    expect(dialog.textContent).toContain('Image generation model');
    expect(dialog.textContent).toContain('Image Generator');

    fireEvent.click(screen.getByRole('tab', { name: 'Music' }));
    expect(dialog.textContent).toContain('Music generation model');
    expect(dialog.textContent).toContain('Music Generator');
  });
});
