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
        '[default_models.llm]',
        'provider_id = "functional-ollama"',
        'model_id = "functional-local-chat"',
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 },
    );
    return { workspacePath, configPath };
  },
  async run({ checkpoint, evaluate, prepared, screenshot, waitForSelector }) {
    await waitForSelector('[data-primary-sidebar="application"]');
    await waitForSelector('.agent-model-config-trigger');
    await waitForCondition(
      evaluate,
      `document.querySelector('.agent-model-config-trigger') instanceof HTMLButtonElement &&
        !document.querySelector('.agent-model-config-trigger').disabled`,
      'Entry Draft did not finish loading its configured chat models.',
    );
    await evaluate(`(() => {
      const trigger = document.querySelector('.agent-model-config-trigger');
      if (!(trigger instanceof HTMLButtonElement)) throw new Error('Chat model selector is unavailable.');
      trigger.click();
      return true;
    })()`);
    await waitForSelector('.agent-model-config-radio');
    await evaluate(`(() => {
      const option = [...document.querySelectorAll('.agent-model-config-radio')].find((item) =>
        item.textContent?.includes('Functional Removable Chat'),
      );
      if (!(option instanceof HTMLButtonElement)) {
        throw new Error('Functional removable chat model is unavailable in the Entry Draft.');
      }
      option.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `document.querySelector('.agent-model-config-trigger')?.textContent?.includes(
        'Functional Removable Chat',
      )`,
      'Entry Draft did not select the removable chat model.',
    );
    const selectedBeforeDelete = await evaluate(`(() => {
      const trigger = document.querySelector('.agent-model-config-trigger');
      if (!(trigger instanceof HTMLButtonElement)) throw new Error('Chat model selector disappeared.');
      const triggerLabel = trigger.textContent?.trim() ?? '';
      trigger.click();
      return { triggerLabel };
    })()`);
    if (!selectedBeforeDelete.triggerLabel.includes('Functional Removable Chat')) {
      throw new Error(
        `Entry Draft did not select the removable chat model: ${JSON.stringify(selectedBeforeDelete)}`,
      );
    }
    checkpoint('entry-draft-removable-model-selected', selectedBeforeDelete);
    await evaluate(`(() => {
      window.resizeTo(1440, 960);
      const settings = [...document.querySelectorAll('button')].find((button) =>
        /设置|Settings/u.test(button.getAttribute('aria-label') ?? ''),
      );
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
    await waitForCondition(
      evaluate,
      `[...document.querySelectorAll('.desktop-settings__provider-card')].some((card) =>
        card.textContent?.includes('Functional Ollama'))`,
      'Configured Provider catalog did not finish loading.',
    );

    const catalog = await inspectProviderCatalog(evaluate);
    checkpoint('ai-model-provider-capability-groups', catalog);
    const catalogScreenshot = await screenshot('desktop-ai-model-provider-groups');

    await evaluate(`(() => {
      const group = document.querySelector('[data-provider-group="dialogue"]');
      const add = group?.querySelector(
        '.desktop-settings__provider-group-actions .desktop-settings__action',
      );
      if (!(add instanceof HTMLButtonElement)) {
        throw new Error('Dialogue Provider add action is unavailable.');
      }
      add.click();
      return true;
    })()`);
    await waitForSelector('.desktop-settings__editor');
    const dshCatalogState = await evaluate(`(() => {
      const editor = document.querySelector('.desktop-settings__editor');
      const selects = [...editor?.querySelectorAll('select') ?? []];
      const provider = selects[0];
      if (!(provider instanceof HTMLSelectElement)) {
        throw new Error('DSH Provider capability selector is unavailable.');
      }
      provider.value = 'dsh-catalog:openai';
      provider.dispatchEvent(new Event('change', { bubbles: true }));
      const protocol = selects[1];
      const inputs = [...editor?.querySelectorAll('input') ?? []];
      return {
        providerValues: [...provider.options].map((option) => option.value),
        providerLabels: [...provider.options].map((option) => option.textContent?.trim() ?? ''),
        selectedProvider: provider.value,
        protocolValues:
          protocol instanceof HTMLSelectElement
            ? [...protocol.options].map((option) => option.value)
            : [],
        providerId: inputs.find((input) => input.value === 'openai')?.value,
        apiUrl: inputs.find((input) => input.type === 'url')?.value,
      };
    })()`);
    if (
      !dshCatalogState.providerValues.includes('dsh-catalog:openai') ||
      dshCatalogState.selectedProvider !== 'dsh-catalog:openai' ||
      dshCatalogState.providerId !== 'openai' ||
      dshCatalogState.apiUrl !== '' ||
      !dshCatalogState.protocolValues.includes('') ||
      !dshCatalogState.protocolValues.includes('openai-completions') ||
      !dshCatalogState.protocolValues.includes('openai-responses') ||
      !dshCatalogState.protocolValues.includes('anthropic-messages')
    ) {
      throw new Error(
        `DSH Provider catalog state is incorrect: ${JSON.stringify(dshCatalogState)}`,
      );
    }
    checkpoint('dsh-provider-capabilities-visible', dshCatalogState);
    const dshCatalogScreenshot = await screenshot('desktop-ai-model-dsh-provider-catalog');
    await evaluate(`(() => {
      const editor = document.querySelector('.desktop-settings__editor');
      const save = [...editor?.querySelectorAll('button') ?? []].find((button) =>
        /保存|Save/u.test(button.textContent ?? ''),
      );
      if (!(save instanceof HTMLButtonElement) || save.disabled) {
        throw new Error('DSH catalog Provider save is unavailable.');
      }
      save.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `!document.querySelector('.desktop-settings__editor')`,
      'DSH catalog Provider form did not close after save.',
    );
    const dshConfig = await readFile(prepared.configPath, 'utf8');
    const dshProviderBlock = dshConfig
      .split('[[providers]]')
      .find((block) => block.includes('id = "openai"'));
    if (
      dshProviderBlock === undefined ||
      !dshProviderBlock.includes('api_url = ""') ||
      dshProviderBlock.includes('protocol_profile')
    ) {
      throw new Error('DSH catalog Provider was not persisted through canonical config.toml.');
    }
    checkpoint('dsh-provider-persisted-to-openneko-config', {
      providerId: 'openai',
      inheritedProtocolAndEndpoint: true,
    });

    const generationPreset = await evaluate(`(() => {
      const group = document.querySelector('[data-provider-group="generation"]');
      const add = group?.querySelector(
        '.desktop-settings__provider-group-actions .desktop-settings__action',
      );
      if (!(add instanceof HTMLButtonElement)) {
        throw new Error('Generation Provider add action is unavailable.');
      }
      add.click();
      return true;
    })()`);
    if (!generationPreset) throw new Error('Generation Provider add action did not run.');
    await waitForSelector('.desktop-settings__editor');
    const generationPresetState = await evaluate(`(() => {
      const editor = document.querySelector('.desktop-settings__editor');
      const preset = editor?.querySelector('select');
      const apiUrl = editor?.querySelector('input[type="url"]');
      const inputs = [...editor?.querySelectorAll('input') ?? []];
      if (!(preset instanceof HTMLSelectElement) || !(apiUrl instanceof HTMLInputElement)) {
        throw new Error('Generation Provider preset form is incomplete.');
      }
      return {
        selectedPreset: preset.value,
        presetLabels: [...preset.options].map((option) => option.textContent?.trim() ?? ''),
        apiUrl: apiUrl.value,
        providerTypeVisible: inputs.some((input) => input.value === 'minimax'),
      };
    })()`);
    if (
      generationPresetState.selectedPreset !== 'product-preset:generation-minimax-h3' ||
      generationPresetState.apiUrl !== 'https://api.minimaxi.com/v2' ||
      !generationPresetState.providerTypeVisible ||
      JSON.stringify(generationPresetState.presetLabels) !==
        JSON.stringify(['MiniMax H3', 'ByteDance Ark / Seedance', 'Custom NewAPI Media'])
    ) {
      throw new Error(
        `Generation Provider preset state is incorrect: ${JSON.stringify(generationPresetState)}`,
      );
    }
    checkpoint('generation-provider-presets-visible', generationPresetState);
    const generationPresetScreenshot = await screenshot('desktop-ai-model-generation-presets');
    await evaluate(`(() => {
      const editor = document.querySelector('.desktop-settings__editor');
      const save = [...editor?.querySelectorAll('button') ?? []].find((button) =>
        /保存|Save/u.test(button.textContent ?? ''),
      );
      if (!(save instanceof HTMLButtonElement)) throw new Error('Generation Provider save is unavailable.');
      save.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `!document.querySelector('.desktop-settings__editor')`,
      'MiniMax Provider form did not close after save.',
    );
    await waitForCondition(
      evaluate,
      `[...document.querySelectorAll('.desktop-settings__provider-card')].some((card) =>
        card.textContent?.includes('MiniMax H3'))`,
      'MiniMax Provider did not appear in the generation directory.',
    );

    await openProvider(evaluate, 'MiniMax H3');
    await waitForSelector('.desktop-settings__editor');
    await evaluate(`(() => {
      const editor = document.querySelector('.desktop-settings__editor');
      const addModel = [...editor?.querySelectorAll('button') ?? []].find((button) =>
        /新增模型|Add model/u.test(button.textContent ?? ''),
      );
      if (!(addModel instanceof HTMLButtonElement)) throw new Error('MiniMax add-model action is unavailable.');
      addModel.click();
      return true;
    })()`);
    await waitForSelector('.desktop-settings__model-editor');
    await evaluate(`(() => {
      const trigger = document.querySelector('[data-model-capability-trigger="true"]');
      if (!(trigger instanceof HTMLButtonElement)) {
        throw new Error('MiniMax capability selector is unavailable.');
      }
      trigger.click();
      return true;
    })()`);
    await waitForSelector('.desktop-settings__model-capability-menu');
    const h3TemplateState = await evaluate(`(() => {
      const editor = document.querySelector('.desktop-settings__model-editor');
      const selects = [...editor?.querySelectorAll('select') ?? []];
      const inputs = [...editor?.querySelectorAll('input') ?? []];
      if (!(editor instanceof HTMLElement)) throw new Error('MiniMax model editor is missing.');
      return {
        template: selects[0]?.value,
        modelType: selects[1]?.value,
        values: inputs.map((input) => input.value),
        lockedControlCount: [...inputs, ...selects].filter((control) => control.disabled).length,
        checkedCapabilities: [...document.querySelectorAll('[data-model-capability]')]
          .filter((option) => option.getAttribute('aria-checked') === 'true')
          .map((option) => option.getAttribute('data-model-capability')),
        capabilitiesLocked: [...document.querySelectorAll('[data-model-capability]')]
          .every((option) => option.disabled),
      };
    })()`);
    if (
      h3TemplateState.template !== 'minimax-h3' ||
      h3TemplateState.modelType !== 'video' ||
      !h3TemplateState.values.includes('MiniMax-H3') ||
      h3TemplateState.lockedControlCount < 3 ||
      JSON.stringify(h3TemplateState.checkedCapabilities) !==
        JSON.stringify(['textToVideo', 'imageToVideo', 'videoToVideo']) ||
      !h3TemplateState.capabilitiesLocked
    ) {
      throw new Error(`MiniMax H3 model template is incorrect: ${JSON.stringify(h3TemplateState)}`);
    }
    checkpoint('minimax-h3-model-template-visible', h3TemplateState);
    const h3TemplateScreenshot = await screenshot('desktop-ai-model-minimax-h3-template');
    await evaluate(`(() => {
      const save = document.querySelector(
        '.desktop-settings__model-editor button.desktop-settings__action',
      );
      if (!(save instanceof HTMLButtonElement)) throw new Error('MiniMax H3 model save is unavailable.');
      save.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `[...document.querySelectorAll('.desktop-settings__model-chip')].some((model) =>
        model.textContent?.includes('MiniMax H3'))`,
      'MiniMax H3 model did not appear in its Provider catalog.',
    );
    await evaluate(`(() => {
      const editor = document.querySelector('.desktop-settings__editor');
      const close = [...editor?.querySelectorAll('button') ?? []].find((button) =>
        /取消|Cancel/u.test(button.textContent ?? ''),
      );
      if (!(close instanceof HTMLButtonElement)) throw new Error('MiniMax Provider close is unavailable.');
      close.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `!document.querySelector('.desktop-settings__editor')`,
      'MiniMax Provider editor did not close.',
    );

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
      persistedConfig.includes('functional-removable-chat') ||
      !persistedConfig.includes('type = "minimax"') ||
      !persistedConfig.includes('name = "MiniMax-H3"')
    ) {
      throw new Error('Provider/model mutations did not persist to the canonical config.toml.');
    }
    checkpoint('provider-delete-persisted-to-config', {
      configFileUpdated: true,
      retainedProviders: ['functional-ollama', 'functional-generation', 'minimax-media'],
    });
    await waitForCondition(
      evaluate,
      `(() => {
        const trigger = document.querySelector('.agent-model-config-trigger');
        return trigger instanceof HTMLButtonElement &&
          !trigger.disabled &&
          trigger.textContent?.includes('Functional Local Chat');
      })()`,
      'Entry Draft did not refresh to the canonical default after deleting its transient model selection.',
    );
    const entryModelAfterDelete = await evaluate(`(() => ({
      triggerLabel: document.querySelector('.agent-model-config-trigger')?.textContent?.trim() ?? '',
      runtimeStatus:
        document.querySelector('[data-agent-surface]')?.getAttribute('data-dsh-runtime-status') ?? '',
      unavailableDiagnosticVisible:
        document.body.textContent?.includes('unavailable default chat model') ?? false,
    }))()`);
    if (
      !entryModelAfterDelete.triggerLabel.includes('Functional Local Chat') ||
      entryModelAfterDelete.runtimeStatus !== 'running' ||
      entryModelAfterDelete.unavailableDiagnosticVisible
    ) {
      throw new Error(
        `Entry Draft model catalog did not converge after deletion: ${JSON.stringify(entryModelAfterDelete)}`,
      );
    }
    checkpoint('entry-draft-model-catalog-refreshed-after-delete', entryModelAfterDelete);
    const refreshedEntryScreenshot = await screenshot(
      'desktop-ai-model-entry-refreshed-after-delete',
    );

    return {
      catalog,
      localProvider: { ...localProvider, localModelTypes },
      deleted,
      generationPresetState,
      dshCatalogState,
      h3TemplateState,
      selectedBeforeDelete,
      entryModelAfterDelete,
      screenshots: [
        catalogScreenshot,
        dshCatalogScreenshot,
        generationPresetScreenshot,
        h3TemplateScreenshot,
        localScreenshot,
        deleteConfirmationScreenshot,
        refreshedEntryScreenshot,
      ],
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
      throw new Error(
        'Local Provider source is not visible: ' +
          JSON.stringify({ groups, localCard: localCard?.textContent ?? null }),
      );
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
