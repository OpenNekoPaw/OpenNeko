import { describe, expect, it, vi } from 'vitest';
import type { ResearchNote } from '@neko/shared';
import {
  saveResearchNoteMarkdown,
  serializeResearchNoteMarkdown,
} from '../capability/research-note-markdown';

function createNote(): ResearchNote {
  return {
    title: 'Visual references',
    markdown: '# Visual references\n\nSelected notes.',
    createdAt: '2026-07-10T00:00:00.000Z',
    source: 'external-research',
    sources: [
      {
        url: 'https://example.com/source',
        providerId: 'mcp:research',
        mode: 'live',
        title: 'Example Source',
        fetchedAt: '2026-07-10T00:00:00.000Z',
      },
    ],
  };
}

describe('ResearchNote Markdown persistence', () => {
  it('serializes source provenance into Markdown', () => {
    const markdown = serializeResearchNoteMarkdown(createNote());

    expect(markdown).toContain('source: external-research');
    expect(markdown).toContain('## Sources');
    expect(markdown).toContain(
      '- [Example Source](https://example.com/source) (provider=mcp:research, mode=live, fetchedAt=2026-07-10T00:00:00.000Z)',
    );
    expect(markdown).not.toContain('canonicalFact');
    expect(markdown).not.toContain('promoted: true');
  });

  it('writes only the explicit user-selected Markdown path', async () => {
    const writeFile = vi.fn(async () => undefined);

    await expect(
      saveResearchNoteMarkdown({
        note: createNote(),
        path: 'research/visual-references.md',
        fs: { writeFile },
      }),
    ).resolves.toEqual({
      path: 'research/visual-references.md',
      bytes: expect.any(Number),
    });
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(
      'research/visual-references.md',
      expect.stringContaining('## Sources'),
    );
  });

  it('rejects non-Markdown paths and .neko project memory writes', async () => {
    const writeFile = vi.fn(async () => undefined);

    await expect(
      saveResearchNoteMarkdown({
        note: createNote(),
        path: 'research/source.txt',
        fs: { writeFile },
      }),
    ).rejects.toThrow('ResearchNote must be saved as a Markdown file.');
    await expect(
      saveResearchNoteMarkdown({ note: createNote(), path: '.neko/memory.md', fs: { writeFile } }),
    ).rejects.toThrow('ResearchNote must not be saved into .neko project memory.');
    expect(writeFile).not.toHaveBeenCalled();
  });
});
