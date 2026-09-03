import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
          mediaModelParameterProfiles={{}}
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
          mediaModelParameterProfiles={{}}
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
          mediaModelParameterProfiles={{}}
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

  it('renders and retains exact image and video parameters from selected model profiles', () => {
    function ProfiledMenu() {
      const [params, setParams] = useState(DEFAULT_GENERATION_PARAMS);
      return (
        <AgentPresentationI18nProvider locale="en">
          <ComposerConfigMenu
            activeMode="agent"
            availableModels={[chatModel()]}
            selectedModel="chat-provider:chat"
            onModelSelect={vi.fn()}
            mediaModelSelection={{
              image: 'media-provider:gpt-image-2',
              video: 'media-provider:minimax-h3',
              audio: 'none',
              music: 'none',
            }}
            availableMediaModels={[]}
            mediaModelParameterProfiles={{
              image: imageProfile(),
              video: videoProfile(),
            }}
            onMediaModelSelect={vi.fn()}
            genParams={params}
            onGenParamsChange={(category, partial) =>
              setParams((current) => ({
                ...current,
                [category]: { ...current[category], ...partial },
              }))
            }
          />
        </AgentPresentationI18nProvider>
      );
    }

    render(<ProfiledMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Configure models' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Image' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Parameters' }));

    const imageDialog = screen.getByRole('dialog', { name: 'Creation configuration' });
    const imageText = imageDialog.textContent ?? '';
    expect(imageText).toContain('1:1');
    expect(imageText).toContain('1K');
    expect(imageText).toContain('2K');
    expect(imageText).toContain('4K');
    expect(imageText).toContain('Quality');
    expect(imageText).not.toContain('512');
    expect(imageText).not.toContain('720p');
    fireEvent.click(within(imageDialog).getByRole('radio', { name: '2K' }));
    expect(
      within(imageDialog).getByRole('radio', { name: '2K' }).getAttribute('aria-checked'),
    ).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Video' }));
    const videoDialog = screen.getByRole('dialog', { name: 'Creation configuration' });
    const videoText = videoDialog.textContent ?? '';
    expect(videoText).toContain('768P');
    expect(videoText).toContain('15s');
    expect(videoText).not.toContain('1080p');
    expect(videoText).not.toContain('AUTO');
    expect(videoText).not.toContain('Frame rate');
    fireEvent.click(within(videoDialog).getByRole('radio', { name: '6s' }));
    expect(
      within(videoDialog).getByRole('radio', { name: '6s' }).getAttribute('aria-checked'),
    ).toBe('true');
  });
});

function chatModel() {
  return {
    id: 'chat-provider:chat',
    label: 'Chat',
    providerId: 'chat-provider',
    modelId: 'chat',
    category: 'llm' as const,
    capabilities: ['chat'],
  };
}

function imageProfile() {
  return {
    kind: 'image' as const,
    controls: {
      aspectRatio: {
        kind: 'string-enum' as const,
        required: true,
        values: ['1:1', '16:9', '9:16', '3:4', '4:3'],
        defaultValue: '1:1',
      },
      resolution: {
        kind: 'integer' as const,
        required: true,
        min: 1024,
        max: 4096,
        step: 1024,
        suggestedValues: [1024, 2048, 4096],
        defaultValue: 1024,
      },
      quality: {
        kind: 'string-enum' as const,
        required: true,
        values: ['low', 'standard', 'hd'],
        defaultValue: 'standard',
      },
    },
    fixed: { outputCount: 1 as const },
  };
}

function videoProfile() {
  return {
    kind: 'video' as const,
    supportedParameters: ['duration', 'resolution', 'aspectRatio'] as const,
    controls: {
      aspectRatio: {
        kind: 'string-enum' as const,
        required: true,
        values: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        defaultValue: '16:9',
      },
      resolution: {
        kind: 'string-enum' as const,
        required: true,
        values: ['768P', '2K'],
        defaultValue: '768P',
      },
      duration: {
        kind: 'integer' as const,
        required: true,
        min: 4,
        max: 15,
        step: 1,
        defaultValue: 5,
      },
    },
    fixed: { outputCount: 1 as const },
  };
}
