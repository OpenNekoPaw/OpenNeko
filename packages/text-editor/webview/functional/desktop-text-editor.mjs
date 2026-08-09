import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openFixtureWorkspace } from '../../../../scripts/desktop-functional/desktop-operations.mjs';

const MARKDOWN_SOURCE = '# 创作笔记\n\n第一稿。\n';
const MARKDOWN_INCOMPLETE = '# 你好\n\n1. 目录\n2. 存在\n3. |';
const MARKDOWN_EDITED = '# 创作笔记\n\n这是通过桌面编辑器保存的中文内容。\n';
const JSON_INVALID = '{"title":"未完成",}';
const JSON_FORMATTED = '{\n  "title": "已格式化",\n  "scenes": 2\n}\n';
const IME_COMPOSITION = '中文输入法组合';
const CAPACITY_DOCUMENTS = Array.from(
  { length: 9 },
  (_, index) => `capacity-${String(index + 1)}.md`,
);
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
      writeFile(
        join(workspacePath, 'index.html'),
        '<main class="story"><h1>夜航</h1><p>准备出发。</p></main>\n',
        'utf8',
      ),
      writeFile(join(workspacePath, 'ime.txt'), '', 'utf8'),
      writeFile(join(workspacePath, 'story.fountain'), FOUNTAIN_SOURCE, 'utf8'),
      writeFile(join(workspacePath, 'crlf.txt'), 'first\r\nsecond\r\n', 'utf8'),
      writeFile(join(workspacePath, 'invalid-utf8.txt'), Uint8Array.from([0xc3, 0x28])),
      writeFile(join(workspacePath, 'mixed-lines.txt'), 'first\nsecond\r\n', 'utf8'),
      writeFile(join(workspacePath, 'oversized.txt'), 'x'.repeat(2 * 1024 * 1024 + 1), 'utf8'),
      ...CAPACITY_DOCUMENTS.map((label) =>
        writeFile(join(workspacePath, label), `# ${label}\n`, 'utf8'),
      ),
    ]);
    return { workspacePath };
  },
  async run({
    checkpoint,
    click,
    composeText,
    evaluate,
    prepared,
    restartApplication,
    screenshot,
    type,
    waitForDesktopBridge,
    waitForSelector,
  }) {
    await openFixtureWorkspace(evaluate);
    await resizeDesktopWindow(evaluate, 1800, 1000);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('.project-resource-dock .neko-resource-browser__facets [role="tab"]');
    await click('.project-resource-dock .neko-resource-browser__facets [role="tab"]', 0);
    await waitForResourceBrowserIdle(evaluate);

    await openTextDocument(evaluate, 'notes.md', 'markdown');
    await waitForRichReady(evaluate);
    await waitForRichText(evaluate, '第一稿。');
    const markdownDefault = await inspectTextEditor(evaluate);
    if (
      markdownDefault.presentationMode !== 'rich' ||
      !markdownDefault.outlineText.includes('创作笔记') ||
      markdownDefault.hasInternalToolbar ||
      !markdownDefault.contextActionsInTabRow ||
      markdownDefault.segmented.map((item) => item.label).join(',') !== '源码,所见即所得,分栏' ||
      !markdownDefault.segmented[0]?.icon.includes('codicon-code') ||
      !markdownDefault.segmented[1]?.icon.includes('codicon-edit') ||
      !markdownDefault.segmented[2]?.icon.includes('codicon-split-horizontal')
    ) {
      throw new Error(
        `Fresh Markdown presentation is not Rich + outline in the Workbench tab row: ${JSON.stringify(
          markdownDefault,
        )}`,
      );
    }
    const markdownDefaultScreenshot = await screenshot('markdown-rich-outline-default');
    await selectTextEditorMode(evaluate, 'source');
    await type('.cm-content', MARKDOWN_INCOMPLETE);
    await waitForEditorSource(evaluate, MARKDOWN_INCOMPLETE);
    await selectTextEditorMode(evaluate, 'split');
    await waitForRichReady(evaluate);
    await waitForRichText(evaluate, '目录');
    const markdownIncomplete = await inspectTextEditor(evaluate);
    if (
      markdownIncomplete.richState !== 'ready' ||
      !markdownIncomplete.richText.includes('存在') ||
      markdownIncomplete.richReadOnly !== 'true' ||
      markdownIncomplete.splitSurfaceOrder.join(',') !== 'source,preview' ||
      !markdownIncomplete.splitHorizontal
    ) {
      throw new Error(
        `Incomplete Markdown did not remain visible in left-Source/right-preview Split: ${JSON.stringify(
          markdownIncomplete,
        )}`,
      );
    }
    const markdownIncompleteScreenshot = await screenshot(
      'markdown-incomplete-source-preview-split',
    );
    checkpoint('markdown-incomplete-source-preview-split', markdownIncomplete);
    await selectTextEditorMode(evaluate, 'source');
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
    await clickTextEditorCommand(evaluate, 'save');
    await waitForEditorClean(evaluate);
    const markdownBytes = await readFile(join(prepared.workspacePath, 'notes.md'), 'utf8');
    if (markdownBytes !== MARKDOWN_EDITED) {
      throw new Error(`Markdown save published unexpected bytes: ${JSON.stringify(markdownBytes)}`);
    }
    checkpoint('markdown-save-canonical-bytes', markdown);

    await restartApplication();
    await waitForDesktopBridge(60_000);
    await resizeDesktopWindow(evaluate, 1800, 1000);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('.neko-text-editor-root[data-document-mode="markdown"]');
    await selectTextEditorMode(evaluate, 'source');
    await waitForEditorSource(evaluate, MARKDOWN_EDITED);
    await waitForEditorClean(evaluate);
    const cleanSessionRecovery = await inspectTextEditor(evaluate);
    const cleanSessionRecoveryError = await evaluate(`(() => {
      const text = document.querySelector('.desktop-text-editor-surface')?.textContent ?? '';
      return {
        unavailable: text.includes('Desktop Text Editor session is unavailable.'),
        alert: document.querySelector('.desktop-text-editor-surface [role="alert"]')?.textContent?.trim() ?? '',
      };
    })()`);
    if (cleanSessionRecoveryError.unavailable || cleanSessionRecoveryError.alert) {
      throw new Error(
        `Clean Text Editor session did not recover after application restart: ${JSON.stringify(
          cleanSessionRecoveryError,
        )}`,
      );
    }
    const cleanSessionRecoveryScreenshot = await screenshot(
      'markdown-clean-session-application-recovery',
    );
    checkpoint('markdown-clean-session-application-recovery', {
      editor: cleanSessionRecovery,
      error: cleanSessionRecoveryError,
    });
    await waitForSelector('.project-resource-dock .neko-resource-browser__facets [role="tab"]');
    await click('.project-resource-dock .neko-resource-browser__facets [role="tab"]', 0);
    await waitForResourceBrowserIdle(evaluate);

    await openTextDocument(evaluate, 'ime.txt', 'plain-text');
    await type('.cm-content', '');
    await composeText('.cm-content', IME_COMPOSITION);
    await waitForEditorSource(evaluate, IME_COMPOSITION);
    await waitForEditorDirty(evaluate);
    const imeComposition = await inspectTextEditor(evaluate);
    await clickTextEditorCommand(evaluate, 'save');
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
    await clickTextEditorCommand(evaluate, 'format');
    await waitForEditorSource(evaluate, JSON_FORMATTED);
    const jsonFormatted = await inspectTextEditor(evaluate);
    const jsonFormattedScreenshot = await screenshot('json-formatted');
    checkpoint('json-diagnostic-and-format', { invalid: jsonInvalid, formatted: jsonFormatted });

    await openTextDocument(evaluate, 'story.fountain', 'fountain');
    await waitForSelector('.neko-text-editor-outline');
    const outlineToggle = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.neko-text-editor-context-actions button')]
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

    await openTextDocument(evaluate, 'index.html', 'plain-text');
    await waitForEditorSource(
      evaluate,
      '<main class="story"><h1>夜航</h1><p>准备出发。</p></main>\n',
    );
    const html = await inspectTextEditor(evaluate);
    if (html.highlightedTokenCount < 8 || html.mode !== 'plain-text') {
      throw new Error(`HTML source highlighting is incomplete: ${JSON.stringify(html)}`);
    }
    const htmlScreenshot = await screenshot('html-source-highlighting');
    checkpoint('html-declared-source-highlighting', html);

    await openTextDocument(evaluate, 'data.json', 'json');
    await waitForEditorSource(evaluate, JSON_FORMATTED);
    await waitForEditorDirty(evaluate);
    await writeFile(join(prepared.workspacePath, 'data.json'), '{"external":true}\n', 'utf8');
    await clickTextEditorCommand(evaluate, 'save');
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

    await resizeDesktopWindow(evaluate, 960, 640);
    const compact = await inspectTextEditor(evaluate);
    if (
      compact.rootWidth > compact.viewportWidth ||
      compact.toolbarScrollWidth > compact.toolbarClientWidth + 1 ||
      compact.overlappingControls ||
      compact.tabControlsOverlap
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
    await waitForSelector('.desktop-scene-workbench--workspace');
    await activateMainViewTab(evaluate, 'notes.md');
    await waitForSelector('.neko-text-editor-root[data-document-mode="markdown"]');
    await click('.neko-text-editor-segmented button', 2);
    await waitForSelector('.neko-text-editor-body[data-presentation-mode="split"]');
    await waitForRichReady(evaluate);
    await waitForRichText(evaluate, '这是通过桌面编辑器保存的中文内容。');
    await resizeDesktopWindow(evaluate, 960, 640);
    const darkCompact = await inspectTextEditor(evaluate);
    if (
      darkCompact.theme !== 'dark' ||
      darkCompact.rootWidth > darkCompact.viewportWidth ||
      darkCompact.toolbarScrollWidth > darkCompact.toolbarClientWidth + 1 ||
      darkCompact.overlappingControls ||
      darkCompact.tabControlsOverlap ||
      !darkCompact.splitHorizontal ||
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

    await resizeDesktopWindow(evaluate, 1800, 1000);
    await ensureResourceDockVisible(evaluate);
    await waitForSelector('.project-resource-dock .neko-resource-browser__facets [role="tab"]');
    await click('.project-resource-dock .neko-resource-browser__facets [role="tab"]', 0);
    await waitForResourceBrowserIdle(evaluate);
    let capacityDocumentIndex = 0;
    let mainViewCount = await readMainViewCount(evaluate);
    while (mainViewCount < 8 && capacityDocumentIndex < CAPACITY_DOCUMENTS.length) {
      await openTextDocument(evaluate, CAPACITY_DOCUMENTS[capacityDocumentIndex], 'markdown');
      capacityDocumentIndex += 1;
      mainViewCount = await readMainViewCount(evaluate);
    }
    if (mainViewCount !== 8 || capacityDocumentIndex >= CAPACITY_DOCUMENTS.length) {
      throw new Error(
        `Main View capacity fixture did not reach eight distinct Views: ${JSON.stringify({
          mainViewCount,
          capacityDocumentIndex,
        })}`,
      );
    }
    const rejectedDocument = CAPACITY_DOCUMENTS[capacityDocumentIndex];
    await activateResourceItem(evaluate, rejectedDocument);
    await waitForCondition(
      evaluate,
      `document.querySelector('.neko-resource-browser__operation-error[role="alert"]') !== null`,
      'The ninth Main View did not publish a local Resource Browser operation diagnostic.',
    );
    const capacityRejected = await inspectMainViewCapacity(evaluate, rejectedDocument);
    if (
      capacityRejected.mainViewCount !== 8 ||
      !capacityRejected.resourceVisible ||
      !capacityRejected.rejectedItemVisible ||
      capacityRejected.resourceUnavailable ||
      !capacityRejected.alertText.includes('8') ||
      capacityRejected.activeDocument === rejectedDocument
    ) {
      throw new Error(
        `Main View capacity rejection was not fail-local: ${JSON.stringify(capacityRejected)}`,
      );
    }
    const capacityRejectedScreenshot = await screenshot('main-view-capacity-fail-local');
    checkpoint('main-view-capacity-fail-local', capacityRejected);

    await closeActiveMainView(evaluate);
    await waitForCondition(
      evaluate,
      `document.querySelectorAll('.project-main-group__tabs .neko-workbench-editor-tab').length === 7`,
      'Explicit Main View close did not release one capacity slot.',
    );
    await openTextDocument(evaluate, rejectedDocument, 'markdown');
    await waitForCondition(
      evaluate,
      `document.querySelector('.neko-resource-browser__operation-error') === null`,
      'Successful retry did not clear the local Resource Browser operation diagnostic.',
    );
    const capacityRetried = await inspectMainViewCapacity(evaluate, rejectedDocument);
    if (
      capacityRetried.mainViewCount !== 8 ||
      capacityRetried.activeDocument !== rejectedDocument ||
      !capacityRetried.resourceVisible ||
      capacityRetried.resourceUnavailable ||
      capacityRetried.alertText.length > 0
    ) {
      throw new Error(
        `Main View capacity retry did not use the canonical open path: ${JSON.stringify(capacityRetried)}`,
      );
    }
    const capacityRetriedScreenshot = await screenshot('main-view-capacity-explicit-close-retry');
    checkpoint('main-view-capacity-explicit-close-retry', capacityRetried);

    return {
      markdown,
      markdownDefault,
      markdownIncomplete,
      imeComposition,
      jsonInvalid,
      jsonFormatted,
      fountain,
      html,
      conflict,
      compact,
      darkCompact,
      cleanSessionRecovery,
      capacityRejected,
      capacityRetried,
      screenshots: [
        markdownDefaultScreenshot,
        markdownIncompleteScreenshot,
        markdownScreenshot,
        cleanSessionRecoveryScreenshot,
        jsonDiagnosticScreenshot,
        jsonFormattedScreenshot,
        fountainScreenshot,
        htmlScreenshot,
        conflictScreenshot,
        compactScreenshot,
        darkCompactScreenshot,
        capacityRejectedScreenshot,
        capacityRetriedScreenshot,
      ],
    };
  },
});

async function openTextDocument(evaluate, label, mode) {
  await waitForResourceItem(evaluate, label);
  await activateResourceItem(evaluate, label);
  await waitForCondition(
    evaluate,
    `document.querySelector('.neko-text-editor-root[data-document-mode=${JSON.stringify(mode)}]') !== null`,
    `Text Editor did not open '${label}' in ${mode} mode.`,
  );
  await waitForCondition(
    evaluate,
    `document.querySelector(
      '.project-main-group__tabs .neko-workbench-editor-tab[data-active="true"] .neko-workbench-editor-tab__label'
    )?.textContent?.trim() === ${JSON.stringify(label)}`,
    `Text Editor did not activate '${label}'.`,
  );
}

async function selectTextEditorMode(evaluate, mode) {
  await evaluate(`(() => {
    const labels = {
      rich: ['Rich', '所见即所得'],
      source: ['Source', '源码'],
      split: ['Split', '分栏'],
      preview: ['Preview', '预览'],
    }[${JSON.stringify(mode)}];
    const button = [...document.querySelectorAll('.neko-text-editor-segmented button')]
      .find((candidate) => labels.includes(candidate.getAttribute('aria-label') ?? ''));
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(${JSON.stringify(`Text Editor mode '${mode}' is unavailable.`)});
    }
    button.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.querySelector('.neko-text-editor-body')?.getAttribute('data-presentation-mode') === ${JSON.stringify(mode)}`,
    `Text Editor did not enter '${mode}' mode.`,
  );
}

async function clickTextEditorCommand(evaluate, command) {
  const labels = {
    format: ['Format document', '格式化文档'],
    save: ['Save', '保存'],
  }[command];
  if (!labels) throw new Error(`Unknown Text Editor command '${command}'.`);
  await evaluate(`(() => {
    const labels = ${JSON.stringify(labels)};
    const button = [...document.querySelectorAll('.neko-text-editor-context-actions button')]
      .find((candidate) => labels.includes(candidate.getAttribute('aria-label') ?? ''));
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(${JSON.stringify(`Text Editor command '${command}' is unavailable.`)});
    }
    button.click();
    return true;
  })()`);
}

async function activateResourceItem(evaluate, label) {
  await waitForResourceItem(evaluate, label);
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('.neko-resource-browser__item')]
      .find((candidate) => candidate.textContent?.includes(${JSON.stringify(label)}));
    if (!(item instanceof HTMLButtonElement)) throw new Error('Resource item is unavailable.');
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    return true;
  })()`);
}

async function activateMainViewTab(evaluate, label) {
  await evaluate(`(() => {
    const tab = [...document.querySelectorAll('.project-main-group__tabs .neko-workbench-editor-tab')]
      .find((candidate) => candidate.querySelector('.neko-workbench-editor-tab__label')?.textContent?.trim() === ${JSON.stringify(label)});
    if (!(tab instanceof HTMLElement)) {
      throw new Error(${JSON.stringify(`Main View tab '${label}' is unavailable.`)});
    }
    tab.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.querySelector(
      '.project-main-group__tabs .neko-workbench-editor-tab[data-active="true"] .neko-workbench-editor-tab__label'
    )?.textContent?.trim() === ${JSON.stringify(label)}`,
    `Main View tab '${label}' did not become active.`,
  );
}

async function ensureResourceDockVisible(evaluate) {
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-workbench-region-control="management"]') instanceof HTMLButtonElement`,
    'Project Resources region control is unavailable.',
  );
  const visible = await evaluate(`(() => {
    const dock = document.querySelector('.project-resource-dock');
    if (!(dock instanceof HTMLElement)) return false;
    const rect = dock.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  })()`);
  if (visible) return;
  const selected = await evaluate(
    `document.querySelector('[data-workbench-region-control="management"]')?.getAttribute('aria-pressed') === 'true'`,
  );
  if (selected) {
    await evaluate(`(() => {
      const control = document.querySelector('[data-workbench-region-control="management"]');
      if (!(control instanceof HTMLButtonElement)) {
        throw new Error('Project Resources region control is unavailable.');
      }
      control.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `document.querySelector('[data-workbench-region-control="management"]')?.getAttribute('aria-pressed') === 'false'`,
      'Project Resources did not commit its hidden presentation.',
    );
  }
  await evaluate(`(() => {
    const control = document.querySelector('[data-workbench-region-control="management"]');
    if (!(control instanceof HTMLButtonElement)) {
      throw new Error('Project Resources region control is unavailable.');
    }
    control.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `(() => {
      const dock = document.querySelector('.project-resource-dock');
      if (!(dock instanceof HTMLElement)) return false;
      const rect = dock.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })()`,
    'Project Resources did not become visible through its region control.',
  );
}

async function readMainViewCount(evaluate) {
  return evaluate(
    `document.querySelectorAll('.project-main-group__tabs .neko-workbench-editor-tab').length`,
  );
}

async function closeActiveMainView(evaluate) {
  await evaluate(`(() => {
    const close = document.querySelector(
      '.project-main-group__tabs .neko-workbench-editor-tab[data-active="true"] .neko-workbench-editor-tab__close',
    );
    if (!(close instanceof HTMLButtonElement)) {
      throw new Error('Active Main View close control is unavailable.');
    }
    close.click();
    return true;
  })()`);
}

async function inspectMainViewCapacity(evaluate, rejectedDocument) {
  return evaluate(`(() => {
    const browser = document.querySelector('.desktop-resource-browser-root');
    const activeTab = document.querySelector(
      '.project-main-group__tabs .neko-workbench-editor-tab[data-active="true"]',
    );
    const alert = browser?.querySelector('.neko-resource-browser__operation-error[role="alert"]');
    return {
      mainViewCount: document.querySelectorAll(
        '.project-main-group__tabs .neko-workbench-editor-tab',
      ).length,
      activeDocument: activeTab?.querySelector('.neko-workbench-editor-tab__label')?.textContent?.trim() ?? '',
      alertText: alert?.textContent?.trim() ?? '',
      resourceVisible:
        browser instanceof HTMLElement && browser.getBoundingClientRect().width > 0,
      resourceUnavailable: (browser?.textContent ?? '').includes('资源库不可用') ||
        (browser?.textContent ?? '').includes('Resource Browser unavailable'),
      rejectedItemVisible: [...(browser?.querySelectorAll('.neko-resource-browser__item') ?? [])]
        .some((item) => item.textContent?.includes(${JSON.stringify(rejectedDocument)})),
    };
  })()`);
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
    `document.querySelector('.neko-text-editor-context-actions button[aria-label="Save"], .neko-text-editor-context-actions button[aria-label="保存"]')?.hasAttribute('disabled') === true`,
    'Text Editor did not become clean after save.',
  );
}

async function waitForEditorDirty(evaluate) {
  await waitForCondition(
    evaluate,
    `document.querySelector('.neko-text-editor-context-actions button[aria-label="Save"], .neko-text-editor-context-actions button[aria-label="保存"]')?.hasAttribute('disabled') === false`,
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
      const dock = [...document.querySelectorAll('.project-resource-dock')].find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const tabs = [...(dock?.querySelectorAll('.neko-resource-browser__facets [role="tab"]') ?? [])];
      const first = tabs[0];
      if (!(first instanceof HTMLButtonElement) || tabs.length !== 4) return false;
      const rect = first.getBoundingClientRect();
      return tabs.every((tab) => !(tab instanceof HTMLButtonElement) || !tab.disabled) &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.left >= 0 &&
        rect.right <= document.documentElement.clientWidth &&
        rect.top >= 0 &&
        rect.bottom <= document.documentElement.clientHeight;
    })()`,
    'Resource Browser did not finish its interactive facet transition.',
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

async function resizeDesktopWindow(evaluate, width, height) {
  let actualSize = await readDesktopViewport(evaluate);
  if (hasReachedDesktopWidth(actualSize.width, width)) return;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await evaluate(`window.resizeTo(${String(width)}, ${String(height)})`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    actualSize = await readDesktopViewport(evaluate);
    if (hasReachedDesktopWidth(actualSize.width, width)) return;
  }
  throw new Error(
    `Desktop window did not enter the requested ${String(width)}x${String(height)} validation size: ${JSON.stringify(actualSize)}`,
  );
}

async function readDesktopViewport(evaluate) {
  return evaluate(`(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }))()`);
}

function hasReachedDesktopWidth(actualWidth, requestedWidth) {
  return requestedWidth <= 1000
    ? actualWidth <= requestedWidth
    : actualWidth >= requestedWidth - 100;
}

async function inspectTextEditor(evaluate) {
  return evaluate(`(() => {
    const root = document.querySelector('.neko-text-editor-root');
    const contextActions = document.querySelector('.neko-text-editor-context-actions');
    const contextTarget = contextActions?.parentElement;
    const tabList = contextTarget?.previousElementSibling;
    if (!(root instanceof HTMLElement) || !(contextActions instanceof HTMLElement)) {
      throw new Error('Text Editor presentation is unavailable.');
    }
    const rootStyle = getComputedStyle(root);
    const sourceRect = root.querySelector('.neko-text-editor-codemirror')?.getBoundingClientRect();
    const richRect = root.querySelector('.neko-text-editor-rich')?.getBoundingClientRect();
    const controls = [...contextActions.querySelectorAll('button')].map((button) => button.getBoundingClientRect());
    const contextTargetRect = contextTarget?.getBoundingClientRect();
    const tabListRect = tabList?.getBoundingClientRect();
    const tabRects = [...(tabList?.querySelectorAll('.neko-workbench-editor-tab') ?? [])]
      .map((tab) => {
        const rect = tab.getBoundingClientRect();
        return tabListRect
          ? {
              left: Math.max(rect.left, tabListRect.left),
              right: Math.min(rect.right, tabListRect.right),
              top: Math.max(rect.top, tabListRect.top),
              bottom: Math.min(rect.bottom, tabListRect.bottom),
              width: Math.max(0, Math.min(rect.right, tabListRect.right) - Math.max(rect.left, tabListRect.left)),
              height: Math.max(0, Math.min(rect.bottom, tabListRect.bottom) - Math.max(rect.top, tabListRect.top)),
            }
          : rect;
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const saveButton = [...contextActions.querySelectorAll('button')].find((button) =>
      ['Save', '保存'].includes(button.getAttribute('aria-label') ?? '')
    );
    return {
      theme: document.documentElement.dataset.nekoTheme,
      mode: root.dataset.documentMode,
      presentationMode: root.querySelector('.neko-text-editor-body')?.getAttribute('data-presentation-mode'),
      segmented: [...contextActions.querySelectorAll('.neko-text-editor-segmented button')].map((button) => ({
        label: button.getAttribute('aria-label') ?? '',
        pressed: button.getAttribute('aria-pressed'),
        icon: button.querySelector('.codicon')?.className ?? '',
      })),
      richState: root.querySelector('.neko-text-editor-rich')?.getAttribute('data-rich-state') ?? null,
      richReadOnly: root.querySelector('.neko-text-editor-rich .ProseMirror')?.getAttribute('aria-readonly') ?? null,
      splitSurfaceOrder: [...(root.querySelector('.neko-text-editor-body')?.children ?? [])]
        .flatMap((child) => {
          if (!(child instanceof HTMLElement)) return [];
          if (child.classList.contains('neko-text-editor-codemirror')) return ['source'];
          if (child.classList.contains('neko-text-editor-rich')) return ['preview'];
          return [];
        }),
      splitHorizontal:
        sourceRect !== undefined &&
        richRect !== undefined &&
        Math.abs(sourceRect.top - richRect.top) <= 1 &&
        sourceRect.right <= richRect.left + 1,
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
      dirty: saveButton instanceof HTMLButtonElement && !saveButton.disabled,
      highlightedTokenCount: root.querySelectorAll('.cm-content .cm-line > span').length,
      hasInternalToolbar: root.querySelector('.neko-text-editor-toolbar') !== null,
      contextActionsInTabRow:
        contextTarget?.classList.contains('neko-workbench-editor-tabs__context-actions') === true &&
        contextTarget?.closest('.project-main-group__tabs') !== null,
      viewportWidth: document.documentElement.clientWidth,
      rootWidth: root.getBoundingClientRect().width,
      rootBackground: rootStyle.backgroundColor,
      rootColor: rootStyle.color,
      toolbarClientWidth: contextTarget?.clientWidth ?? 0,
      toolbarScrollWidth: contextTarget?.scrollWidth ?? 0,
      overlappingControls: controls.some((left, index) =>
        controls.slice(index + 1).some((right) =>
          left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
        )
      ),
      tabControlsOverlap: contextTargetRect
        ? tabRects.some((tab) =>
            tab.left < contextTargetRect.right &&
            tab.right > contextTargetRect.left &&
            tab.top < contextTargetRect.bottom &&
            tab.bottom > contextTargetRect.top
          )
        : false,
    };
  })()`);
}
