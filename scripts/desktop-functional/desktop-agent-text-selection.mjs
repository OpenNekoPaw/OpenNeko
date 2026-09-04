import { desktopAgentDiagnosticPortalScenario } from './desktop-agent-diagnostic-portal.mjs';
import { openFixtureWorkspace } from './desktop-operations.mjs';

const COMPOSER_SELECTOR = '.desktop-scene-workbench--agent-only .agent-composer-textarea';
const TRANSCRIPT_SELECTOR = '.desktop-scene-workbench--agent-only .agent-user-prompt-primary';
const WORKSPACE_COMPOSER_SELECTOR = '[data-dock-owner="agent"] .agent-composer-textarea';
const WORKSPACE_TRANSCRIPT_SELECTOR = '[data-dock-owner="agent"] .agent-user-prompt-primary';
const SELECTION_TEXT = 'OpenNeko Agent selection copy';
const WORKSPACE_SELECTION_TEXT = 'OpenNeko workspace Agent selection copy';

export const desktopAgentTextSelectionScenario = Object.freeze({
  id: 'desktop-agent-text-selection',
  owner: '@neko/agent-webview',
  prepare: desktopAgentDiagnosticPortalScenario.prepare,
  async run({ checkpoint, click, evaluate, pressKey, screenshot, type, waitForSelector }) {
    await evaluate(`(() => {
      window.resizeTo(1200, 800);
      return { width: window.innerWidth, height: window.innerHeight };
    })()`);

    await selectTheme({ click, evaluate, theme: 'light', waitForSelector });
    await type(COMPOSER_SELECTOR, SELECTION_TEXT);
    await pressKey('a', ['Meta']);
    const lightSelection = await inspectComposerSelection(evaluate);
    assertCompleteSelection(lightSelection, 'Light theme');
    checkpoint('agent-composer-light-selection', lightSelection);
    const lightScreenshot = await screenshot('agent-composer-light-selection');

    await pressKey('c', ['Meta']);
    await pressKey('Backspace');
    await pressKey('v', ['Meta']);
    await waitForEvaluation(
      evaluate,
      `document.querySelector(${JSON.stringify(COMPOSER_SELECTOR)})?.value === ${JSON.stringify(SELECTION_TEXT)}`,
      'Agent Composer did not restore the copied text.',
    );
    const restoredValue = await evaluate(
      `document.querySelector(${JSON.stringify(COMPOSER_SELECTOR)})?.value ?? ''`,
    );
    if (restoredValue !== SELECTION_TEXT) {
      throw new Error(`Agent Composer clipboard restore failed: '${String(restoredValue)}'.`);
    }
    checkpoint('agent-composer-native-copy-paste', { restoredValue });

    await pressKey('End');
    for (let index = 0; index < 4; index += 1) await pressKey('ArrowLeft', ['Shift']);
    const partialSelection = await inspectComposerSelection(evaluate);
    if (
      partialSelection.selectionStart !== SELECTION_TEXT.length - 4 ||
      partialSelection.selectionEnd !== SELECTION_TEXT.length
    ) {
      throw new Error(
        `Agent Composer partial selection is incorrect: ${JSON.stringify(partialSelection)}.`,
      );
    }
    checkpoint('agent-composer-partial-selection', partialSelection);
    const partialScreenshot = await screenshot('agent-composer-partial-selection');

    await pressKey('End');
    await waitForEvaluation(
      evaluate,
      `(() => {
        const send = document.querySelector('.desktop-scene-workbench--agent-only .agent-composer-send');
        return send instanceof HTMLButtonElement && !send.disabled;
      })()`,
      'Agent Composer did not enable the send control.',
    );
    await click('.desktop-scene-workbench--agent-only .agent-composer-send');
    await waitForSelector(TRANSCRIPT_SELECTOR);
    const transcriptSelection = await selectTranscriptText(
      evaluate,
      TRANSCRIPT_SELECTOR,
      SELECTION_TEXT,
    );
    checkpoint('agent-transcript-light-selection', transcriptSelection);
    const transcriptScreenshot = await screenshot('agent-transcript-light-selection');

    await pressKey('c', ['Meta']);
    await click(COMPOSER_SELECTOR);
    await pressKey('v', ['Meta']);
    await waitForEvaluation(
      evaluate,
      `document.querySelector(${JSON.stringify(COMPOSER_SELECTOR)})?.value === ${JSON.stringify(SELECTION_TEXT)}`,
      'Agent transcript selection did not paste into the Composer.',
    );
    const transcriptPastedValue = await evaluate(
      `document.querySelector(${JSON.stringify(COMPOSER_SELECTOR)})?.value ?? ''`,
    );
    checkpoint('agent-transcript-native-copy-paste', { transcriptPastedValue });

    await selectTheme({ click, evaluate, theme: 'dark', waitForSelector });
    await type(COMPOSER_SELECTOR, SELECTION_TEXT);
    await pressKey('a', ['Meta']);
    const darkSelection = await inspectComposerSelection(evaluate);
    assertCompleteSelection(darkSelection, 'Dark theme');
    if (darkSelection.selectionBackground === lightSelection.selectionBackground) {
      throw new Error('Agent Composer selection background did not respond to the Desktop theme.');
    }
    checkpoint('agent-composer-dark-selection', darkSelection);
    const darkScreenshot = await screenshot('agent-composer-dark-selection');

    await openFixtureWorkspace(evaluate);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector(WORKSPACE_COMPOSER_SELECTOR);
    await type(WORKSPACE_COMPOSER_SELECTOR, WORKSPACE_SELECTION_TEXT);
    await waitForEvaluation(
      evaluate,
      `(() => {
        const send = document.querySelector('[data-dock-owner="agent"] .agent-composer-send');
        return send instanceof HTMLButtonElement && !send.disabled;
      })()`,
      'Workspace Agent Composer did not enable the send control.',
    );
    await click('[data-dock-owner="agent"] .agent-composer-send');
    await waitForSelector(WORKSPACE_TRANSCRIPT_SELECTOR);
    await click('.canvas-main-surface-inner');
    await click(WORKSPACE_TRANSCRIPT_SELECTOR);
    const workspaceTranscriptSelection = await selectTranscriptText(
      evaluate,
      WORKSPACE_TRANSCRIPT_SELECTOR,
      WORKSPACE_SELECTION_TEXT,
    );
    const canvasKeyboardFocused = await evaluate(
      `document.querySelector('.canvas-workbench-root')?.getAttribute('data-neko-keyboard-focused')`,
    );
    if (canvasKeyboardFocused !== 'false') {
      throw new Error(
        `Canvas retained keyboard focus after Agent transcript interaction: '${String(canvasKeyboardFocused)}'.`,
      );
    }
    checkpoint('workspace-agent-transcript-selection-after-canvas-focus', {
      ...workspaceTranscriptSelection,
      canvasKeyboardFocused,
    });
    const workspaceScreenshot = await screenshot(
      'workspace-agent-transcript-selection-after-canvas-focus',
    );

    await pressKey('c', ['Meta']);
    await click(WORKSPACE_COMPOSER_SELECTOR);
    await pressKey('v', ['Meta']);
    await waitForEvaluation(
      evaluate,
      `document.querySelector(${JSON.stringify(WORKSPACE_COMPOSER_SELECTOR)})?.value === ${JSON.stringify(WORKSPACE_SELECTION_TEXT)}`,
      'Workspace Agent transcript selection did not paste after Canvas focus.',
    );
    const workspaceTranscriptPastedValue = await evaluate(
      `document.querySelector(${JSON.stringify(WORKSPACE_COMPOSER_SELECTOR)})?.value ?? ''`,
    );
    checkpoint('workspace-agent-transcript-native-copy-paste', {
      workspaceTranscriptPastedValue,
    });

    return {
      lightSelection,
      partialSelection,
      restoredValue,
      transcriptSelection,
      transcriptPastedValue,
      darkSelection,
      workspaceTranscriptSelection,
      workspaceTranscriptPastedValue,
      screenshots: [
        lightScreenshot,
        partialScreenshot,
        transcriptScreenshot,
        darkScreenshot,
        workspaceScreenshot,
      ],
    };
  },
});

async function selectTheme({ click, evaluate, theme, waitForSelector }) {
  await waitForSelector(COMPOSER_SELECTOR);
  await click('.home-navigation-footer__actions button:last-child');
  await waitForSelector('[data-settings-surface="main"]');
  await evaluate(`(() => {
    const appearance = document.querySelectorAll(
      '.desktop-settings__navigation .home-nav-button',
    )[1];
    if (!(appearance instanceof HTMLButtonElement)) {
      throw new Error('Desktop Appearance settings are unavailable.');
    }
    appearance.click();
    return true;
  })()`);
  await waitForSelector('[data-settings-surface="main"] select');
  await evaluate(`(() => {
    const select = document.querySelector('[data-settings-surface="main"] select');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('Desktop Theme setting is unavailable.');
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Desktop Theme select setter is unavailable.');
    setter.call(select, ${JSON.stringify(theme)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitForEvaluation(
    evaluate,
    `document.documentElement.dataset.nekoTheme === ${JSON.stringify(theme)}`,
    `Desktop Theme did not switch to ${theme}.`,
  );
  await click('.home-primary-navigation .home-nav-button', 0);
  await waitForSelector(COMPOSER_SELECTOR);
}

function inspectComposerSelection(evaluate) {
  return evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(COMPOSER_SELECTOR)});
    if (!(input instanceof HTMLTextAreaElement)) {
      throw new Error('Agent Composer input is unavailable.');
    }
    const selection = getComputedStyle(input, '::selection');
    return {
      active: document.activeElement === input,
      value: input.value,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      selectionBackground: selection.backgroundColor,
      selectionForeground: selection.color,
      theme: document.documentElement.dataset.nekoTheme,
    };
  })()`);
}

function selectTranscriptText(evaluate, selector, expectedText) {
  return evaluate(`(() => {
    const transcript = document.querySelector(${JSON.stringify(selector)});
    if (!(transcript instanceof HTMLElement)) {
      throw new Error('Agent transcript text is unavailable.');
    }
    const range = document.createRange();
    range.selectNodeContents(transcript);
    const selection = window.getSelection();
    if (selection === null) throw new Error('Agent transcript selection is unavailable.');
    selection.removeAllRanges();
    selection.addRange(range);
    const selectionStyle = getComputedStyle(transcript, '::selection');
    const selectedText = selection.toString();
    if (
      selectedText !== ${JSON.stringify(expectedText)} ||
      selectionStyle.backgroundColor === 'rgba(0, 0, 0, 0)' ||
      selectionStyle.backgroundColor.length === 0 ||
      selectionStyle.color.length === 0
    ) {
      throw new Error(
        'Agent transcript selection is incomplete: ' +
          JSON.stringify({
            selectedText,
            selectionBackground: selectionStyle.backgroundColor,
            selectionForeground: selectionStyle.color,
          }),
      );
    }
    return {
      selectedText,
      selectionBackground: selectionStyle.backgroundColor,
      selectionForeground: selectionStyle.color,
    };
  })()`);
}

function assertCompleteSelection(selection, label) {
  if (
    !selection.active ||
    selection.value !== SELECTION_TEXT ||
    selection.selectionStart !== 0 ||
    selection.selectionEnd !== SELECTION_TEXT.length ||
    selection.selectionBackground === 'rgba(0, 0, 0, 0)' ||
    selection.selectionBackground.length === 0 ||
    selection.selectionForeground.length === 0
  ) {
    throw new Error(
      `${label} Agent Composer selection is incomplete: ${JSON.stringify(selection)}.`,
    );
  }
}

async function waitForEvaluation(evaluate, expression, message) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await evaluate('new Promise((resolve) => setTimeout(resolve, 50))');
  }
  throw new Error(message);
}
