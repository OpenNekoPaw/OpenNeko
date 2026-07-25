import { describe, expect, it } from 'vitest';
import { projectCanvasMarkdownHandoffRequest } from '../canvas-markdown-handoff-presenter';

describe('canonical Canvas Markdown handoff presenter', () => {
  it('projects a reviewable Markdown table without specialized Canvas hints', () => {
    const result = projectCanvasMarkdownHandoffRequest({
      markdown: ['| Topic | Notes |', '| --- | --- |', '| Opening | Keep as Markdown |'].join('\n'),
      title: 'Content plan',
      userIntent: 'Add this content to Canvas',
    });

    expect(result).toEqual(
      expect.objectContaining({
        title: 'Content plan',
        sourceFormat: 'gfm-table',
        userIntent: 'Add this content to Canvas',
      }),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('declaredIntentHint');
    expect(serialized).not.toContain('declaredProfileHint');
    expect(serialized).not.toContain('capabilityId');
  });

  it('does not create a handoff for prose or empty Markdown', () => {
    expect(projectCanvasMarkdownHandoffRequest({ markdown: '# Notes\n\nPlain prose.' })).toBeNull();
    expect(projectCanvasMarkdownHandoffRequest({ markdown: '   ' })).toBeNull();
  });

  it('ignores resource inventory tables that contain no reviewable content table', () => {
    const result = projectCanvasMarkdownHandoffRequest({
      markdown: [
        '| Page | Asset | Size | Type |',
        '| --- | --- | --- | --- |',
        '| 1 | P1 | 1024x768 | image/png |',
      ].join('\n'),
    });

    expect(result).toBeNull();
  });
});
