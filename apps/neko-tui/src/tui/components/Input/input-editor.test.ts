import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from 'ink-testing-library';
import { testAgentStore as useAgentStore } from '../../__tests__/test-runtime';
import type { SupportedLocale } from '@neko/shared/i18n';
import { AgentTerminalPresentationProvider } from '../../presentation/react-context';
import { createTestAgentTerminalPresentation } from '../../presentation/testing';
import { InputEditor as InputEditorImpl } from './InputEditor';
import {
  createTuiSkillInvocationCatalog,
  createTuiSlashCommandCatalog,
} from '../../core/slash-command-catalog';

let testLocale: SupportedLocale = 'en';

function InputEditor(props: React.ComponentProps<typeof InputEditorImpl>): React.JSX.Element {
  return React.createElement(AgentTerminalPresentationProvider, {
    value: createTestAgentTerminalPresentation(testLocale),
    children: React.createElement(InputEditorImpl, props),
  });
}

beforeEach(() => {
  testLocale = 'en';
  useAgentStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe('InputEditor prefix suggestions', () => {
  it('remains editable while an agent turn is running', async () => {
    useAgentStore.getState().setRunning();
    const onSubmit = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit,
      }),
    );

    await writeInput(instance, 'queued prompt');
    expect(instance.lastFrame()).toContain('queued prompt');

    await writeInput(instance, '\r');
    expect(onSubmit).toHaveBeenCalledWith('queued prompt');
  });

  it('opens Skill suggestions for a bare dollar trigger when skills are available', async () => {
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
        skills: [
          {
            trigger: '$',
            name: 'media-production',
            description: 'Create video from media',
            kind: 'skill',
          },
        ],
      }),
    );

    await writeInput(instance, '$');

    expect(instance.lastFrame()).toContain('$media-production');
    expect(instance.lastFrame()).toContain('[skill]');
  });

  it('filters slash commands and selects through the slash command path', async () => {
    const onSlashCommand = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
        onSlashCommand,
        commands: [
          { name: 'model', description: 'Select model' },
          { name: 'status', description: 'Show status' },
        ],
        skills: [{ trigger: '$', name: 'model-skill', kind: 'skill' }],
      }),
    );

    await writeInput(instance, '/mo');
    expect(instance.lastFrame()).toContain('/model');
    expect(instance.lastFrame()).not.toContain('$model-skill');

    await writeInput(instance, '\r');
    await writeInput(instance, '\r');
    expect(onSlashCommand).toHaveBeenCalledWith('/model');
  });

  it('renders localized slash command descriptions in Chinese suggestion menus', async () => {
    testLocale = 'zh-cn';
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
        commands: createTuiSlashCommandCatalog(
          undefined,
          createTestAgentTerminalPresentation('zh-cn'),
        ),
      }),
    );

    await writeInput(instance, '/');

    expect(instance.lastFrame()).toContain('/help');
    expect(instance.lastFrame()).toContain('[命令]');
    expect(instance.lastFrame()).toContain('显示可用命令帮助');
    expect(instance.lastFrame()).not.toContain('Show help message with available commands');
  });

  it('filters Skill suggestions and submits selected Skill invocation', async () => {
    const onSkillInvocation = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
        onSkillInvocation,
        commands: [{ name: 'review', description: 'Slash review' }],
        skills: [
          { trigger: '$', name: 'review', description: 'Review Skill', kind: 'skill' },
          { trigger: '$', name: 'storyboard', description: 'Storyboard Skill', kind: 'skill' },
        ],
      }),
    );

    await writeInput(instance, '$re');
    expect(instance.lastFrame()).toContain('$review');
    expect(instance.lastFrame()).not.toContain('/review');

    await writeInput(instance, '\r');
    await writeInput(instance, '\r');
    expect(onSkillInvocation).toHaveBeenCalledWith('$review');
  });

  it('keeps Skill keywords in English while localizing tags and fallback descriptions', async () => {
    testLocale = 'zh-cn';
    const skills = createTuiSkillInvocationCatalog(
      [{ name: 'quality-review', enabled: true }],
      createTestAgentTerminalPresentation('zh-cn'),
    ).map((skill) => ({
      trigger: '$' as const,
      name: skill.name.slice(1),
      description: skill.description,
      kind: 'skill',
    }));
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
        skills,
      }),
    );

    await writeInput(instance, '$');

    expect(instance.lastFrame()).toContain('$quality-review');
    expect(instance.lastFrame()).toContain('[技能]');
    expect(instance.lastFrame()).toContain('激活技能 quality-review');
    expect(instance.lastFrame()).not.toContain('[skill]');
    expect(instance.lastFrame()).not.toContain('Activate skill quality-review');
  });

  it('filters reference suggestions and inserts text-only mentions', async () => {
    const onSubmit = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit,
        references: [
          {
            trigger: '@',
            name: 'docs/story.md',
            insertText: '@docs/story.md ',
            kind: 'file',
          },
          {
            trigger: '@',
            name: 'asset:image:hero',
            insertText: '@asset:image:hero ',
            kind: 'asset',
          },
        ],
      }),
    );

    await writeInput(instance, '@doc');
    expect(instance.lastFrame()).toContain('@docs/story.md');
    expect(instance.lastFrame()).not.toContain('@asset:image:hero');

    await writeInput(instance, '\r');
    await writeInput(instance, 'summarize');
    await writeInput(instance, '\r');
    expect(onSubmit).toHaveBeenCalledWith('@docs/story.md summarize');
  });

  it('renders a selected durable reference compactly while submitting its full token', async () => {
    const onSubmit = vi.fn();
    const durableReference = '@${A}/epub/animation/Blame/[Kmoe][BLAME！(新裝版)]卷01.epub ';
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit,
        references: [
          {
            trigger: '@',
            name: '[Kmoe][BLAME！(新裝版)]卷01.epub',
            insertText: durableReference,
            kind: 'file',
          },
        ],
      }),
    );

    await writeInput(instance, '@BLAME');
    await writeInput(instance, '\r');
    await writeInput(instance, '分析前10页，生成分镜表，发送canvas');

    expect(instance.lastFrame()).toContain('@[Kmoe][BLAME！(新裝版)]卷01.epub');
    expect(instance.lastFrame()).not.toContain('${A}/epub/animation/Blame/');

    await writeInput(instance, '\r');
    expect(onSubmit).toHaveBeenCalledWith(
      '@${A}/epub/animation/Blame/[Kmoe][BLAME！(新裝版)]卷01.epub 分析前10页，生成分镜表，发送canvas',
    );
  });

  it('notifies hosts when the active reference query changes', async () => {
    const onReferenceQueryChange = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
        onReferenceQueryChange,
      }),
    );

    await writeInput(instance, '@cases');

    await waitFor(() => onReferenceQueryChange.mock.calls.some(([query]) => query === 'cases'));
  });

  it('closes the active namespace menu on Escape without submitting', async () => {
    const onSubmit = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit,
        skills: [{ trigger: '$', name: 'review', kind: 'skill' }],
      }),
    );

    await writeInput(instance, '$r');
    expect(instance.lastFrame()).toContain('$review');

    await writeInput(instance, '\u001B');
    expect(instance.lastFrame()).not.toContain('$review');

    await writeInput(instance, '\r');
    expect(onSubmit).toHaveBeenCalledWith('$r');
  });

  it('submits when a terminal sends a raw line-feed character', async () => {
    const onSubmit = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit,
      }),
    );

    await writeInput(instance, 'hello\n');

    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(instance.lastFrame()).not.toContain('hello');
  });

  it('submits when terminal input coalesces text and line-feed into one chunk', async () => {
    const onSubmit = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit,
      }),
    );

    await waitForInkUpdate();
    instance.stdin.write('你好\n');
    await waitForInkUpdate();

    expect(onSubmit).toHaveBeenCalledWith('你好');
    expect(instance.lastFrame()).not.toContain('你好');
  });

  it('handles raw backspace characters without inserting control text', async () => {
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
      }),
    );

    await writeInput(instance, 'abc\u007Fz');

    expect(instance.lastFrame()).toContain('> abz');
    expect(instance.lastFrame()).not.toContain('\u007F');
  });

  it('localizes reference overflow chrome when TUI locale is Chinese', async () => {
    testLocale = 'zh-cn';
    const references = Array.from({ length: 10 }, (_, index) => ({
      trigger: '@' as const,
      name: `asset-${index}.png`,
      insertText: `@asset-${index}.png `,
      kind: 'asset',
    }));
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
        references,
      }),
    );

    await writeInput(instance, '@');

    expect(instance.lastFrame()).toContain('↓ 2 更多');
    expect(instance.lastFrame()).toContain('[素材]');
    expect(instance.lastFrame()).not.toContain('more');
  });
  it('moves a queued message into an empty composer only after its queue mutation succeeds', async () => {
    const apply = vi.fn(() => true);
    const onConflict = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
        draftRequest: {
          id: 'queue-1:1',
          content: 'Edit queued message',
          apply,
          onConflict,
        },
      }),
    );

    await waitFor(() => instance.lastFrame()?.includes('Edit queued message') === true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('keeps a queued message unchanged when the composer already has a draft', async () => {
    const apply = vi.fn(() => true);
    const onConflict = vi.fn();
    const instance = render(React.createElement(InputEditor, { onSubmit: vi.fn() }));
    await writeInput(instance, 'existing draft');

    instance.rerender(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
        draftRequest: {
          id: 'queue-1:1',
          content: 'queued content',
          apply,
          onConflict,
        },
      }),
    );
    await waitFor(() => onConflict.mock.calls.length === 1);

    expect(instance.lastFrame()).toContain('existing draft');
    expect(instance.lastFrame()).not.toContain('queued content');
    expect(apply).not.toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalledWith('existing draft');
  });
});

async function writeInput(instance: ReturnType<typeof render>, value: string): Promise<void> {
  await waitForInkUpdate();
  for (const char of value) {
    instance.stdin.write(char);
    await waitForInkUpdate();
  }
}

function waitForInkUpdate(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await waitForInkUpdate();
  }
  throw new Error('Timed out waiting for assertion.');
}
