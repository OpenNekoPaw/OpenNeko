import { describe, expect, it } from 'vitest';
import type { PromptPresetConfig } from '@neko/shared';
import {
  DEFAULT_AGENTS_FILE_CONTENT,
  buildAgentsFileLoadPlan,
  buildAgentsFilePlan,
  buildPromptConfigFilePlan,
  buildPromptFileContent,
  ensurePromptFileExtension,
  extractPromptNameFromContent,
  generatePromptFileId,
  generatePromptFileName,
  projectPromptFileInfo,
  promptFileInfoToConfig,
  shouldScanPromptFile,
  syncPromptFilesWithConfig,
  type PromptFileInfo,
} from '../prompt-file-projector';

describe('prompt-file-projector', () => {
  it('builds prompt and AGENTS file content', () => {
    expect(buildPromptFileContent('Storyboard')).toBe(`# Storyboard

<!-- 在此编写您的提示词内容 -->
<!-- Write your prompt content here -->

`);
    expect(DEFAULT_AGENTS_FILE_CONTENT).toContain('# Global Agent Instructions');
  });

  it('normalizes prompt filenames and ids', () => {
    expect(ensurePromptFileExtension('storyboard')).toBe('storyboard.md');
    expect(ensurePromptFileExtension('storyboard.md')).toBe('storyboard.md');
    expect(generatePromptFileName('分镜 Prompt!')).toBe('分镜-prompt.md');
    expect(generatePromptFileId('project', '/repo/.neko/prompts/story.md')).toBe(
      'project-prompt-story',
    );
  });

  it('builds AGENTS.md file plans for personal and project sources', () => {
    expect(buildAgentsFilePlan({ source: 'personal', homeDir: '/home/me' })).toEqual({
      ok: true,
      dirPath: '/home/me/.neko',
      filePath: '/home/me/.neko/AGENTS.md',
      template: DEFAULT_AGENTS_FILE_CONTENT,
    });

    expect(
      buildAgentsFilePlan({
        source: 'project',
        homeDir: '/home/me',
        workspaceRoot: '/repo',
      }),
    ).toEqual({
      ok: true,
      dirPath: '/repo/.neko',
      filePath: '/repo/.neko/AGENTS.md',
      template: DEFAULT_AGENTS_FILE_CONTENT,
    });

    expect(buildAgentsFilePlan({ source: 'project', homeDir: '/home/me' })).toEqual({
      ok: false,
      error: 'No workspace folder open for project AGENTS.md',
    });
  });

  it('builds AGENTS.md load candidates in override order', () => {
    expect(buildAgentsFileLoadPlan({ homeDir: '/home/me', workspaceRoot: '/repo' })).toEqual([
      { source: 'project', filePath: '/repo/.neko/AGENTS.md' },
      { source: 'personal', filePath: '/home/me/.neko/AGENTS.md' },
    ]);

    expect(buildAgentsFileLoadPlan({ homeDir: '/home/me' })).toEqual([
      { source: 'personal', filePath: '/home/me/.neko/AGENTS.md' },
    ]);
  });

  it('builds prompt config file plans from content layout', () => {
    expect(buildPromptConfigFilePlan({ source: 'personal', homeDir: '/home/me' })).toEqual({
      ok: true,
      dirPath: '/home/me/.neko/prompts',
      filePath: '/home/me/.neko/prompts/new-prompt.md',
      template: buildPromptFileContent('New Prompt'),
    });

    expect(
      buildPromptConfigFilePlan({
        source: 'project',
        homeDir: '/home/me',
        workspaceRoot: '/repo',
        promptId: '分镜 Prompt!',
      }),
    ).toEqual({
      ok: true,
      dirPath: '/repo/.neko/prompts',
      filePath: '/repo/.neko/prompts/分镜-prompt.md',
      template: buildPromptFileContent('分镜 Prompt!'),
    });

    expect(buildPromptConfigFilePlan({ source: 'project', homeDir: '/home/me' })).toEqual({
      ok: false,
      error: 'No workspace folder open for project prompts',
    });
  });

  it('extracts the first markdown heading as prompt name', () => {
    expect(extractPromptNameFromContent('intro\n# Main Prompt\nbody')).toBe('Main Prompt');
    expect(extractPromptNameFromContent('no heading')).toBeNull();
  });

  it('projects prompt file scan entries from content and filename', () => {
    expect(shouldScanPromptFile('story.md')).toBe(true);
    expect(shouldScanPromptFile('story.txt')).toBe(false);

    expect(
      projectPromptFileInfo({
        source: 'project',
        fileName: 'story.md',
        filePath: '/repo/.neko/prompts/story.md',
        content: 'intro\n# Story Prompt\nbody',
      }),
    ).toEqual({
      id: 'project-prompt-story',
      name: 'Story Prompt',
      filePath: '/repo/.neko/prompts/story.md',
      source: 'project',
      content: 'intro\n# Story Prompt\nbody',
    });

    expect(
      projectPromptFileInfo({
        source: 'personal',
        fileName: 'fallback.md',
        filePath: '/home/.neko/prompts/fallback.md',
        content: 'no heading',
      }).name,
    ).toBe('fallback');
  });

  it('projects prompt files to config records', () => {
    expect(promptFileInfoToConfig(createFile('project', 'story.md'))).toEqual({
      id: 'project-prompt-story',
      name: 'story',
      type: 'custom',
      description: '',
      systemPrompt: '# story',
      source: 'project',
      filePath: '/repo/story.md',
      builtin: false,
      enabled: true,
    });
  });

  it('syncs scanned prompt files without duplicating ids, paths, or source filenames', () => {
    const existing: PromptPresetConfig[] = [
      {
        id: 'personal-prompt-old',
        name: 'old',
        type: 'custom',
        description: '',
        systemPrompt: '',
        source: 'personal',
        filePath: '/home/.neko/prompts/old.md',
        builtin: false,
        enabled: true,
      },
      {
        id: 'project-prompt-same-name',
        name: 'same-name',
        type: 'custom',
        description: '',
        systemPrompt: '',
        source: 'project',
        filePath: '/repo/.neko/prompts/same-name.md',
        builtin: false,
        enabled: true,
      },
    ];

    const synced = syncPromptFilesWithConfig(
      {
        personal: [createFile('personal', 'old.md'), createFile('personal', 'new.md')],
        project: [createFile('project', 'same-name.md'), createFile('project', 'fresh.md')],
      },
      existing,
    );

    expect(synced.map((prompt) => prompt.id)).toEqual([
      'personal-prompt-new',
      'project-prompt-fresh',
    ]);
  });
});

function createFile(source: 'personal' | 'project', fileName: string): PromptFileInfo {
  const baseName = fileName.replace(/\.md$/, '');
  const filePath = source === 'project' ? `/repo/${fileName}` : `/home/.neko/prompts/${fileName}`;
  return {
    id: generatePromptFileId(source, fileName),
    name: baseName,
    filePath,
    source,
    content: `# ${baseName}`,
  };
}
