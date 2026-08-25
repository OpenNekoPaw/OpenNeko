import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MAIN_SLOT = '[data-workbench-slot="main"]';
const SECONDARY_MAIN_SLOT = '[data-workbench-slot="secondaryMain"]';
const NAVIGATION_SELECTOR =
  '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button';
const GLOBAL_CHARACTER_ID = 'global-character-ui-preview';
const CHARACTER_VERSION_ID = 'character-version-ui-preview';

export const characterManagementDialogueScenario = Object.freeze({
  id: 'character-management-dialogue',
  owner: '@neko/chara-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await Promise.all([mkdir(workspacePath, { recursive: true }), seedCharacter(fixtureHome)]);
    return { workspacePath };
  },
  async run({ checkpoint, click, evaluate, screenshot, waitForDesktopBridge, waitForSelector }) {
    await waitForDesktopBridge();
    await evaluate(`window.resizeTo(1440, 960)`);
    await clickNavigation(evaluate, click, 'Characters', '角色');
    await waitForSelector(`${MAIN_SLOT} [data-character-management-catalog="true"]`);
    await click(`${MAIN_SLOT} .character-management__catalog-item`);
    await waitForSelector(
      `${SECONDARY_MAIN_SLOT} [data-character-management-detail-surface="true"]`,
    );

    const detail = await inspectCharacterDetail(evaluate);
    checkpoint('character-management-readonly-preview', detail);
    const detailScreenshot = await screenshot('character-management-readonly-preview');

    await click(`${SECONDARY_MAIN_SLOT} .character-management-detail__primary-actions .is-primary`);
    await waitForSelector(
      '[data-primary-surface="agent"] [data-entry-binding-kind="character-dialogue"]',
    );
    const handoff = await inspectDialogueHandoff(evaluate);
    checkpoint('character-dialogue-dsh-handoff', handoff);
    const handoffScreenshot = await screenshot('character-dialogue-dsh-handoff');

    await click('[data-primary-surface="agent"] .agent-character-conversation-mode-trigger');
    await waitForSelector(
      '[data-primary-surface="agent"] .agent-dropdown-menu-mode [role="menuitemradio"]',
    );
    const modeMenu = await inspectDialogueModeMenu(evaluate);
    checkpoint('character-dialogue-mode-menu-localized', modeMenu);
    const modeMenuScreenshot = await screenshot('character-dialogue-mode-menu-localized');

    return {
      detail,
      handoff,
      modeMenu,
      screenshots: [detailScreenshot, handoffScreenshot, modeMenuScreenshot],
    };
  },
});

async function inspectCharacterDetail(evaluate) {
  const state = await evaluate(`(() => {
    const detail = document.querySelector(
      '${SECONDARY_MAIN_SLOT} [data-character-management-detail-surface="true"]'
    );
    const text = detail?.textContent ?? '';
    return {
      characterName: detail?.querySelector('h2')?.textContent?.trim() ?? '',
      hasBackground: text.includes('Raised among living records.'),
      hasCanon: text.includes('Never destroys an original record.'),
      hasKnowledgeBoundary: text.includes('Does not know sealed collections.'),
      hasRepresentation: text.includes('avatar-vrm-ui'),
      hasTtsProvider: text.includes('tts-provider-ui'),
      hasConversationModelOwnership: text.includes('chat LLM provider and model belong to the exact conversation'),
      inputCount: detail?.querySelectorAll('input, textarea').length ?? -1,
      editActionCount: [...(detail?.querySelectorAll('button') ?? [])].filter((button) =>
        /edit|save|publish|编辑|保存|发布/iu.test(button.textContent ?? '')
      ).length,
    };
  })()`);
  if (
    state.characterName !== 'Aster Vale' ||
    !state.hasBackground ||
    !state.hasCanon ||
    !state.hasKnowledgeBoundary ||
    !state.hasRepresentation ||
    !state.hasTtsProvider ||
    !state.hasConversationModelOwnership ||
    state.inputCount !== 0 ||
    state.editActionCount !== 0
  ) {
    throw new Error(`Character read-only detail is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectDialogueModeMenu(evaluate) {
  const state = await evaluate(`(() => {
    const menu = document.querySelector(
      '[data-primary-surface="agent"] .agent-dropdown-menu-mode'
    );
    const text = menu?.textContent?.replace(/\\s+/gu, ' ').trim() ?? '';
    return {
      text,
      optionCount: menu?.querySelectorAll('[role="menuitemradio"]').length ?? 0,
      selectedCount: menu?.querySelectorAll('[aria-checked="true"]').length ?? 0,
      exposesTranslationKey: text.includes('chat.entryExperience.characterDialogue.'),
    };
  })()`);
  const hasCompleteCopy =
    (state.text.includes('Conversation mode') &&
      state.text.includes('Companion') &&
      state.text.includes('Narrative')) ||
    (state.text.includes('对话模式') && state.text.includes('日常') && state.text.includes('叙事'));
  if (
    !hasCompleteCopy ||
    state.optionCount !== 2 ||
    state.selectedCount !== 1 ||
    state.exposesTranslationKey
  ) {
    throw new Error(`Character dialogue mode menu is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectDialogueHandoff(evaluate) {
  const state = await evaluate(`(() => {
    const binding = document.querySelector(
      '[data-primary-surface="agent"] [data-entry-binding-kind="character-dialogue"]'
    );
    const diagnostic = document.querySelector('.shell-diagnostic')?.textContent ?? '';
    return {
      label: binding?.querySelector('.agent-entry-binding-label')?.textContent?.trim() ?? '',
      bindingCount: document.querySelectorAll(
        '[data-primary-surface="agent"] [data-entry-binding-kind="character-dialogue"]'
      ).length,
      modeSelectorCount: document.querySelectorAll(
        '[data-primary-surface="agent"] .agent-character-conversation-mode-trigger'
      ).length,
      rejectedByLegacyShell: diagnostic.includes('角色对话上下文尚未接入 DSH') ||
        diagnostic.includes('Character dialogue context is not connected to DSH'),
      characterDetailCount: document.querySelectorAll(
        '[data-character-management-detail-surface="true"]'
      ).length,
    };
  })()`);
  if (
    state.label !== 'Aster Vale' ||
    state.bindingCount !== 1 ||
    state.modeSelectorCount !== 1 ||
    state.rejectedByLegacyShell ||
    state.characterDetailCount !== 0
  ) {
    throw new Error(`Character dialogue handoff is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function clickNavigation(evaluate, click, englishLabel, chineseLabel) {
  const index = await evaluate(`(() => [...document.querySelectorAll(
    '${NAVIGATION_SELECTOR}'
  )].findIndex((button) => ['${englishLabel}', '${chineseLabel}'].includes(
    button.textContent?.trim() ?? ''
  )))()`);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Navigation '${englishLabel}' is unavailable.`);
  }
  await click(NAVIGATION_SELECTOR, index);
}

async function seedCharacter(fixtureHome) {
  const file = join(
    fixtureHome,
    '.neko',
    'neko',
    'global-characters',
    `${Buffer.from(GLOBAL_CHARACTER_ID).toString('base64url')}.json`,
  );
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify(
      {
        character: {
          globalCharacterId: GLOBAL_CHARACTER_ID,
          displayName: 'Aster Vale',
          currentCharacterVersionId: CHARACTER_VERSION_ID,
          characterVersionIds: [CHARACTER_VERSION_ID],
          createdAt: '2026-08-17T00:00:00.000Z',
          updatedAt: '2026-08-24T00:00:00.000Z',
        },
        versions: [
          {
            characterVersionId: CHARACTER_VERSION_ID,
            globalCharacterId: GLOBAL_CHARACTER_ID,
            label: 'Archive edition',
            definition: {
              summary: 'A careful archive keeper.',
              backgroundStory: {
                overview: 'Raised among living records.',
                origins: [
                  {
                    loreEntryId: 'lore-origin-ui',
                    statement: 'Born in Archive City.',
                    evidenceIds: [],
                  },
                ],
                personalHistory: [],
                formativeEvents: [],
                establishedRelationships: [],
              },
              originSetting: {
                overview: 'Archive City remembers every promise.',
                eras: [],
                cultures: [],
                socialEnvironment: [],
                importantPlaces: [],
                organizations: [],
                believedRules: [],
              },
              canon: ['Never destroys an original record.'],
              knowledgeBoundary: ['Does not know sealed collections.'],
              behaviorPolicy: ['Ask before revealing private notes.'],
              expressionPolicy: ['Speaks precisely and warmly.'],
              representationRefs: [
                {
                  representationId: 'avatar-vrm-ui',
                  kind: 'vrm',
                  resourceRef: '${ASSET_ROOT}/characters/aster.vrm',
                },
                {
                  representationId: 'voice-ui',
                  kind: 'voice',
                  resourceRef: 'voice://aster-ui',
                },
              ],
              representationDefaults: { avatarRepresentationId: 'avatar-vrm-ui' },
              voiceDefaults: {
                providerRef: 'tts-provider-ui',
                voiceRepresentationId: 'voice-ui',
                speed: 1.05,
                autoRead: true,
              },
            },
            acceptedEvidenceIds: [],
            publishedAt: '2026-08-24T00:00:00.000Z',
          },
        ],
        links: [],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}
