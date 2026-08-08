import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openFixtureWorkspace } from '../../../../scripts/desktop-functional/desktop-operations.mjs';

const MARKDOWN_SOURCE = '# 创作笔记\n\n第一稿。\n';
const MARKDOWN_EDITED = '# 创作笔记\n\n这是通过桌面编辑器保存的中文内容。\n';
const JSON_INVALID = '{"title":"未完成",}';
const JSON_FORMATTED = '{\n  "title": "已格式化",\n  "scenes": 2\n}\n';
const IME_COMPOSITION = '中文输入法组合';
const FOUNTAIN_SOURCE = `Title: 夜航

.内景 客厅 - 夜

@林默
我们现在出发。

.外景 码头 - 清晨

@周宁
船已经到了。
`;

export const desktopTextEditorScenario = Object.freeze({
  id: 'desktop-text-editor',
  owner: '@neko/text-editor-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    await Promise.all([
      writeFile(join(workspacePath, 'notes.md'), MARKDOWN_SOURCE, 'utf8'),
      writeFile(join(workspacePath, 'data.json'), JSON_INVALID, 'utf8'),
      writeFile(join(workspacePath, 'ime.txt'), '', 'utf8'),
      writeFile(join(workspacePath, 'story.fountain'), FOUNTAIN_SOURCE, 'utf8'),
      writeFile(join(workspacePath, 'crlf.txt'), 'first\r\nsecond\r\n', 'utf8'),
      writeFile(join(workspacePath, 'invalid-utf8.txt'), Uint8Array.from([0xc3, 0x28])),
      writeFile(join(workspacePath, 'mixed-lines.txt'), 'first\nsecond\r\n', 'utf8'),
      writeFile(join(workspacePath, 'oversized.txt'), 'x'.repeat(2 * 1024 * 1024 + 1), 'utf8'),
    ]);
    return { workspacePath };
  },
  async run({
    checkpoint,
    click,
    composeText,
    evaluate,
    prepared,
    screenshot,
    type,
    waitForSelector,
  }) {
    await openFixtureWorkspace(evaluate);
    await evaluate(`window.resizeTo(1800, 1000)`);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('.neko-resource-browser__facets [role="tab"]');
    await click('.neko-resource-browser__facets [role="tab"]', 0);
    await waitForResourceBrowserIdle(evaluate);

    await openTextDocument(evaluate, 'notes.md', 'markdown');
    await type('.cm-content', MARKDOWN_EDITED);
    await waitForEditorSource(evaluate, MARKDOWN_EDITED);
    await waitForEditorDirty(evaluate);
    await click('.neko-text-editor-segmented button', 2);
    await waitForSelector('.neko-text-editor-body[data-presentation-mode="split"]');
    await waitForRichReady(evaluate);
    await waitForRichText(evaluate, '这是通过桌面编辑器保存的中文内容。');
    const markdown = await inspectTextEditor(evaluate);
    if (!markdown.richText.includes('这是通过桌面编辑器保存的中文内容。')) {
      throw new Error(
        `Markdown Rich surface did not reflect the accepted edit: ${JSON.stringify(markdown)}`,
      );
    }
    const markdownScreenshot = await screenshot('markdown-source-rich-split');
    await click('.neko-text-editor-commands button[title="保存"]');
    await waitForEditorClean(evaluate);
    const markdownBytes = await readFile(join(prepared.workspacePath, 'notes.md'), 'utf8');
    if (markdownBytes !== MARKDOWN_EDITED) {
      throw new Error(`Markdown save published unexpected bytes: ${JSON.stringify(markdownBytes)}`);
    }
    checkpoint('markdown-save-canonical-bytes', markdown);

    await openTextDocument(evaluate, 'ime.txt', 'plain-text');
    await type('.cm-content', '');
    await composeText('.cm-content', IME_COMPOSITION);
    await waitForEditorSource(evaluate, IME_COMPOSITION);
    await waitForEditorDirty(evaluate);
    const imeComposition = await inspectTextEditor(evaluate);
    await click('.neko-text-editor-commands button[title="保存"]');
    await waitForEditorClean(evaluate);
    const imeBytes = await readFile(join(prepared.workspacePath, 'ime.txt'), 'utf8');
    if (imeBytes !== IME_COMPOSITION) {
      throw new Error(`IME composition saved unexpected bytes: ${JSON.stringify(imeBytes)}`);
    }
    checkpoint('plain-text-cjk-ime-composition', imeComposition);

    await openTextDocument(evaluate, 'data.json', 'json');
    await waitForSelector('.neko-text-editor-diagnostics');
    const jsonInvalid = await inspectTextEditor(evaluate);
    if (!/JSON/iu.test(jsonInvalid.diagnosticText)) {
      throw new Error(`Invalid JSON diagnostic is missing: ${JSON.stringify(jsonInvalid)}`);
    }
    const jsonDiagnosticScreenshot = await screenshot('json-invalid-diagnostic');
    await type('.cm-content', '{"title":"已格式化","scenes":2}');
    await waitForEditorSource(evaluate, '{"title":"已格式化","scenes":2}');
    await waitForEditorDirty(evaluate);
    await waitForCondition(
      evaluate,
      `document.querySelector('.neko-text-editor-diagnostics') === null`,
      'Text Editor did not accept the valid JSON editSequence.',
    );
    await click('.neko-text-editor-commands button', 2);
    await waitForEditorSource(evaluate, JSON_FORMATTED);
    const jsonFormatted = await inspectTextEditor(evaluate);
    const jsonFormattedScreenshot = await screenshot('json-formatted');
    checkpoint('json-diagnostic-and-format', { invalid: jsonInvalid, formatted: jsonFormatted });

    await openTextDocument(evaluate, 'story.fountain', 'fountain');
    await waitForSelector('.neko-text-editor-outline');
    const outlineToggle = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.neko-text-editor-root button')]
        .find((candidate) => /outline|大纲/iu.test(candidate.getAttribute('title') ?? ''));
      return {
        exists: document.querySelector('.neko-text-editor-outline') !== null,
        visible:
          (document.querySelector('.neko-text-editor-outline')?.getBoundingClientRect().width ?? 0) >
          0,
        pressed: button?.getAttribute('aria-pressed'),
        title: button?.getAttribute('title'),
        presentationMode: document.querySelector('.neko-text-editor-body')?.getAttribute('data-presentation-mode'),
      };
    })()`);
    if (!outlineToggle.exists || !outlineToggle.visible || outlineToggle.pressed !== 'true') {
      throw new Error(`Fountain outline did not open: ${JSON.stringify(outlineToggle)}`);
    }
    await click('.neko-text-editor-segmented button', 2);
    await waitForSelector('.neko-text-editor-body[data-presentation-mode="split"]');
    await waitForSelector('.neko-text-editor-preview');
    await waitForPreviewText(evaluate, '我们现在出发。');
    await waitForPreviewText(evaluate, '船已经到了。');
    const fountain = await inspectTextEditor(evaluate);
    if (
      !fountain.outlineText.includes('内景 客厅 - 夜') ||
      !fountain.outlineText.includes('外景 码头 - 清晨') ||
      !fountain.previewText.includes('我们现在出发。') ||
      !fountain.previewText.includes('船已经到了。')
    ) {
      throw new Error(`Fountain projection is incomplete: ${JSON.stringify(fountain)}`);
    }
    const fountainScreenshot = await screenshot('fountain-outline-preview-cjk');
    checkpoint('fountain-canonical-outline-preview', fountain);

    await openTextDocument(evaluate, 'data.json', 'json');
    await waitForEditorSource(evaluate, JSON_FORMATTED);
    await waitForEditorDirty(evaluate);
    await writeFile(join(prepared.workspacePath, 'data.json'), '{"external":true}\n', 'utf8');
    await click('.neko-text-editor-commands button', 3);
    await waitForSelector('.neko-text-editor-operation-error[role="alert"]');
    const conflict = await inspectTextEditor(evaluate);
    if (
      !conflict.source.includes('已格式化') ||
      !/reload|重新加载/iu.test(conflict.errorText) ||
      !/keep editing|继续编辑/iu.test(conflict.errorText)
    ) {
      throw new Error(
        `Save conflict did not preserve the dirty buffer: ${JSON.stringify(conflict)}`,
      );
    }
    const conflictScreenshot = await screenshot('save-conflict-keeps-dirty-buffer');
    await click('.neko-text-editor-conflict-actions button', 1);
    await waitForCondition(
      evaluate,
      `document.querySelector('.neko-text-editor-operation-error') === null`,
      'Keep Editing did not dismiss the conflict diagnostic.',
    );
    const externalBytes = await readFile(join(prepared.workspacePath, 'data.json'), 'utf8');
    if (externalBytes !== '{"external":true}\n') {
      throw new Error(`Conflict handling changed external bytes: ${JSON.stringify(externalBytes)}`);
    }
    checkpoint('save-conflict-fail-visible-local', conflict);

    await evaluate(`window.resizeTo(960, 640)`);
    await waitForCondition(
      evaluate,
      `document.documentElement.clientWidth <= 960`,
      'Desktop window did not enter the compact validation width.',
    );
    const compact = await inspectTextEditor(evaluate);
    if (
      compact.rootWidth > compact.viewportWidth ||
      compact.toolbarScrollWidth > compact.toolbarClientWidth + 1 ||
      compact.overlappingControls
    ) {
      throw new Error(
        `Compact Text Editor controls overflow or overlap: ${JSON.stringify(compact)}`,
      );
    }
    const compactScreenshot = await screenshot('text-editor-compact-cjk');
    checkpoint('compact-cjk-fit', compact);

    const activeProjectGroupId = await readActiveProjectGroupId(evaluate);
    await setDesktopThemeFromSettings(evaluate, 'dark');
    await returnToProject(evaluate, activeProjectGroupId);
    await evaluate(`window.resizeTo(1800, 1000)`);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('.neko-resource-browser__facets [role="tab"]');
    await waitForResourceBrowserIdle(evaluate);
    await click('.neko-resource-browser__facets [role="tab"]', 0);
    await waitForResourceBrowserIdle(evaluate);
    await openTextDocument(evaluate, 'notes.md', 'markdown');
    await click('.neko-text-editor-segmented button', 2);
    await waitForSelector('.neko-text-editor-body[data-presentation-mode="split"]');
    await waitForRichReady(evaluate);
    await waitForRichText(evaluate, '这是通过桌面编辑器保存的中文内容。');
    await evaluate(`window.resizeTo(960, 640)`);
    await waitForCondition(
      evaluate,
      `document.documentElement.clientWidth <= 960`,
      'Desktop window did not enter the dark compact validation width.',
    );
    const darkCompact = await inspectTextEditor(evaluate);
    if (
      darkCompact.theme !== 'dark' ||
      darkCompact.rootWidth > darkCompact.viewportWidth ||
      darkCompact.toolbarScrollWidth > darkCompact.toolbarClientWidth + 1 ||
      darkCompact.overlappingControls ||
      darkCompact.rootBackground === 'rgba(0, 0, 0, 0)' ||
      darkCompact.rootBackground === 'rgb(255, 255, 255)' ||
      darkCompact.rootColor === 'rgb(32, 33, 36)' ||
      darkCompact.rootColor === darkCompact.rootBackground
    ) {
      throw new Error(
        `Dark compact Text Editor presentation is incomplete: ${JSON.stringify(darkCompact)}`,
      );
    }
    const darkCompactScreenshot = await screenshot('markdown-split-compact-dark');
    checkpoint('markdown-split-compact-dark', darkCompact);

    await setDesktopThemeFromSettings(evaluate, 'light');
    await returnToProject(evaluate, activeProjectGroupId);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForCondition(
      evaluate,
      `document.documentElement.dataset.nekoTheme === 'light'`,
      'Desktop Theme did not complete the reversible light-theme cycle.',
    );

    return {
      markdown,
      imeComposition,
      jsonInvalid,
      jsonFormatted,
      fountain,
      conflict,
      compact,
      darkCompact,
      screenshots: [
        markdownScreenshot,
        jsonDiagnosticScreenshot,
        jsonFormattedScreenshot,
        fountainScreenshot,
        conflictScreenshot,
        compactScreenshot,
        darkCompactScreenshot,
      ],
    };
  },
});

async function openTextDocument(evaluate, label, mode) {
  await waitForResourceItem(evaluate, label);
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('.neko-resource-browser__item')]
      .find((candidate) => candidate.textContent?.includes(${JSON.stringify(label)}));
    if (!(item instanceof HTMLButtonElement)) throw new Error('Resource item is unavailable.');
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.querySelector('.neko-text-editor-root[data-document-mode=${JSON.stringify(mode)}]') !== null`,
    `Text Editor did not open '${label}' in ${mode} mode.`,
  );
  await waitForCondition(
    evaluate,
    `document.querySelector('.neko-text-editor-document-title strong')?.textContent?.trim() === ${JSON.stringify(label)}`,
    `Text Editor did not activate '${label}'.`,
  );
}

async function waitForEditorSource(evaluate, source) {
  const expected = source.replace(/\n+$/u, '');
  const startedAt = Date.now();
  let actual = '';
  while (Date.now() - startedAt < 30_000) {
    actual = await evaluate(`(() => {
      const content = document.querySelector('.neko-text-editor-codemirror .cm-content');
      if (!(content instanceof HTMLElement)) return '';
      return [...content.querySelectorAll('.cm-line')]
        .map((line) => line.textContent ?? '')
        .join('\\n');
    })()`);
    if (actual.replace(/\n+$/u, '') === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Text Editor did not accept the expected source: ${JSON.stringify({ expected, actual })}`,
  );
}

async function waitForEditorClean(evaluate) {
  await waitForCondition(
    evaluate,
    `document.querySelector('.neko-text-editor-dirty-indicator') === null`,
    'Text Editor did not become clean after save.',
  );
}

async function waitForEditorDirty(evaluate) {
  await waitForCondition(
    evaluate,
    `document.querySelector('.neko-text-editor-dirty-indicator') !== null`,
    'Text Editor did not publish the accepted dirty editSequence.',
  );
}

async function waitForResourceItem(evaluate, label) {
  await waitForCondition(
    evaluate,
    `(() => [...document.querySelectorAll('.neko-resource-browser__item')]
      .some((item) => item.textContent?.includes(${JSON.stringify(label)})))()`,
    `Resource Browser did not project '${label}'.`,
  );
}

async function waitForResourceBrowserIdle(evaluate) {
  await waitForCondition(
    evaluate,
    `(() => {
      const tabs = [...document.querySelectorAll('.neko-resource-browser__facets [role="tab"]')];
      return tabs.length === 4 && tabs.every((tab) => !(tab instanceof HTMLButtonElement) || !tab.disabled);
    })()`,
    'Resource Browser did not finish its facet transition.',
  );
}

async function setDesktopThemeFromSettings(evaluate, theme) {
  await evaluate(`(() => {
    const settings = document.querySelector('.home-navigation-footer__actions button:last-child');
    if (!(settings instanceof HTMLButtonElement)) throw new Error('Desktop Settings is unavailable.');
    settings.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-settings-surface="main"]') instanceof HTMLElement`,
    'Desktop Settings did not open for Text Editor theme validation.',
  );
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
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-settings-surface="main"] select') instanceof HTMLSelectElement`,
    'Desktop Theme setting did not render.',
  );
  await evaluate(`(() => {
    const select = document.querySelector('[data-settings-surface="main"] select');
    if (!(select instanceof HTMLSelectElement)) throw new Error('Desktop Theme setting is unavailable.');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Desktop Theme select setter is unavailable.');
    setter.call(select, ${JSON.stringify(theme)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.documentElement.dataset.nekoTheme === ${JSON.stringify(theme)}`,
    `Desktop Theme did not switch to ${theme} through Settings.`,
  );
}

async function readActiveProjectGroupId(evaluate) {
  return evaluate(`(() => {
    const group = document.querySelector(
      '.primary-conversation-group[data-group-kind="project"] .primary-conversation-group__header[data-active="true"]',
    )?.closest('.primary-conversation-group');
    const groupId = group?.getAttribute('data-group-id');
    if (!groupId?.startsWith('project:')) {
      throw new Error('Exact active Project navigation identity is unavailable.');
    }
    return groupId;
  })()`);
}

async function returnToProject(evaluate, groupId) {
  await evaluate(`(() => {
    const group = [...document.querySelectorAll('.primary-conversation-group')].find(
      (candidate) => candidate.getAttribute('data-group-id') === ${JSON.stringify(groupId)},
    );
    const project = group?.querySelector('.primary-conversation-group__project-link');
    if (!(project instanceof HTMLButtonElement)) {
      throw new Error('Exact Project navigation is unavailable.');
    }
    project.click();
    return true;
  })()`);
}

async function waitForPreviewText(evaluate, expectedText) {
  await waitForCondition(
    evaluate,
    `document.querySelector('.neko-text-editor-preview')?.textContent?.includes(${JSON.stringify(expectedText)}) === true`,
    `Text Editor preview did not render ${JSON.stringify(expectedText)}.`,
  );
}

async function waitForRichText(evaluate, expectedText) {
  await waitForCondition(
    evaluate,
    `document.querySelector('.neko-text-editor-rich .ProseMirror')?.textContent?.includes(${JSON.stringify(expectedText)}) === true`,
    `Rich editor did not contain ${JSON.stringify(expectedText)}.`,
  );
}

async function waitForRichReady(evaluate) {
  try {
    await waitForCondition(
      evaluate,
      `document.querySelector('.neko-text-editor-rich .ProseMirror') !== null`,
      'Rich editor did not mount its ProseMirror surface.',
    );
  } catch (error) {
    const detail = await inspectTextEditor(evaluate);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} ${JSON.stringify(detail)}`,
    );
  }
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

async function inspectTextEditor(evaluate) {
  return evaluate(`(() => {
    const root = document.querySelector('.neko-text-editor-root');
    const toolbar = document.querySelector('.neko-text-editor-toolbar');
    if (!(root instanceof HTMLElement) || !(toolbar instanceof HTMLElement)) {
      throw new Error('Text Editor presentation is unavailable.');
    }
    const rootStyle = getComputedStyle(root);
    const controls = [...toolbar.querySelectorAll('button')].map((button) => button.getBoundingClientRect());
    return {
      theme: document.documentElement.dataset.nekoTheme,
      mode: root.dataset.documentMode,
      presentationMode: root.querySelector('.neko-text-editor-body')?.getAttribute('data-presentation-mode'),
      segmented: [...root.querySelectorAll('.neko-text-editor-segmented button')].map((button) => ({
        label: button.textContent?.trim() ?? '',
        pressed: button.getAttribute('aria-pressed'),
      })),
      richState: root.querySelector('.neko-text-editor-rich')?.getAttribute('data-rich-state') ?? null,
      bodyChildren: [...root.querySelector('.neko-text-editor-body')?.children ?? []].map((child) =>
        child instanceof HTMLElement ? { className: child.className, text: child.textContent ?? '' } : null
      ),
      source: [...root.querySelectorAll('.cm-content .cm-line')]
        .map((line) => line.textContent ?? '')
        .join('\\n'),
      previewText: root.querySelector('.neko-text-editor-preview')?.textContent ?? '',
      richText: root.querySelector('.neko-text-editor-rich .ProseMirror')?.textContent ?? '',
      outlineText: root.querySelector('.neko-text-editor-outline')?.textContent ?? '',
      diagnosticText: root.querySelector('.neko-text-editor-diagnostics')?.textContent ?? '',
      errorText: root.querySelector('.neko-text-editor-operation-error')?.textContent ?? '',
      dirty: root.querySelector('.neko-text-editor-dirty-indicator') !== null,
      viewportWidth: document.documentElement.clientWidth,
      rootWidth: root.getBoundingClientRect().width,
      rootBackground: rootStyle.backgroundColor,
      rootColor: rootStyle.color,
      toolbarClientWidth: toolbar.clientWidth,
      toolbarScrollWidth: toolbar.scrollWidth,
      overlappingControls: controls.some((left, index) =>
        controls.slice(index + 1).some((right) =>
          left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
        )
      ),
    };
  })()`);
}
