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
      providers: [
        {
          id: 'deepseek',
          displayName: 'DeepSeek Provider',
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
          enabled: true,
        },
        {
          id: 'image-model',
          providerId: 'deepseek',
          apiName: 'image-model',
          displayName: 'Image Model',
          type: 'image' as const,
          enabled: true,
        },
        {
          id: 'audio-model',
          providerId: 'deepseek',
          apiName: 'audio-model',
          displayName: 'Audio Model',
          type: 'audio' as const,
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
      providers: [
        {
          id: 'ollama-local',
          displayName: 'Ollama Local',
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
    await act(async () => root.unmount());
  });

  it('requires explicit confirmation before deleting an empty configured provider', async () => {
    const projection = {
      providers: [
        {
          id: 'custom-empty',
          displayName: 'Custom Empty',
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
      'Configuration saved. DSH will refresh after the active task finishes, then new conversations will use the latest model catalog.',
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
      apiUrl: `https://${id}.example/v1`,
      protocol: 'openai-chat' as const,
      connectionKind: 'direct' as const,
      enabled: true,
      supportedModelFamilies,
      credentialStatus: 'configured' as const,
    }));
    const projection = {
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

  it('shows a focused custom-provider form before model configuration is available', async () => {
    const projection = { providers: [], models: [], defaults: {} };
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

    expect(container.textContent).toContain('Custom provider');
    expect(container.querySelectorAll('.desktop-settings__editor input')).toHaveLength(4);
    expect(container.querySelectorAll('.desktop-settings__editor select')).toHaveLength(1);
    expect(container.textContent).toContain(
      'Save the provider before configuring its model catalog.',
    );
    expect(container.querySelectorAll('.desktop-settings__model-editor')).toHaveLength(0);
    expect(saveProvider).not.toHaveBeenCalled();
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

function modelFixture(id: string, providerId: string, type: 'llm' | 'image' | 'video' | 'audio') {
  return {
    id,
    providerId,
    apiName: id,
    displayName: id,
    type,
    enabled: true,
  } as const;
}
