// @vitest-environment jsdom

import { I18nProvider } from '@neko/ui/i18n/react';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DesktopApplicationSettingsProjection } from '@neko/host/application-settings';
import type { OpenNekoDesktopAiModelSettingsBridge } from '@neko/host/ai-model-settings';
import {
  DesktopSettingsMainSurface,
  DesktopSettingsNavigationSurface,
  DesktopSettingsOverlaySurface,
  type DesktopSettingsSection,
} from './DesktopSettingsSurface';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import { createDesktopI18n } from './i18n';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.assign(globalThis, { ResizeObserver: TestResizeObserver });

const dialogueCapabilities = {
  status: 'available',
  providers: [
    {
      providerId: 'openai',
      displayName: 'OpenAI',
      source: 'catalog',
      settingsNamespace: 'llm-pi-ai',
      settingsPath: ['providers', 'openai'],
      providerType: 'openai',
      defaultApiUrl: '',
      connectionKind: 'direct',
      requiresApiKey: true,
    },
  ],
  protocols: ['openai-completions', 'openai-responses', 'anthropic-messages'],
  diagnostics: [],
} as const;

const generationCapabilities = [
  {
    id: 'generation-minimax-h3',
    displayName: 'MiniMax H3',
    suggestedProviderId: 'minimax-media',
    providerType: 'minimax',
    defaultApiUrl: 'https://api.minimaxi.com/v2',
    requiresApiUrl: true,
    connectionKind: 'direct',
    supportLevel: 'verified',
    requiresApiKey: true,
    allowCustomModels: false,
    supportedModelTypes: ['video'],
    modelTemplates: [
      {
        id: 'minimax-h3',
        providerType: 'minimax',
        apiName: 'MiniMax-H3',
        displayName: 'MiniMax H3',
        type: 'video',
        capabilities: ['text_to_video', 'video.generate', 'image_to_video', 'video_to_video'],
      },
    ],
  },
  {
    id: 'generation-bytedance-seedance',
    displayName: 'ByteDance Ark / Seedance',
    suggestedProviderId: 'bytedance-media',
    providerType: 'bytedance',
    defaultApiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    requiresApiUrl: true,
    connectionKind: 'direct',
    supportLevel: 'verified',
    requiresApiKey: true,
    allowCustomModels: false,
    supportedModelTypes: ['image', 'video'],
    modelTemplates: [],
  },
  {
    id: 'generation-newapi',
    displayName: 'Custom NewAPI Media',
    suggestedProviderId: 'newapi-media',
    providerType: 'newapi',
    defaultApiUrl: '',
    requiresApiUrl: true,
    connectionKind: 'gateway',
    supportLevel: 'custom',
    requiresApiKey: true,
    allowCustomModels: true,
    supportedModelTypes: ['image', 'video', 'audio'],
    modelTemplates: [],
  },
] as const;

describe('Desktop Settings surfaces', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('keeps navigation and settings mutations in separate overlay regions', async () => {
    const update = vi.fn(async () => undefined);
    const openAgentAdvanced = vi.fn(async () => undefined);
    const { container, root } = await renderSettings({ update, openAgentAdvanced });

    expect(container.querySelector('[data-settings-surface="navigation"]')).not.toBeNull();
    expect(container.querySelector('[data-settings-surface="main"]')).not.toBeNull();
    expect(container.querySelector('[data-primary-sidebar="application"]')).toBeNull();
    expect(container.querySelector('[data-primary-sidebar-frame="application"]')).toBeNull();
    expect(container.textContent).toContain('Application entry');
    expect(container.textContent).toContain('always starts with a new Entry Draft');
    expect(container.querySelector('select')).toBeNull();
    expect(update).not.toHaveBeenCalled();

    await act(async () => findButton(container, 'Agent').click());
    expect(container.textContent).not.toContain('Advanced Agent settings');
    const openConfig = findButton(container, 'Open Agent config');
    expect(openConfig.closest('.desktop-settings__group-heading')).not.toBeNull();
    await act(async () => openConfig.click());
    expect(openAgentAdvanced).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('renders the settings heading without a decorative icon', async () => {
    const { container, root } = await renderSettings();
    const heading = container.querySelector('.desktop-settings__title');

    expect(heading?.querySelector('svg')).toBeNull();
    expect(heading?.classList.contains('home-launchpad-heading')).toBe(false);
    expect(heading?.textContent).toContain('Settings');
    await act(async () => root.unmount());
  });

  it('filters only the navigation catalog without changing the active Main section', async () => {
    const { container, root } = await renderSettings();
    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('Settings fixture requires a search field.');
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!setValue) throw new Error('HTMLInputElement value setter is unavailable.');
      setValue.call(search, 'theme');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.querySelector('[data-settings-surface="navigation"]')?.textContent).toContain(
      'Appearance',
    );
    expect(container.querySelector('[data-settings-surface="main"]')?.textContent).toContain(
      'Application entry',
    );
    await act(async () => root.unmount());
  });

  it('uses the supplied overlay section and resets transient search on remount', async () => {
    const first = await renderSettings();
    const search = first.container.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('Settings fixture requires a search field.');
    await act(async () => {
      search.value = 'theme';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => first.root.unmount());

    const restored = await renderSettings({ initialSection: 'appearance' });
    expect(restored.container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe(
      '',
    );
    expect(
      restored.container.querySelector('[data-settings-surface="main"]')?.textContent,
    ).toContain('Theme');
    await act(async () => restored.root.unmount());
  });

  it('renders a modal overlay and closes without a Scene transition', async () => {
    const onClose = vi.fn();
    const { container, root } = await renderSettings({ overlay: true, onClose });

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[data-settings-overlay="true"]')).not.toBeNull();
    expect(document.querySelectorAll('h1')).toHaveLength(0);

    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Close settings"]');
    if (!close) throw new Error('Settings overlay fixture requires a close action.');
    await act(async () => close.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows provider groups directly while keeping provider editing on demand', async () => {
    const projection = {
      dialogueCapabilities,
      generationCapabilities,
      providers: [
        {
          id: 'deepseek',
          displayName: 'DeepSeek Provider',
          type: 'generic' as const,
          apiUrl: 'https://api.deepseek.com/v1',
          protocol: 'openai-chat' as const,
          connectionKind: 'direct' as const,
          enabled: true,
          supportedModelFamilies: ['dialogue', 'generation'] as const,
          credentialStatus: 'configured' as const,
        },
      ],
      models: [
        {
          id: 'deepseek-chat',
          providerId: 'deepseek',
          apiName: 'deepseek-chat',
          displayName: 'DeepSeek Dialogue',
          type: 'llm' as const,
          capabilities: ['chat', 'llm.chat', 'streaming'],
          enabled: true,
        },
        {
          id: 'image-model',
          providerId: 'deepseek',
          apiName: 'image-model',
          displayName: 'Image Model',
          type: 'image' as const,
          capabilities: ['text_to_image', 'image.generate'],
          enabled: true,
        },
        {
          id: 'audio-model',
          providerId: 'deepseek',
          apiName: 'audio-model',
          displayName: 'Audio Model',
          type: 'audio' as const,
          capabilities: ['text_to_audio', 'audio.generate'],
          enabled: true,
        },
      ],
      defaults: {
        llm: { providerId: 'deepseek', modelId: 'deepseek-chat' },
        image: { providerId: 'deepseek', modelId: 'image-model' },
      },
    };
    const response = { requestId: 'fixture', projection, runtimeEffect: 'unchanged' as const };
    const setDefault = vi.fn(async () => response);
    const deleteModel = vi.fn(async () => response);
    const aiModelSettings: OpenNekoDesktopAiModelSettingsBridge['aiModelSettings'] = {
      get: async () => projection,
      saveProvider: async () => response,
      saveModel: async () => response,
      deleteProvider: async () => response,
      deleteModel,
      setDefault,
    };
    const { container, root } = await renderSettings({
      aiModelSettings,
      initialSection: 'agent',
    });
    await act(async () => Promise.resolve());

    expect(container.textContent).not.toContain('Dialogue models');
    expect(container.textContent).not.toContain('Generation models');
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(container.querySelectorAll('.desktop-settings__management-summary')).toHaveLength(0);
    expect(container.querySelectorAll('.desktop-settings__provider-card')).toHaveLength(2);
    expect(container.querySelectorAll('.desktop-settings__model-chip')).toHaveLength(0);
    expect(container.textContent).not.toContain('Model catalog');
    expect(container.querySelector('[data-provider-group="dialogue"]')?.textContent).toContain(
      'DeepSeek Provider',
    );
    expect(container.querySelector('[data-provider-group="generation"]')?.textContent).toContain(
      'DeepSeek Provider',
    );
    expect(container.querySelectorAll('.desktop-settings__model-chip')).toHaveLength(0);

    const providerCard = container.querySelector<HTMLButtonElement>(
      '.desktop-settings__provider-card-main',
    );
    if (!providerCard) throw new Error('Provider settings fixture requires a provider card.');
    await act(async () => providerCard.click());
    expect(container.textContent).toContain('Provider settings');
    expect(container.textContent).toContain('Model catalog');
    expect(container.textContent).toContain('Dialogue models');
    expect(container.textContent).toContain('Generation models');
    expect(container.querySelectorAll('.desktop-settings__model-group')).toHaveLength(2);
    expect(container.querySelectorAll('.desktop-settings__model-chip')).toHaveLength(3);
    expect(container.querySelectorAll('.desktop-settings__model-default-badge')).toHaveLength(2);
    expect(container.querySelectorAll('.desktop-settings__model-default-action')).toHaveLength(1);
    expect(
      container
        .querySelector<HTMLButtonElement>('.desktop-settings__editor-disclosure')
        ?.getAttribute('aria-expanded'),
    ).toBe('false');

    await act(async () => findButtonContaining(container, 'Set as default').click());
    expect(setDefault).toHaveBeenCalledWith('audio', {
      providerId: 'deepseek',
      modelId: 'audio-model',
    });
    const deleteAction = [
      ...container.querySelectorAll<HTMLButtonElement>('.desktop-settings__model-delete-action'),
    ].find((candidate) => !candidate.disabled && candidate.textContent?.trim() === 'Delete');
    if (!deleteAction) throw new Error('Model fixture requires an enabled delete action.');
    await act(async () => deleteAction.click());
    await act(async () => findButton(container, 'Confirm delete').click());
    expect(deleteModel).toHaveBeenCalledWith('audio-model');
    await act(async () => root.unmount());
  });

  it('projects a local Ollama provider as dialogue-only without a credential field', async () => {
    const projection = {
      dialogueCapabilities,
      generationCapabilities,
      providers: [
        {
          id: 'ollama-local',
          displayName: 'Ollama Local',
          type: 'ollama' as const,
          apiUrl: 'http://localhost:11434',
          protocol: 'ollama' as const,
          connectionKind: 'local' as const,
          enabled: true,
          supportedModelFamilies: ['dialogue'] as const,
          credentialStatus: 'not-required' as const,
        },
      ],
      models: [modelFixture('qwen-local', 'ollama-local', 'llm')],
      defaults: {},
    };
    const response = { requestId: 'fixture', projection, runtimeEffect: 'unchanged' as const };
    const saveModel = vi.fn(async () => response);
    const aiModelSettings: OpenNekoDesktopAiModelSettingsBridge['aiModelSettings'] = {
      get: async () => projection,
      saveProvider: async () => response,
      saveModel,
      deleteProvider: async () => response,
      deleteModel: async () => response,
      setDefault: async () => response,
    };
    const { container, root } = await renderSettings({
      aiModelSettings,
      initialSection: 'agent',
    });
    await act(async () => Promise.resolve());

    const dialogue = container.querySelector('[data-provider-group="dialogue"]');
    expect(dialogue?.textContent).toContain('Ollama Local');
    expect(dialogue?.textContent).toContain('Local');
    expect(dialogue?.textContent).toContain('No credential required');
    const providerCard = dialogue?.querySelector<HTMLButtonElement>(
      '.desktop-settings__provider-card-main',
    );
    if (!providerCard) throw new Error('Ollama fixture requires a provider card.');
    await act(async () => providerCard.click());
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).toContain('Delete provider');
    await act(async () => findButtonContaining(container, 'Add model').click());
    expect(container.querySelectorAll('.desktop-settings__model-editor option')).toHaveLength(1);
    expect(container.querySelector('.desktop-settings__model-editor option')?.textContent).toBe(
      'Dialogue',
    );
    const modelEditor = container.querySelector<HTMLElement>('.desktop-settings__model-editor');
    if (!modelEditor) throw new Error('Ollama fixture requires a model editor.');
    expect(modelEditor.textContent).not.toContain('Model ID');
    expect(
      [...modelEditor.querySelectorAll<HTMLElement>('[data-model-field]')].map((field) =>
        field.getAttribute('data-model-field'),
      ),
    ).toEqual(['type', 'capabilities', 'api-name', 'display-name']);
    const apiModelNameLabel = [...modelEditor.querySelectorAll('label')].find(
      (label) => label.querySelector(':scope > span')?.textContent === 'API model name',
    );
    const apiModelNameInput = apiModelNameLabel?.querySelector<HTMLInputElement>('input');
    if (!apiModelNameInput) throw new Error('Ollama fixture requires an API model name field.');
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!setValue) throw new Error('HTMLInputElement value setter is unavailable.');
      setValue.call(apiModelNameInput, 'qwen2.5-7b');
      apiModelNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      modelEditor.querySelector<HTMLButtonElement>('button.desktop-settings__action')?.click(),
    );
    expect(saveModel).toHaveBeenCalledWith({
      providerId: 'ollama-local',
      apiName: 'qwen2.5-7b',
      displayName: 'qwen2.5-7b',
      type: 'llm',
      capabilities: ['chat', 'llm.chat', 'streaming'],
      enabled: true,
    });
    await act(async () => root.unmount());
  });

  it('keeps the selected Provider identity aligned with API and credential fields', async () => {
    const projection = {
      dialogueCapabilities,
      generationCapabilities,
      providers: [
        {
          id: 'deepseek-chat',
          displayName: 'DeepSeek Chat',
          type: 'generic' as const,
          apiUrl: 'https://api.deepseek.com/v1',
          protocol: 'openai-chat' as const,
          connectionKind: 'direct' as const,
          enabled: true,
          supportedModelFamilies: ['dialogue'] as const,
          credentialStatus: 'configured' as const,
        },
        {
          id: 'neko-chat',
          displayName: 'Neko API Chat',
          type: 'generic' as const,
          apiUrl: 'https://www.nekoapi.com/v1',
          protocol: 'openai-responses' as const,
          connectionKind: 'direct' as const,
          enabled: true,
          supportedModelFamilies: ['dialogue'] as const,
          credentialStatus: 'configured' as const,
        },
      ],
      models: [],
      defaults: {},
    };
    const response = { requestId: 'fixture', projection, runtimeEffect: 'unchanged' as const };
    const saveProvider = vi.fn(async () => response);
    const aiModelSettings: OpenNekoDesktopAiModelSettingsBridge['aiModelSettings'] = {
      get: async () => projection,
      saveProvider,
      saveModel: async () => response,
      deleteProvider: async () => response,
      deleteModel: async () => response,
      setDefault: async () => response,
    };
    const { container, root } = await renderSettings({
      aiModelSettings,
      initialSection: 'agent',
    });
    await act(async () => Promise.resolve());

    const cards = [...container.querySelectorAll<HTMLElement>('.desktop-settings__provider-card')];
    const deepSeekCard = cards.find((card) => card.textContent?.includes('DeepSeek Chat'));
    const nekoCard = cards.find((card) => card.textContent?.includes('Neko API Chat'));
    if (!deepSeekCard || !nekoCard) throw new Error('Provider identity fixture is incomplete.');
    const deepSeekButton = deepSeekCard.querySelector<HTMLButtonElement>('button');
    const nekoButton = nekoCard.querySelector<HTMLButtonElement>('button');
    if (!deepSeekButton || !nekoButton)
      throw new Error('Provider cards require selection buttons.');

    await act(async () => deepSeekButton.click());
    expect(deepSeekCard.dataset.selected).toBe('true');
    expect(nekoCard.dataset.selected).toBe('false');
    await act(async () => findButtonContaining(container, 'Custom settings').click());
    expect(container.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe(
      'https://api.deepseek.com/v1',
    );
    const deepSeekKey = container.querySelector<HTMLInputElement>('input[type="password"]');
    if (!deepSeekKey) throw new Error('Remote Provider requires an API Key field.');
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!setValue) throw new Error('HTMLInputElement value setter is unavailable.');
      setValue.call(deepSeekKey, 'deepseek-draft-key');
      deepSeekKey.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(deepSeekKey.value).toBe('deepseek-draft-key');

    await act(async () => nekoButton.click());
    expect(deepSeekCard.dataset.selected).toBe('false');
    expect(nekoCard.dataset.selected).toBe('true');
    await act(async () => findButtonContaining(container, 'Custom settings').click());
    expect(container.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe(
      'https://www.nekoapi.com/v1',
    );
    expect(container.querySelector<HTMLSelectElement>('select')?.value).toBe('openai-responses');
    const nekoKey = container.querySelector<HTMLInputElement>('input[type="password"]');
    expect(nekoKey?.value).toBe('');
    if (!nekoKey) throw new Error('Neko API Provider requires an API Key field.');
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!setValue) throw new Error('HTMLInputElement value setter is unavailable.');
      setValue.call(nekoKey, 'neko-draft-key');
      nekoKey.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => findButton(container, 'Save').click());
    expect(saveProvider).toHaveBeenCalledWith(
      {
        id: 'neko-chat',
        displayName: 'Neko API Chat',
        type: 'generic',
        apiUrl: 'https://www.nekoapi.com/v1',
        protocol: 'openai-responses',
        supportedModelFamilies: ['dialogue'],
        enabled: true,
      },
      'neko-draft-key',
    );
    await act(async () => root.unmount());
  });

  it('edits authoritative capability tags for an existing custom dialogue model', async () => {
    const projection = {
      dialogueCapabilities,
      generationCapabilities,
      providers: [
        {
          id: 'nekoapi-chat',
          displayName: 'Neko API Chat',
          type: 'generic' as const,
          apiUrl: 'https://api.example.test',
          protocol: 'openai-responses' as const,
          connectionKind: 'direct' as const,
          enabled: true,
          supportedModelFamilies: ['dialogue'] as const,
          credentialStatus: 'configured' as const,
        },
      ],
      models: [
        {
          id: 'gpt-5.6-sol',
          providerId: 'nekoapi-chat',
          apiName: 'gpt-5.6-sol',
          displayName: 'GPT 5.6 SOL',
          type: 'llm' as const,
          capabilities: ['chat', 'llm.chat', 'streaming'],
          enabled: true,
        },
      ],
      defaults: {},
    };
    const response = { requestId: 'fixture', projection, runtimeEffect: 'pending' as const };
    const saveModel = vi.fn(async () => response);
    const aiModelSettings: OpenNekoDesktopAiModelSettingsBridge['aiModelSettings'] = {
      get: async () => projection,
      saveProvider: async () => response,
      saveModel,
      deleteProvider: async () => response,
      deleteModel: async () => response,
      setDefault: async () => response,
    };
    const { container, root } = await renderSettings({
      aiModelSettings,
      initialSection: 'agent',
    });
    await act(async () => Promise.resolve());
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.desktop-settings__provider-card-main')?.click(),
    );
    await act(async () => findButton(container, 'Edit').click());

    const editor = container.querySelector<HTMLElement>('.desktop-settings__model-editor');
    if (!editor) throw new Error('Custom model capability fixture requires an editor.');
    expect(editor.textContent).not.toContain('Model ID');
    const capabilityTrigger = editor.querySelector<HTMLButtonElement>(
      '[data-model-capability-trigger="true"]',
    );
    if (!capabilityTrigger) throw new Error('Custom model capability fixture requires a trigger.');
    expect(capabilityTrigger.textContent).toContain('Streaming');
    await act(async () => capabilityTrigger.click());
    const capabilityOption = (label: string): HTMLButtonElement => {
      const option = [
        ...document.querySelectorAll<HTMLButtonElement>('[data-model-capability]'),
      ].find((candidate) => candidate.textContent?.includes(label));
      if (!option) throw new Error(`Missing model capability option '${label}'.`);
      return option;
    };
    expect(capabilityOption('Streaming').getAttribute('aria-checked')).toBe('true');
    expect(capabilityOption('Vision input').getAttribute('aria-checked')).toBe('false');
    expect(capabilityOption('Tool calling').getAttribute('aria-checked')).toBe('false');
    await act(async () => capabilityOption('Vision input').click());
    await act(async () => capabilityOption('Tool calling').click());
    expect(capabilityTrigger.textContent).toContain('Vision input · Tool calling +1');
    await act(async () => capabilityTrigger.click());
    expect(document.querySelector('.desktop-settings__model-capability-menu')).toBeNull();
    await act(async () =>
      editor.querySelector<HTMLButtonElement>('button.desktop-settings__action')?.click(),
    );

    expect(saveModel).toHaveBeenCalledWith({
      existingId: 'gpt-5.6-sol',
      providerId: 'nekoapi-chat',
      apiName: 'gpt-5.6-sol',
      displayName: 'GPT 5.6 SOL',
      type: 'llm',
      capabilities: ['chat', 'llm.chat', 'streaming', 'vision', 'function_calling'],
      enabled: true,
    });
    await act(async () => root.unmount());
  });

  it('creates dialogue Providers from the live DSH catalog without a local preset', async () => {
    const projection = {
      dialogueCapabilities,
      generationCapabilities,
      providers: [],
      models: [],
      defaults: {},
    };
    const response = { requestId: 'fixture', projection, runtimeEffect: 'unchanged' as const };
    const saveProvider = vi.fn(async () => response);
    const aiModelSettings: OpenNekoDesktopAiModelSettingsBridge['aiModelSettings'] = {
      get: async () => projection,
      saveProvider,
      saveModel: async () => response,
      deleteProvider: async () => response,
      deleteModel: async () => response,
      setDefault: async () => response,
    };
    const { container, root } = await renderSettings({
      aiModelSettings,
      initialSection: 'agent',
    });
    await act(async () => Promise.resolve());

    await act(async () => findButton(container, 'Add dialogue provider').click());
    const providerSelector = container.querySelector<HTMLSelectElement>(
      '.desktop-settings__editor select',
    );
    if (!providerSelector) throw new Error('DSH Provider catalog selector is unavailable.');
    expect([...providerSelector.options].map((option) => option.textContent)).toEqual([
      'OpenAI',
      'Add provider',
    ]);
    expect(
      [...container.querySelectorAll<HTMLInputElement>('.desktop-settings__editor input')].find(
        (input) => input.value === 'openai',
      )?.disabled,
    ).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe('');
    expect(
      [...container.querySelectorAll<HTMLSelectElement>('.desktop-settings__editor select')].find(
        (select) => select.value === '',
      )?.textContent,
    ).toContain('DSH catalog default');

    const dialogueApiKey = container.querySelector<HTMLInputElement>('input[type="password"]');
    if (!dialogueApiKey) throw new Error('DSH Provider form requires an API-key input.');
    await setInputValue(dialogueApiKey, 'openai-secret');
    await act(async () => findButton(container, 'Save').click());
    expect(saveProvider).toHaveBeenCalledWith(
      {
        id: 'openai',
        displayName: 'OpenAI',
        type: 'openai',
        apiUrl: '',
        supportedModelFamilies: ['dialogue'],
        enabled: true,
      },
      'openai-secret',
    );
    await act(async () => root.unmount());
  });

  it('requires explicit confirmation before deleting an empty configured provider', async () => {
    const projection = {
      dialogueCapabilities,
      generationCapabilities,
      providers: [
        {
          id: 'custom-empty',
          displayName: 'Custom Empty',
          type: 'generic' as const,
          apiUrl: 'https://custom.example/v1',
          protocol: 'openai-chat' as const,
          connectionKind: 'direct' as const,
          enabled: true,
          supportedModelFamilies: ['dialogue'] as const,
          credentialStatus: 'configured' as const,
        },
      ],
      models: [],
      defaults: {},
    };
    const response = { requestId: 'fixture', projection, runtimeEffect: 'pending' as const };
    const deleteProvider = vi.fn(async () => response);
    const aiModelSettings: OpenNekoDesktopAiModelSettingsBridge['aiModelSettings'] = {
      get: async () => projection,
      saveProvider: async () => response,
      saveModel: async () => response,
      deleteProvider,
      deleteModel: async () => response,
      setDefault: async () => response,
    };
    const { container, root } = await renderSettings({
      aiModelSettings,
      initialSection: 'agent',
    });
    await act(async () => Promise.resolve());
    await act(async () => findButton(container, 'Delete provider').click());
    expect(deleteProvider).not.toHaveBeenCalled();
    expect(
      container.querySelector('.desktop-settings__provider-card-actions')?.textContent,
    ).toContain('Cancel');
    await act(async () => findButton(container, 'Cancel').click());
    expect(deleteProvider).not.toHaveBeenCalled();
    expect(
      container.querySelector('.desktop-settings__provider-card-actions')?.textContent,
    ).toContain('Delete provider');
    await act(async () => findButton(container, 'Delete provider').click());
    await act(async () => findButton(container, 'Confirm delete').click());
    expect(deleteProvider).toHaveBeenCalledWith('custom-empty');
    expect(container.textContent).toContain(
      'Configuration saved. Open conversations stay unchanged; reopened and new conversations use the latest model catalog.',
    );
    await act(async () => root.unmount());
  });

  it('renders only the two canonical Provider directories without an outer or pending group', async () => {
    const providers = (
      [
        ['chat', 'Dialogue Provider', ['dialogue']],
        ['media', 'Generation Provider', ['generation']],
        ['hybrid', 'Hybrid Provider', ['dialogue', 'generation']],
        ['empty', 'Provider Without Models', ['dialogue']],
      ] as const
    ).map(([id, displayName, supportedModelFamilies]) => ({
      id,
      displayName,
      type: 'generic' as const,
      apiUrl: `https://${id}.example/v1`,
      protocol: 'openai-chat' as const,
      connectionKind: 'direct' as const,
      enabled: true,
      supportedModelFamilies,
      credentialStatus: 'configured' as const,
    }));
    const projection = {
      dialogueCapabilities,
      generationCapabilities,
      providers,
      models: [
        modelFixture('chat-model', 'chat', 'llm'),
        modelFixture('image-model', 'media', 'image'),
        modelFixture('hybrid-chat', 'hybrid', 'llm'),
        modelFixture('hybrid-video', 'hybrid', 'video'),
      ],
      defaults: {},
    };
    const response = { requestId: 'fixture', projection, runtimeEffect: 'unchanged' as const };
    const aiModelSettings: OpenNekoDesktopAiModelSettingsBridge['aiModelSettings'] = {
      get: async () => projection,
      saveProvider: async () => response,
      saveModel: async () => response,
      deleteProvider: async () => response,
      deleteModel: async () => response,
      setDefault: async () => response,
    };
    const { container, root } = await renderSettings({
      aiModelSettings,
      initialSection: 'agent',
    });
    await act(async () => Promise.resolve());

    const dialogue = container.querySelector('[data-provider-group="dialogue"]');
    const generation = container.querySelector('[data-provider-group="generation"]');
    expect(dialogue?.textContent).toContain('Dialogue Provider');
    expect(dialogue?.textContent).toContain('Hybrid Provider');
    expect(dialogue?.textContent).toContain('Provider Without Models');
    expect(generation?.textContent).toContain('Generation Provider');
    expect(generation?.textContent).toContain('Hybrid Provider');
    expect(container.querySelectorAll('[data-provider-group]')).toHaveLength(2);
    expect(container.querySelector('[data-provider-group="mixed"]')).toBeNull();
    expect(container.querySelector('[data-provider-group="unconfigured"]')).toBeNull();
    expect(container.querySelectorAll('.desktop-settings__provider-card')).toHaveLength(5);
    expect(container.querySelectorAll('.desktop-settings__card')).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it('prefills the official MiniMax generation Provider before model configuration', async () => {
    const projection = {
      dialogueCapabilities,
      generationCapabilities,
      providers: [],
      models: [],
      defaults: {},
    };
    const response = { requestId: 'fixture', projection, runtimeEffect: 'unchanged' as const };
    const saveProvider = vi.fn(async () => response);
    const aiModelSettings: OpenNekoDesktopAiModelSettingsBridge['aiModelSettings'] = {
      get: async () => projection,
      saveProvider,
      saveModel: async () => response,
      deleteProvider: async () => response,
      deleteModel: async () => response,
      setDefault: async () => response,
    };
    const { container, root } = await renderSettings({
      aiModelSettings,
      initialSection: 'agent',
    });
    await act(async () => Promise.resolve());

    await act(async () => findButton(container, 'Add generation provider').click());

    expect(container.textContent).toContain('Add provider');
    expect(container.querySelectorAll('.desktop-settings__editor input')).toHaveLength(5);
    expect(container.querySelectorAll('.desktop-settings__editor select')).toHaveLength(1);
    expect(
      [...container.querySelectorAll('.desktop-settings__editor option')].map(
        (option) => option.textContent,
      ),
    ).toEqual(['MiniMax H3', 'ByteDance Ark / Seedance', 'Custom NewAPI Media']);
    expect(container.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe(
      'https://api.minimaxi.com/v2',
    );
    expect(
      [...container.querySelectorAll<HTMLInputElement>('.desktop-settings__editor input')].some(
        (input) => input.value === 'minimax',
      ),
    ).toBe(true);
    expect(container.textContent).toContain(
      'Save the provider before configuring its model catalog.',
    );
    expect(container.querySelectorAll('.desktop-settings__model-editor')).toHaveLength(0);
    expect(saveProvider).not.toHaveBeenCalled();
    const generationApiKey = container.querySelector<HTMLInputElement>('input[type="password"]');
    if (!generationApiKey) throw new Error('Generation Provider form requires an API-key input.');
    await setInputValue(generationApiKey, 'minimax-secret');
    await act(async () => findButton(container, 'Save').click());
    expect(saveProvider).toHaveBeenCalledWith(
      {
        id: 'minimax-media',
        displayName: 'MiniMax H3',
        type: 'minimax',
        apiUrl: 'https://api.minimaxi.com/v2',
        presetId: 'generation-minimax-h3',
        supportedModelFamilies: ['generation'],
        enabled: true,
      },
      'minimax-secret',
    );
    await act(async () => root.unmount());
  });

  it('adds MiniMax H3 through its canonical model template', async () => {
    const projection = {
      dialogueCapabilities,
      generationCapabilities,
      providers: [
        {
          id: 'minimax-media',
          displayName: 'MiniMax H3',
          type: 'minimax' as const,
          apiUrl: 'https://api.minimaxi.com/v2',
          connectionKind: 'direct' as const,
          enabled: true,
          supportedModelFamilies: ['generation'] as const,
          credentialStatus: 'configured' as const,
        },
      ],
      models: [],
      defaults: {},
    };
    const response = { requestId: 'fixture', projection, runtimeEffect: 'unchanged' as const };
    const saveModel = vi.fn(async () => response);
    const aiModelSettings: OpenNekoDesktopAiModelSettingsBridge['aiModelSettings'] = {
      get: async () => projection,
      saveProvider: async () => response,
      saveModel,
      deleteProvider: async () => response,
      deleteModel: async () => response,
      setDefault: async () => response,
    };
    const { container, root } = await renderSettings({
      aiModelSettings,
      initialSection: 'agent',
    });
    await act(async () => Promise.resolve());

    await act(async () =>
      container.querySelector<HTMLButtonElement>('.desktop-settings__provider-card-main')?.click(),
    );
    await act(async () => findButtonContaining(container, 'Add model').click());
    const modelEditor = container.querySelector<HTMLElement>('.desktop-settings__model-editor');
    if (!modelEditor) throw new Error('MiniMax fixture requires a model editor.');
    expect(modelEditor.textContent).toContain('MiniMax H3 · MiniMax-H3');
    expect(modelEditor.querySelectorAll('select')).toHaveLength(2);
    expect(modelEditor.querySelector<HTMLSelectElement>('select')?.value).toBe('minimax-h3');
    const capabilityTrigger = modelEditor.querySelector<HTMLButtonElement>(
      '[data-model-capability-trigger="true"]',
    );
    if (!capabilityTrigger) throw new Error('MiniMax fixture requires a capability selector.');
    expect(capabilityTrigger.textContent).toContain('Text to video · Image to video +1');
    await act(async () => capabilityTrigger.click());
    const capabilityOptions = [
      ...document.querySelectorAll<HTMLButtonElement>('[data-model-capability]'),
    ];
    expect(capabilityOptions).toHaveLength(4);
    expect(capabilityOptions.every((option) => option.disabled)).toBe(true);
    const save = modelEditor.querySelector<HTMLButtonElement>('button.desktop-settings__action');
    if (!save) throw new Error('MiniMax model fixture requires a save action.');
    await act(async () => save.click());
    expect(saveModel).toHaveBeenCalledWith({
      providerId: 'minimax-media',
      apiName: 'MiniMax-H3',
      displayName: 'MiniMax H3',
      type: 'video',
      capabilities: ['text_to_video', 'video.generate', 'image_to_video', 'video_to_video'],
      enabled: true,
      templateId: 'minimax-h3',
    });
    await act(async () => root.unmount());
  });
});

async function renderSettings({
  aiModelSettings,
  openAgentAdvanced = vi.fn(async () => undefined),
  initialSection = 'general',
  onClose = vi.fn(),
  overlay = false,
  update = vi.fn(async () => undefined),
}: {
  readonly aiModelSettings?: OpenNekoDesktopAiModelSettingsBridge['aiModelSettings'];
  readonly openAgentAdvanced?: () => Promise<void>;
  readonly initialSection?: DesktopSettingsSection;
  readonly onClose?: () => void;
  readonly overlay?: boolean;
  readonly update?: (
    preferences: DesktopApplicationSettingsProjection['preferences'],
  ) => Promise<void>;
} = {}) {
  const i18n = createDesktopI18n('en');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  function Fixture(): JSX.Element {
    const [section, setSection] = useState<DesktopSettingsSection>(initialSection);
    return overlay ? (
      <DesktopSettingsOverlaySurface
        onClose={onClose}
        onSectionChange={setSection}
        section={section}
      />
    ) : (
      <>
        <DesktopSettingsNavigationSurface activeSection={section} onSectionChange={setSection} />
        <DesktopSettingsMainSurface section={section} />
      </>
    );
  }
  await act(async () => {
    root.render(
      <I18nProvider service={i18n.i18nService}>
        <DesktopApplicationSettingsProvider
          value={{
            projection: {
              eventSequence: 2,
              preferences: {
                theme: 'system',
                locale: 'system',
                resourceBrowserView: 'list',
                fontSize: 'default',
                defaultWorkspaceLocator: '${HOME}/OpenNeko',
              },
            },
            update,
            openAgentAdvanced,
            aiModelSettings,
          }}
        >
          <Fixture />
        </DesktopApplicationSettingsProvider>
      </I18nProvider>,
    );
  });
  return { container, root };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Settings fixture requires button '${label}'.`);
  return button;
}

function findButtonContaining(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) throw new Error(`Settings fixture requires button containing '${label}'.`);
  return button;
}

async function setInputValue(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setValue) throw new Error('HTMLInputElement value setter is unavailable.');
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function modelFixture(id: string, providerId: string, type: 'llm' | 'image' | 'video' | 'audio') {
  return {
    id,
    providerId,
    apiName: id,
    displayName: id,
    type,
    capabilities:
      type === 'llm'
        ? (['chat', 'llm.chat', 'streaming'] as const)
        : type === 'image'
          ? (['text_to_image', 'image.generate'] as const)
          : type === 'video'
            ? (['text_to_video', 'video.generate'] as const)
            : (['text_to_audio', 'audio.generate'] as const),
    enabled: true,
  } as const;
}
