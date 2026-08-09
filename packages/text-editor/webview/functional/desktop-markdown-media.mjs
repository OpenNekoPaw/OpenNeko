import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { openFixtureWorkspace } from '../../../../scripts/desktop-functional/desktop-operations.mjs';

const execFileAsync = promisify(execFile);

const MARKDOWN_MEDIA = `# 媒体投影

CommonMark 图片：

![彩条分镜](board.png)

Workspace 图片：

![[board.png]]

音频：

![[tone.wav]]

视频：

![[shot.webm]]

缺失资源：

![[missing.png]]
`;
const MARKDOWN_COMPLETION_PREFIX = '# 引用补全\n\n![[bo';

export const desktopMarkdownMediaScenario = Object.freeze({
  id: 'desktop-markdown-media',
  owner: '@neko/text-editor-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    await Promise.all([
      writeFile(join(workspacePath, 'media.md'), MARKDOWN_MEDIA, 'utf8'),
      writeFile(join(workspacePath, 'input.md'), '# 输入验证\n', 'utf8'),
    ]);
    const ffmpeg = process.env['NEKO_FFMPEG_PATH']?.trim() || 'ffmpeg';
    await Promise.all([
      execFileAsync(ffmpeg, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=960x540:rate=1',
        '-frames:v',
        '1',
        join(workspacePath, 'board.png'),
      ]),
      execFileAsync(ffmpeg, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=523:sample_rate=44100:duration=2',
        join(workspacePath, 'tone.wav'),
      ]),
      execFileAsync(ffmpeg, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=640x360:rate=24:duration=2',
        '-c:v',
        'libvpx-vp9',
        '-pix_fmt',
        'yuv420p',
        '-an',
        join(workspacePath, 'shot.webm'),
      ]),
    ]);
    return { workspacePath };
  },
  async run({
    checkpoint,
    click,
    composeText,
    evaluate,
    prepared,
    pressKey,
    screenshot,
    type,
    waitForSelector,
  }) {
    await openFixtureWorkspace(evaluate);
    await resizeDesktopWindow(evaluate, 1800, 1000);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('.project-resource-dock .neko-resource-browser__facets [role="tab"]');
    await click('.project-resource-dock .neko-resource-browser__facets [role="tab"]', 0);
    await waitForResourceBrowserIdle(evaluate);

    await openTextDocument(evaluate, 'media.md');
    await waitForMarkdownMedia(evaluate);
    const mediaRich = await inspectMarkdownMedia(evaluate);
    assertMarkdownMediaProjection(mediaRich, 'light Rich');
    if (mediaRich.presentationMode !== 'rich' || mediaRich.theme !== 'light') {
      throw new Error(`Markdown media did not open in light Rich: ${JSON.stringify(mediaRich)}`);
    }
    const mediaUris = [...mediaRich.images, ...mediaRich.audio, ...mediaRich.video].map(
      (media) => media.src,
    );
    const mediaRichScreenshot = await screenshot('markdown-media-rich-light');
    checkpoint('markdown-media-rich-light', mediaRich);

    await selectTextEditorMode(evaluate, 'split');
    await waitForMarkdownMedia(evaluate);
    const mediaSplit = await inspectMarkdownMedia(evaluate);
    assertMarkdownMediaProjection(mediaSplit, 'light Split');
    if (!mediaSplit.splitHorizontal || mediaSplit.source.trimEnd() !== MARKDOWN_MEDIA.trimEnd()) {
      throw new Error(
        `Markdown media did not preserve Source-left/Rich-right Split: ${JSON.stringify(mediaSplit)}`,
      );
    }
    const mediaSplitScreenshot = await screenshot('markdown-media-split-light');
    checkpoint('markdown-media-split-light', mediaSplit);

    await click(
      '.neko-markdown-media[data-media-state="unavailable"] .neko-markdown-media__reveal',
    );
    await waitForCondition(
      evaluate,
      `document.activeElement?.classList.contains('cm-content') === true`,
      'Missing-media Source reveal did not focus the visible Source editor.',
    );

    const bytesAfterPresentation = await readFile(join(prepared.workspacePath, 'media.md'), 'utf8');
    if (bytesAfterPresentation !== MARKDOWN_MEDIA) {
      throw new Error(
        `Markdown media presentation changed authoritative bytes: ${JSON.stringify(
          bytesAfterPresentation,
        )}`,
      );
    }

    await openTextDocument(evaluate, 'input.md');
    await selectTextEditorMode(evaluate, 'source');
    const releasedStatuses = await evaluate(`Promise.all(${JSON.stringify(mediaUris)}.map(
      async (uri) => {
        try {
          const response = await fetch(uri);
          return response.status;
        } catch {
          return 'rejected';
        }
      },
    ))`);
    if (releasedStatuses.some((status) => status === 200 || status === 206)) {
      throw new Error(
        `Document switch retained a Markdown media lease: ${JSON.stringify(releasedStatuses)}`,
      );
    }
    checkpoint('markdown-media-document-switch-release', { releasedStatuses });

    await type('.cm-content', MARKDOWN_COMPLETION_PREFIX);
    await waitForEditorSource(evaluate, MARKDOWN_COMPLETION_PREFIX);
    await pressKey('End');
    await pressKey('i', ['Alt']);
    await waitForSelector('.cm-tooltip-autocomplete');
    const completionMenu = await readMarkdownCompletionMenu(evaluate);
    const boardOptionIndex = completionMenu.options.findIndex((option) =>
      option.includes('board.png'),
    );
    if (boardOptionIndex < 0) {
      throw new Error(
        `Markdown Workspace completion did not expose board.png: ${JSON.stringify(completionMenu)}`,
      );
    }
    const completionScreenshot = await screenshot('markdown-workspace-completion-keyboard');
    await selectCompletionOption(pressKey, completionMenu.selectedIndex, boardOptionIndex);
    await pressKey('Enter');
    await waitForCondition(
      evaluate,
      `document.querySelector('.neko-text-editor-codemirror .cm-content')?.textContent?.includes('![[board.png]]') === true`,
      'Keyboard completion did not insert the portable Workspace media target.',
    );
    const completionSource = await readEditorSource(evaluate);
    checkpoint('markdown-workspace-completion-keyboard', { completionMenu, completionSource });

    await type('.cm-content', '中文输入');
    await composeText('.cm-content', '法组合');
    await waitForEditorSource(evaluate, '中文输入法组合');
    checkpoint('markdown-cjk-ime-source', { source: '中文输入法组合' });

    const projectGroupId = await readActiveProjectGroupId(evaluate);
    await setDesktopThemeFromSettings(evaluate, 'dark');
    await returnToProject(evaluate, projectGroupId);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await ensureResourceDockVisible(evaluate);
    await openTextDocument(evaluate, 'media.md');
    await selectTextEditorMode(evaluate, 'split');
    await resizeDesktopWindow(evaluate, 960, 640);
    await waitForMarkdownMedia(evaluate);
    const mediaDark = await inspectMarkdownMedia(evaluate);
    assertMarkdownMediaProjection(mediaDark, 'dark compact Split');
    if (mediaDark.theme !== 'dark' || !mediaDark.splitHorizontal) {
      throw new Error(`Dark compact Markdown media is incomplete: ${JSON.stringify(mediaDark)}`);
    }
    const mediaDarkScreenshot = await screenshot('markdown-media-split-dark-compact');
    checkpoint('markdown-media-split-dark-compact', mediaDark);

    return {
      mediaRich,
      mediaSplit,
      mediaDark,
      completionSource,
      releasedStatuses,
      screenshots: [
        mediaRichScreenshot,
        mediaSplitScreenshot,
        completionScreenshot,
        mediaDarkScreenshot,
      ],
    };
  },
  assertObservation(observed) {
    if (
      observed.openNekoResourceRequestCount < 8 ||
      (observed.responseMimeTypeCounts['image/png'] ?? 0) < 4 ||
      (observed.responseMimeTypeCounts['audio/wav'] ?? 0) < 2 ||
      (observed.responseMimeTypeCounts['video/webm'] ?? 0) < 2 ||
      observed.poisonedRequestCount !== 0 ||
      observed.consoleErrors.length > 0 ||
      observed.exceptions.length > 0
    ) {
      throw new Error(
        `Markdown media transport observation is incomplete: ${JSON.stringify(observed)}`,
      );
    }
  },
});

async function openTextDocument(evaluate, label) {
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
    `document.querySelector('.neko-text-editor-root[data-document-mode="markdown"]') !== null &&
      document.querySelector(
        '.project-main-group__tabs .neko-workbench-editor-tab[data-active="true"] .neko-workbench-editor-tab__label'
      )?.textContent?.trim() === ${JSON.stringify(label)}`,
    `Text Editor did not open '${label}'.`,
  );
}

async function selectTextEditorMode(evaluate, mode) {
  await evaluate(`(() => {
    const labels = {
      rich: ['Rich', '所见即所得'],
      source: ['Source', '源码'],
      split: ['Split', '分栏'],
    }[${JSON.stringify(mode)}];
    const button = [...document.querySelectorAll('.neko-text-editor-segmented button')]
      .find((candidate) => labels.includes(candidate.getAttribute('aria-label') ?? ''));
    if (!(button instanceof HTMLButtonElement)) throw new Error('Text Editor mode is unavailable.');
    button.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.querySelector('.neko-text-editor-body')?.getAttribute('data-presentation-mode') === ${JSON.stringify(mode)}`,
    `Text Editor did not enter '${mode}' mode.`,
  );
}

async function waitForMarkdownMedia(evaluate) {
  await waitForCondition(
    evaluate,
    `document.querySelectorAll('.neko-markdown-media img').length === 2 &&
      [...document.querySelectorAll('.neko-markdown-media img')].every((image) => image.complete && image.naturalWidth > 0) &&
      document.querySelector('.neko-markdown-media audio')?.readyState >= 1 &&
      document.querySelector('.neko-markdown-media video')?.readyState >= 1 &&
      document.querySelector('.neko-markdown-media[data-media-state="unavailable"]') !== null`,
    'Markdown media did not settle.',
  );
}

async function inspectMarkdownMedia(evaluate) {
  return evaluate(`(() => {
    const root = document.querySelector('.neko-text-editor-root');
    const rich = root?.querySelector('.neko-text-editor-rich');
    const source = root?.querySelector('.neko-text-editor-codemirror');
    if (!(root instanceof HTMLElement) || !(rich instanceof HTMLElement)) {
      throw new Error('Markdown Rich surface is unavailable.');
    }
    const describeMedia = (element) => {
      const rect = element.getBoundingClientRect();
      const parentRect = element.parentElement?.getBoundingClientRect();
      return {
        src: element.getAttribute('src') ?? '',
        rectWidth: rect.width,
        rectHeight: rect.height,
        parentWidth: parentRect?.width ?? 0,
      };
    };
    const sourceRect = source?.getBoundingClientRect();
    const richRect = rich.getBoundingClientRect();
    const contextActions = document.querySelector('.neko-text-editor-context-actions');
    return {
      theme: document.documentElement.dataset.nekoTheme,
      presentationMode: root.querySelector('.neko-text-editor-body')?.getAttribute('data-presentation-mode'),
      richState: rich.getAttribute('data-rich-state'),
      richReadOnly: rich.querySelector('.ProseMirror')?.getAttribute('aria-readonly') ?? null,
      source: [...(source?.querySelectorAll('.cm-content .cm-line') ?? [])]
        .map((line) => line.textContent ?? '')
        .join('\\n'),
      splitHorizontal:
        sourceRect !== undefined &&
        Math.abs(sourceRect.top - richRect.top) <= 1 &&
        sourceRect.right <= richRect.left + 1,
      images: [...rich.querySelectorAll('.neko-markdown-media img')].map((image) => ({
        ...describeMedia(image),
        alt: image.alt,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      })),
      audio: [...rich.querySelectorAll('.neko-markdown-media audio')].map((audio) => ({
        ...describeMedia(audio),
        controls: audio.controls,
        autoplay: audio.autoplay,
        paused: audio.paused,
        preload: audio.preload,
        readyState: audio.readyState,
      })),
      video: [...rich.querySelectorAll('.neko-markdown-media video')].map((video) => ({
        ...describeMedia(video),
        controls: video.controls,
        autoplay: video.autoplay,
        paused: video.paused,
        preload: video.preload,
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      })),
      diagnosticText: [...rich.querySelectorAll('.neko-markdown-media[data-media-state="unavailable"]')]
        .map((item) => item.textContent?.trim() ?? '')
        .join('\\n'),
      revealActionCount: rich.querySelectorAll('.neko-markdown-media__reveal').length,
      rawSourceCount: rich.querySelectorAll(
        'img[src="board.png"], audio[src="tone.wav"], video[src="shot.webm"]',
      ).length,
      fitsSurface:
        root.scrollWidth <= root.clientWidth + 1 &&
        rich.scrollWidth <= rich.clientWidth + 1 &&
        (contextActions?.scrollWidth ?? 0) <= (contextActions?.clientWidth ?? 0) + 1,
      contextActionsInTabRow:
        contextActions?.closest('.project-main-group__tabs') !== null &&
        root.querySelector('.neko-text-editor-toolbar') === null,
    };
  })()`);
}

function assertMarkdownMediaProjection(media, label) {
  const authorizedUrl = (value) =>
    /^(?:openneko:\/\/resource\/|http:\/\/127\.0\.0\.1:\d+\/resources\/)/u.test(value);
  if (
    media.images.length !== 2 ||
    !media.images.some((image) => image.alt === '彩条分镜') ||
    media.images.some(
      (image) =>
        !authorizedUrl(image.src) ||
        image.naturalWidth <= 0 ||
        image.naturalHeight <= 0 ||
        image.rectWidth > image.parentWidth + 1,
    ) ||
    media.audio.length !== 1 ||
    media.audio.some(
      (audio) =>
        !authorizedUrl(audio.src) ||
        !audio.controls ||
        audio.autoplay ||
        !audio.paused ||
        audio.preload !== 'metadata' ||
        audio.readyState < 1,
    ) ||
    media.video.length !== 1 ||
    media.video.some(
      (video) =>
        !authorizedUrl(video.src) ||
        !video.controls ||
        video.autoplay ||
        !video.paused ||
        video.preload !== 'metadata' ||
        video.readyState < 1 ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0 ||
        video.rectWidth > video.parentWidth + 1,
    ) ||
    !/missing|找不到/iu.test(media.diagnosticText) ||
    media.revealActionCount !== 5 ||
    media.rawSourceCount !== 0 ||
    !media.fitsSurface ||
    !media.contextActionsInTabRow ||
    (media.presentationMode === 'rich'
      ? media.richState !== 'unavailable'
      : media.richState !== 'ready') ||
    media.richReadOnly !== 'true'
  ) {
    throw new Error(
      `Markdown media ${label} did not satisfy authorized presentation: ${JSON.stringify(media)}`,
    );
  }
}

async function readMarkdownCompletionMenu(evaluate) {
  return evaluate(`(() => {
    const options = [...document.querySelectorAll('.cm-tooltip-autocomplete [role="option"]')];
    return {
      options: options.map((option) => option.textContent?.trim() ?? ''),
      selectedIndex: Math.max(
        0,
        options.findIndex((option) => option.getAttribute('aria-selected') === 'true'),
      ),
    };
  })()`);
}

async function selectCompletionOption(pressKey, selectedIndex, targetIndex) {
  for (let index = selectedIndex; index < targetIndex; index += 1) await pressKey('ArrowDown');
  for (let index = selectedIndex; index > targetIndex; index -= 1) await pressKey('ArrowUp');
}

async function waitForEditorSource(evaluate, source) {
  await waitForCondition(
    evaluate,
    `(() => [...document.querySelectorAll('.neko-text-editor-codemirror .cm-content .cm-line')]
      .map((line) => line.textContent ?? '')
      .join('\\n'))() === ${JSON.stringify(source)}`,
    `Text Editor did not accept source ${JSON.stringify(source)}.`,
  );
}

async function readEditorSource(evaluate) {
  return evaluate(`(() => [...document.querySelectorAll(
    '.neko-text-editor-codemirror .cm-content .cm-line'
  )].map((line) => line.textContent ?? '').join('\\n'))()`);
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
      return tabs.length === 4 && tabs.every((tab) => !(tab instanceof HTMLButtonElement) || !tab.disabled);
    })()`,
    'Resource Browser did not finish its interactive facet transition.',
  );
}

async function ensureResourceDockVisible(evaluate) {
  const visible = await evaluate(`(() => {
    const dock = document.querySelector('.project-resource-dock');
    if (!(dock instanceof HTMLElement)) return false;
    const rect = dock.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  })()`);
  if (visible) return;
  await evaluate(`(() => {
    const control = document.querySelector('[data-workbench-region-control="management"]');
    if (!(control instanceof HTMLButtonElement)) throw new Error('Resource control is unavailable.');
    control.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.querySelector('.project-resource-dock')?.getBoundingClientRect().width > 0`,
    'Project Resources did not become visible.',
  );
}

async function readActiveProjectGroupId(evaluate) {
  return evaluate(`(() => {
    const group = document.querySelector(
      '.primary-conversation-group[data-group-kind="project"] .primary-conversation-group__header[data-active="true"]'
    )?.closest('.primary-conversation-group');
    const groupId = group?.getAttribute('data-group-id');
    if (!groupId?.startsWith('project:')) throw new Error('Active Project is unavailable.');
    return groupId;
  })()`);
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
    'Desktop Settings did not open.',
  );
  await evaluate(`(() => {
    const appearance = document.querySelectorAll('.desktop-settings__navigation .home-nav-button')[1];
    if (!(appearance instanceof HTMLButtonElement)) throw new Error('Appearance is unavailable.');
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
    if (!(select instanceof HTMLSelectElement)) throw new Error('Theme setting is unavailable.');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Theme setter is unavailable.');
    setter.call(select, ${JSON.stringify(theme)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.documentElement.dataset.nekoTheme === ${JSON.stringify(theme)}`,
    `Desktop Theme did not switch to ${theme}.`,
  );
}

async function returnToProject(evaluate, groupId) {
  await evaluate(`(() => {
    const group = [...document.querySelectorAll('.primary-conversation-group')]
      .find((candidate) => candidate.getAttribute('data-group-id') === ${JSON.stringify(groupId)});
    const project = group?.querySelector('.primary-conversation-group__project-link');
    if (!(project instanceof HTMLButtonElement)) throw new Error('Project navigation is unavailable.');
    project.click();
    return true;
  })()`);
}

async function resizeDesktopWindow(evaluate, width, height) {
  await evaluate(`window.resizeTo(${String(width)}, ${String(height)})`);
  await waitForCondition(
    evaluate,
    width <= 1000
      ? `document.documentElement.clientWidth <= ${String(width)}`
      : `document.documentElement.clientWidth >= ${String(width - 100)}`,
    `Desktop window did not enter ${String(width)}x${String(height)}.`,
  );
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
