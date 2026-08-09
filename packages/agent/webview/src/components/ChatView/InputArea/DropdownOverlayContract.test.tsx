import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ChatModelOption } from '@neko/ai-contracts';
import { ModeSelector } from './ModeSelector';
import { ModelSelector } from './ModelSelector';

const translations: Record<string, string> = {
  'chat.autoMode': 'Auto',
  'chat.selectModel': 'Select model',
  'chat.categoryChat': 'Chat',
  'chat.modelSource.custom': 'Custom',
  'chat.modelConnection.direct': 'Direct',
  'chat.modelConnection.gateway': 'Gateway',
  'chat.modelCategory.llm': 'Chat',
  'chat.modelCapability.vision': 'vision',
  'chat.modelCapability.tools': 'tools',
  'chat.modelCapability.streaming': 'streaming',
  'chat.modelCapability.json': 'JSON',
  'chat.modelCapability.code': 'code',
  'chat.executionMode.title': 'Execution mode',
  'chat.executionMode.plan': 'Plan',
  'chat.executionMode.planDesc': 'Analyze and plan without side-effect tools',
  'chat.executionMode.ask': 'Ask',
  'chat.executionMode.askDesc': 'Continue reads; confirm changes and external actions',
  'chat.executionMode.auto': 'Auto',
  'chat.executionMode.autoDesc': 'Automatically run only allowed safe actions',
  'chat.sessionMode.sections.agent': 'Direct Agent Collaboration',
  'chat.sessionMode.sections.media': 'Media Generation',
  'chat.sessionMode.agent': 'Creative Collaboration',
  'chat.sessionMode.agentDesc':
    'Refine story themes, character settings, worlds, scene atmosphere, and creative direction',
  'chat.sessionMode.short.agent': 'Agent',
  'chat.sessionMode.summary.agent': 'Refine story themes, characters, worlds, and scene mood',
  'chat.sessionMode.image': 'Image Generation',
  'chat.sessionMode.imageDesc': 'Create character images and scene references',
  'chat.sessionMode.short.image': 'Image',
  'chat.sessionMode.summary.image': 'Create character images and scene references',
  'chat.sessionMode.video': 'Video Generation',
  'chat.sessionMode.videoDesc': 'Create video material and motion previews',
  'chat.sessionMode.short.video': 'Video',
  'chat.sessionMode.summary.video': 'Create video material and motion previews',
  'chat.sessionMode.audio': 'Sound Generation',
  'chat.sessionMode.audioDesc': 'Create voice, sound effects, and ambience',
  'chat.sessionMode.short.audio': 'Audio',
  'chat.sessionMode.summary.audio': 'Create voice, sound effects, and ambience',
  'chat.sessionMode.badge.agent': 'Chat',
  'chat.sessionMode.badge.image': 'Image',
  'chat.sessionMode.badge.video': 'Video',
  'chat.sessionMode.badge.audio': 'Sound',
};

const models: ChatModelOption[] = [
  {
    id: 'deepseek-chat:deepseek-flash',
    label: 'DeepSeek Chat / DeepSeek V4 Flash',
    providerLabel: 'DeepSeek Chat',
    source: 'explicit-config',
    connectionKind: 'direct',
    supportLevel: 'verified',
    providerId: 'deepseek-chat',
    modelId: 'deepseek-flash',
    category: 'llm',
    capabilities: ['chat', 'function_calling', 'json_mode', 'streaming', 'code'],
  },
  {
    id: 'deepseek-chat:deepseek-pro',
    label: 'DeepSeek Chat / DeepSeek V4 Pro',
    providerLabel: 'DeepSeek Chat',
    source: 'explicit-config',
    connectionKind: 'direct',
    supportLevel: 'verified',
    providerId: 'deepseek-chat',
    modelId: 'deepseek-pro',
    category: 'llm',
    capabilities: ['chat', 'function_calling', 'json_mode', 'streaming', 'code'],
  },
  {
    id: 'neko-api:gpt-5.5',
    label: 'Neko API Chat / GPT 5.5',
    providerLabel: 'Neko API Chat',
    source: 'explicit-config',
    connectionKind: 'gateway',
    supportLevel: 'verified',
    providerId: 'neko-api',
    modelId: 'gpt-5.5',
    category: 'llm',
    capabilities: ['chat', 'vision', 'function_calling', 'streaming'],
  },
  {
    id: 'neko-api:gpt-5.5-high',
    label: 'Neko API Chat / GPT 5.5 High',
    providerLabel: 'Neko API Chat',
    source: 'explicit-config',
    connectionKind: 'gateway',
    supportLevel: 'verified',
    providerId: 'neko-api',
    modelId: 'gpt-5.5-high',
    category: 'llm',
    capabilities: ['chat', 'vision', 'function_calling', 'streaming'],
  },
];

vi.mock('../../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('dropdown overlay presentation contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the chat model menu on the shared model overlay shell', () => {
    render(
      <ModelSelector
        selectedModel="deepseek-chat:deepseek-pro"
        models={models}
        onSelect={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Select model' });
    expect(trigger.querySelector('.rounded-full')).toBeNull();

    fireEvent.click(trigger);

    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('agent-dropdown-menu');
    expect(menu.className).toContain('agent-dropdown-menu-model');
    expect(menu.className).not.toContain('max-h-[');
    expect(menu.className).not.toContain('overflow-y-auto');
    expect(menu.textContent).toContain('DeepSeek Chat');
    const providerTagLists = menu.querySelectorAll('.agent-model-provider-tags');
    expect(providerTagLists).toHaveLength(2);
    expect(providerTagLists[0]?.querySelectorAll('.agent-model-tag')).toHaveLength(2);
    expect(providerTagLists[0]?.textContent).toBe('CustomDirect');
    expect(menu.textContent).toContain('DeepSeek V4 Pro');
    expect(menu.textContent).not.toContain('JSON');
    expect(menu.textContent).not.toContain('code');
    expect(menu.textContent).toContain('Neko API Chat');
    expect(providerTagLists[1]?.textContent).toBe('CustomGateway');
    expect(menu.textContent).toContain('GPT 5.5');
    expect(menu.textContent).toContain('GPT 5.5 High');
    expect(menu.textContent).not.toContain('Openai Chat');
    expect(menu.textContent).not.toContain('Newapi');
    expect(menu.querySelectorAll('.agent-model-provider-group')).toHaveLength(2);
    expect(menu.querySelectorAll('.agent-model-provider-header')).toHaveLength(2);
    expect(menu.querySelectorAll('.agent-model-option-row')).toHaveLength(4);
    const modelTagLists = menu.querySelectorAll('.agent-model-option-tags');
    expect(modelTagLists).toHaveLength(4);
    expect(modelTagLists[0]?.querySelectorAll('.agent-model-tag')).toHaveLength(3);
    expect(modelTagLists[0]?.textContent).toBe('Chattoolsstreaming');
    expect(modelTagLists[2]?.querySelectorAll('.agent-model-tag')).toHaveLength(4);
    expect(modelTagLists[2]?.textContent).toBe('Chatvisiontoolsstreaming');
    expect(menu.querySelector('.agent-dropdown-section-inline')).toBeNull();
  });

  it('uses the shared overlay shell for the execution menu', () => {
    render(<ModeSelector mode="ask" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByRole('menu').className).toContain('agent-dropdown-menu-mode');
  });

  it('aligns the execution mode menu inward near the composer right edge', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('agent-composer-rail')) {
        return createRect({ left: 0, right: 432, top: 0, bottom: 520 });
      }
      return createRect({ left: 342, right: 420, top: 460, bottom: 488 });
    });

    render(
      <div className="agent-composer-rail">
        <ModeSelector mode="auto" onChange={vi.fn()} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Auto' }));

    expect(screen.getByRole('menu').className).toContain('right-0');
  });

  it('explains exactly three execution choices without a full-access mode', () => {
    render(<ModeSelector mode="ask" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    const menu = screen.getByRole('menu', { name: 'Execution mode' });
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
    expect(
      screen.getByRole('menuitemradio', { name: /Analyze and plan without side-effect tools/ }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('menuitemradio', {
          name: /Continue reads; confirm changes and external actions/,
        })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByRole('menuitemradio', {
        name: /Automatically run only allowed safe actions/,
      }),
    ).toBeTruthy();
    expect(menu.textContent).not.toMatch(/full access/i);
  });

  it('keeps entry prompt menus stretched to the composer width', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    const rule = css.match(/\.agent-composer-entry-prompt-menu\s*\{(?<body>[^}]+)\}/)?.groups?.body;

    expect(rule).toBeTruthy();
    expect(rule).toContain('width: auto');
    expect(rule).toContain('max-width: none');
    expect(rule).not.toContain('420px');
  });

  it('keeps mode, model, and parameter triggers on one composer toolbar line', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    const controlsRule = css.match(/\.agent-composer-mode-controls\s*\{(?<body>[^}]+)\}/)?.groups
      ?.body;
    const triggerRule = css.match(/\.agent-control-chip-param\s*\{(?<body>[^}]+)\}/)?.groups?.body;

    expect(controlsRule).toBeTruthy();
    expect(controlsRule).toContain('display: inline-flex');
    expect(controlsRule).toContain('align-items: center');
    expect(triggerRule).toBeTruthy();
    expect(triggerRule).toContain('max-width: 144px');
  });

  it('keeps the Desktop composer centered and elevated above the Main conversation surface', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    const desktopDockRule = css.match(/\[data-presentation='desktop-dock'\]\s*\{(?<body>[^}]+)\}/)
      ?.groups?.body;
    const shellRule = css.match(/\.agent-composer-shell\s*\{(?<body>[^}]+)\}/)?.groups?.body;
    const railRule = css.match(/\.agent-composer-rail\s*\{(?<body>[^}]+)\}/)?.groups?.body;
    const transcriptRailRule = css.match(/\.agent-transcript-rail\s*\{(?<body>[^}]+)\}/)?.groups
      ?.body;
    const narrowRule = css.match(/@media \(max-width: 520px\)\s*\{(?<body>[\s\S]+?)\n\}/)?.groups
      ?.body;

    expect(desktopDockRule).toMatch(
      /--agent-bg:\s*var\(\s*--neko-sideBar-background,\s*var\(--neko-desktop-main/u,
    );
    expect(desktopDockRule).toContain('--agent-composer-rail-bg: var(--agent-bg)');
    expect(desktopDockRule).toContain('--agent-composer-rail-border: transparent');
    expect(shellRule).toContain('max-width: 820px');
    expect(shellRule).toContain('margin-inline: auto');
    expect(transcriptRailRule).toContain('width: calc(100% - 24px)');
    expect(transcriptRailRule).toContain('max-width: 960px');
    expect(transcriptRailRule).toContain('margin-inline: auto');
    expect(railRule).toContain('padding:');
    expect(narrowRule).toContain('.agent-composer-toolbar');
    expect(narrowRule).toContain('flex-wrap: wrap');
  });

  it('keeps preset and generation parameter dialogs bounded with field headers', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    const presetRule = css.match(/\.agent-dropdown-menu-preset\s*\{(?<body>[^}]+)\}/)?.groups?.body;
    const paramRule = css.match(/\.agent-model-config-dialog\s*\{(?<body>[^}]+)\}/)?.groups?.body;
    const paramOptionsRule = css.match(/\.agent-generation-params-options\s*\{(?<body>[^}]+)\}/)
      ?.groups?.body;
    const modelRule = css.match(/\.agent-dropdown-menu-model\s*\{(?<body>[^}]+)\}/)?.groups?.body;
    const inlineRule = css.match(/\.agent-dropdown-item-inline-detail\s*\{(?<body>[^}]+)\}/)?.groups
      ?.body;
    const modelRowRule = css.match(/\.agent-model-option-row\s*\{(?<body>[^}]+)\}/)?.groups?.body;
    const providerHeaderRule = css.match(/\.agent-model-provider-header\s*\{(?<body>[^}]+)\}/)
      ?.groups?.body;
    const tagListRule = css.match(/\.agent-model-tag-list\s*\{(?<body>[^}]+)\}/)?.groups?.body;
    const tagRule = Array.from(css.matchAll(/\.agent-model-tag\s*\{(?<body>[^}]+)\}/g))
      .map((match) => match.groups?.body ?? '')
      .find((body) => body.includes('border-radius'));
    const headerRule = css.match(/\.agent-dropdown-header\s*\{(?<body>[^}]+)\}/)?.groups?.body;

    expect(presetRule).toBeTruthy();
    expect(presetRule).toContain('width: max-content');
    expect(presetRule).toContain('min-width: var(--agent-overlay-compact-min-inline-size)');
    expect(presetRule).toContain('max-width: var(--agent-overlay-compact-max-inline-size)');
    expect(paramRule).toBeTruthy();
    expect(paramRule).toContain('width: min(420px, calc(100vw - 24px))');
    expect(paramRule).toContain('max-width: calc(100vw - 24px)');
    expect(paramOptionsRule).toBeTruthy();
    expect(paramOptionsRule).toContain('flex-wrap: wrap');
    expect(modelRule).toBeTruthy();
    expect(modelRule).toContain('width: var(--agent-overlay-wide-inline-size)');
    expect(modelRule).toContain('max-width: var(--agent-overlay-wide-max-inline-size)');
    expect(inlineRule).toBeTruthy();
    expect(inlineRule).toContain('min-height: 28px');
    expect(modelRowRule).toBeTruthy();
    expect(modelRowRule).toContain('display: flex');
    expect(modelRowRule).toContain('padding: 3px 7px 3px 22px');
    expect(providerHeaderRule).toBeTruthy();
    expect(providerHeaderRule).toContain('display: flex');
    expect(providerHeaderRule).toContain('font-weight: 500');
    expect(tagListRule).toBeTruthy();
    expect(tagListRule).toContain('display: inline-flex');
    expect(tagListRule).toContain('justify-content: flex-end');
    expect(tagRule).toBeTruthy();
    expect(tagRule).toContain('border-radius: 7px');
    expect(tagRule).toContain('font-weight: 600');
    expect(headerRule).toBeTruthy();
    expect(headerRule).toContain('border-bottom');
  });
});

function createRect({
  left,
  right,
  top,
  bottom,
}: {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}): DOMRect {
  return {
    left,
    right,
    top,
    bottom,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}
