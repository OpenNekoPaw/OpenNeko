import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const desktopAiModelSettingsScenario = Object.freeze({
  id: 'desktop-ai-model-settings',
  owner: '@neko/host',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const configRoot = join(fixtureHome, '.neko');
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(configRoot, { recursive: true }),
    ]);
    const configPath = join(configRoot, 'config.toml');
    await writeFile(
      configPath,
      [
        '[[providers]]',
        'id = "functional-ollama"',
        'name = "Functional Ollama"',
        'type = "ollama"',
        'api_url = "http://127.0.0.1:11434/api"',
        'enabled = true',
        'builtin = true',
        'connection_kind = "local"',
        'protocol_profile = "ollama"',
        'supported_model_families = ["dialogue"]',
        'requires_api_key = false',
        '',
        '[[providers]]',
        'id = "functional-removable"',
        'name = "Functional Removable"',
        'type = "generic"',
        'api_url = "https://example.invalid/v1"',
        'enabled = true',
        'connection_kind = "direct"',
        'protocol_profile = "openai-chat"',
        'supported_model_families = ["dialogue"]',
        'requires_api_key = false',
        '',
        '[[providers]]',
        'id = "functional-generation"',
        'name = "Functional Generation"',
        'type = "generic"',
        'api_url = "https://generation.example.invalid/v1"',
        'enabled = true',
        'connection_kind = "direct"',
        'protocol_profile = "openai-chat"',
        'supported_model_families = ["generation"]',
        'requires_api_key = false',
        '',
        '[[models]]',
        'id = "functional-local-chat"',
        'name = "llama3.2"',
        'display_name = "Functional Local Chat"',
        'provider_id = "functional-ollama"',
        'type = "llm"',
        'capabilities = ["chat"]',
        'enabled = true',
        '',
        '[[models]]',
        'id = "functional-removable-chat"',
        'name = "functional-chat"',
        'display_name = "Functional Removable Chat"',
        'provider_id = "functional-removable"',
        'type = "llm"',
        'capabilities = ["chat"]',
        'enabled = true',
        '',
        '[[models]]',
        'id = "functional-image"',
        'name = "functional-image"',
        'display_name = "Functional Image"',
        'provider_id = "functional-generation"',
        'type = "image"',
        'capabilities = ["image.generate"]',
        'enabled = true',
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 },
    );
    return { workspacePath, configPath };
  },
  async run({ checkpoint, evaluate, prepared, screenshot, waitForSelector }) {
    await evaluate(`(() => {
      window.resizeTo(1440, 960);
      const settings = document.querySelector('.home-navigation-footer__actions button:last-child');
      if (!(settings instanceof HTMLButtonElement)) throw new Error('Desktop Settings is unavailable.');
      settings.click();
      return { width: window.innerWidth, height: window.innerHeight };
    })()`);
    await waitForSelector('[data-settings-overlay="true"]');
    await evaluate(`(() => {
      const navigation = [...document.querySelectorAll(
        '.desktop-settings__navigation .home-nav-button',
      )];
      const agent = navigation.at(-1);
      if (!(agent instanceof HTMLButtonElement)) throw new Error('Agent Settings is unavailable.');
      agent.click();
      return true;
    })()`);
    await waitForSelector('[data-provider-group="dialogue"]');
    await waitForSelector('[data-provider-group="generation"]');

    const catalog = await inspectProviderCatalog(evaluate);
    checkpoint('ai-model-provider-capability-groups', catalog);
    const catalogScreenshot = await screenshot('desktop-ai-model-provider-groups');

    await openProvider(evaluate, 'Functional Ollama');
    await waitForSelector('.desktop-settings__editor');
    const localProvider = await evaluate(`(() => {
      const editor = document.querySelector('.desktop-settings__editor');
      const addModel = [...editor?.querySelectorAll('button') ?? []].find((button) =>
        /新增模型|Add model/u.test(button.textContent ?? ''),
      );
      if (!(editor instanceof HTMLElement) || !(addModel instanceof HTMLButtonElement)) {
        throw new Error('Local Provider editor is incomplete.');
      }
      addModel.click();
      return {
        passwordFieldCount: editor.querySelectorAll('input[type="password"]').length,
        deleteProviderVisible: [...editor.querySelectorAll('button')].some((button) =>
          /删除 Provider|Delete provider/u.test(button.textContent ?? ''),
        ),
      };
    })()`);
    await waitForSelector('.desktop-settings__model-editor');
    const localModelTypes = await evaluate(`(() => {
      const select = document.querySelector('.desktop-settings__model-editor select');
      if (!(select instanceof HTMLSelectElement)) throw new Error('Local model type selector is missing.');
      return [...select.options].map((option) => option.value);
    })()`);
    if (
      localProvider.passwordFieldCount !== 0 ||
      !localProvider.deleteProviderVisible ||
      JSON.stringify(localModelTypes) !== JSON.stringify(['llm'])
    ) {
      throw new Error(
        `Local Provider controls are incorrect: ${JSON.stringify({ localProvider, localModelTypes })}`,
      );
    }
    checkpoint('local-provider-dialogue-only', { ...localProvider, localModelTypes });
    const localScreenshot = await screenshot('desktop-ai-model-local-provider');

    await evaluate(`(() => {
      const editor = document.querySelector('.desktop-settings__editor');
      const cancelButtons = [...editor?.querySelectorAll('button') ?? []].filter((button) =>
        /取消|Cancel/u.test(button.textContent ?? ''),
      );
      const closeEditor = cancelButtons.at(-1);
      if (!(closeEditor instanceof HTMLButtonElement)) throw new Error('Provider editor close is unavailable.');
      closeEditor.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `!document.querySelector('.desktop-settings__editor')`,
      'Local Provider editor did not close.',
    );

    await openProvider(evaluate, 'Functional Removable');
    await waitForSelector('.desktop-settings__editor');
    await evaluate(`(() => {
      const model = [...document.querySelectorAll('.desktop-settings__model-chip')].find((item) =>
        item.textContent?.includes('Functional Removable Chat'),
      );
      const remove = [...model?.querySelectorAll('button') ?? []].find((button) =>
        /删除|Delete/u.test(button.textContent ?? ''),
      );
      if (!(remove instanceof HTMLButtonElement)) throw new Error('Model delete control is unavailable.');
      remove.click();
      return true;
    })()`);
    await waitForSelector('.desktop-settings__model-delete-action--confirm');
    await evaluate(`(() => {
      const confirm = document.querySelector('.desktop-settings__model-delete-action--confirm');
      if (!(confirm instanceof HTMLButtonElement)) throw new Error('Model delete confirmation is unavailable.');
      confirm.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `![...document.querySelectorAll('.desktop-settings__model-chip')].some((item) =>
        item.textContent?.includes('Functional Removable Chat'))`,
      'Model deletion did not update the Provider catalog.',
    );
    await evaluate(`(() => {
      const editor = document.querySelector('.desktop-settings__editor');
      const cancelButtons = [...editor?.querySelectorAll('button') ?? []].filter((button) =>
        /取消|Cancel/u.test(button.textContent ?? ''),
      );
      const closeEditor = cancelButtons.at(-1);
      if (!(closeEditor instanceof HTMLButtonElement)) throw new Error('Provider editor close is unavailable.');
      closeEditor.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `!document.querySelector('.desktop-settings__editor')`,
      'Provider editor did not close before direct deletion.',
    );
    await evaluate(`(() => {
      const card = [...document.querySelectorAll('.desktop-settings__provider-card')].find((item) =>
        item.textContent?.includes('Functional Removable'),
      );
      const remove = card?.querySelector('.desktop-settings__provider-card-delete');
      if (!(remove instanceof HTMLButtonElement)) throw new Error('Direct Provider delete is unavailable.');
      remove.click();
      return true;
    })()`);
    await waitForSelector('.desktop-settings__provider-card-delete--confirm');
    const deleteConfirmationScreenshot = await screenshot('desktop-ai-model-delete-confirmation');
    await evaluate(`(() => {
      const confirm = document.querySelector('.desktop-settings__provider-card-delete--confirm');
      if (!(confirm instanceof HTMLButtonElement)) throw new Error('Provider delete confirmation is unavailable.');
      confirm.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `![...document.querySelectorAll('.desktop-settings__provider-card')].some((card) =>
        card.textContent?.includes('Functional Removable'))`,
      'Provider deletion did not update the capability catalog.',
    );
    const deleted = await inspectProviderCatalog(evaluate);
    checkpoint('provider-and-model-deleted', deleted);
    const persistedConfig = await readFile(prepared.configPath, 'utf8');
    if (
      persistedConfig.includes('functional-removable') ||
      persistedConfig.includes('functional-removable-chat')
    ) {
      throw new Error('Provider deletion did not persist to the canonical config.toml.');
    }
    checkpoint('provider-delete-persisted-to-config', {
      configFileUpdated: true,
      retainedProviders: ['functional-ollama', 'functional-generation'],
    });

    return {
      catalog,
      localProvider: { ...localProvider, localModelTypes },
      deleted,
      screenshots: [catalogScreenshot, localScreenshot, deleteConfirmationScreenshot],
    };
  },
});

async function openProvider(evaluate, label) {
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.desktop-settings__provider-card')].find((item) =>
      item.textContent?.includes(${JSON.stringify(label)}),
    );
    const provider = card?.querySelector('.desktop-settings__provider-card-main');
    if (!(provider instanceof HTMLButtonElement)) {
      throw new Error(${JSON.stringify(`Provider '${label}' is unavailable.`)});
    }
    provider.click();
    return true;
  })()`);
}

async function inspectProviderCatalog(evaluate) {
  return evaluate(`(() => {
    const overlay = document.querySelector('[data-settings-overlay="true"]');
    if (!(overlay instanceof HTMLElement)) throw new Error('Settings overlay is missing.');
    const overlayRect = overlay.getBoundingClientRect();
    const groups = Object.fromEntries(
      [...document.querySelectorAll('[data-provider-group]')].map((group) => [
        group.getAttribute('data-provider-group'),
        [...group.querySelectorAll('.desktop-settings__provider-card')].map((card) =>
          card.textContent?.replace(/\\s+/gu, ' ').trim() ?? '',
        ),
      ]),
    );
    const groupKeys = Object.keys(groups).sort();
    if (JSON.stringify(groupKeys) !== JSON.stringify(['dialogue', 'generation'])) {
      throw new Error('Provider directories are not canonical: ' + JSON.stringify(groupKeys));
    }
    const addActions = [...document.querySelectorAll(
      '.desktop-settings__provider-group-actions .desktop-settings__action',
    )];
    if (addActions.length !== 2) {
      throw new Error('Expected one add action per Provider directory, received ' + addActions.length + '.');
    }
    if (document.querySelector('.desktop-settings__management-summary')) {
      throw new Error('The retired outer Provider management wrapper is still visible.');
    }
    const localCard = [...document.querySelectorAll('.desktop-settings__provider-card')].find((card) =>
      card.textContent?.includes('Functional Ollama'),
    );
    if (!(localCard instanceof HTMLElement) || !/本地|Local/u.test(localCard.textContent ?? '')) {
      throw new Error('Local Provider source is not visible.');
    }
    if (!groups.dialogue?.some((label) => label.includes('Functional Ollama'))) {
      throw new Error('Local dialogue Provider is not in the dialogue group.');
    }
    if (!groups.generation?.some((label) => label.includes('Functional Generation'))) {
      throw new Error('Generation Provider is not in the generation group.');
    }
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      overlay: { width: overlayRect.width, height: overlayRect.height },
      groups,
    };
  })()`);
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
