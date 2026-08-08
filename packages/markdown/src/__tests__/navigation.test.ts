import { describe, expect, it } from 'vitest';
import { projectMarkdownNavigation } from '../index';

describe('Markdown navigation projection', () => {
  it('projects source-backed headings and inline/reference links', () => {
    const projection = projectMarkdownNavigation(
      '# 标题\n\n## 场景\n\n[说明][ref] 与 [主页](https://openneko.example)\n\n[ref]: notes.md',
    );
    expect(projection.outline.map(({ depth, label }) => ({ depth, label }))).toEqual([
      { depth: 1, label: '标题' },
      { depth: 2, label: '场景' },
    ]);
    expect(
      projection.references.map(({ kind, label, destination }) => ({ kind, label, destination })),
    ).toEqual([
      { kind: 'link', label: '说明', destination: 'notes.md' },
      { kind: 'link', label: '主页', destination: 'https://openneko.example' },
    ]);
    expect(
      projection.outline.every((entry) => entry.range.endOffset > entry.range.startOffset),
    ).toBe(true);
  });

  it('fails only the navigation projection for unsupported parser extensions', () => {
    expect(projectMarkdownNavigation('正文[^1]\n\n[^1]: 注释')).toMatchObject({
      outline: [],
      references: [],
      diagnostics: [expect.objectContaining({ code: 'MD_NAVIGATION_PROJECTION_FAILED' })],
    });
  });
});
