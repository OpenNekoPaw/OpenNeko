import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentPresentationI18nProvider } from '../../../i18n/I18nContext';
import { ComposerConfigMenu } from './ComposerConfigMenu';
import { DEFAULT_GENERATION_PARAMS } from './types';

describe('Composer model configuration', () => {
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
  });
});
