import { describe, expect, it } from 'vitest';
import { createImportedMarkdownNodeData, createTableMarkdownNodeData } from './useNodeHelpers';

describe('createImportedMarkdownNodeData', () => {
  it('creates an editable Markdown snapshot with portable provenance', () => {
    expect(
      createImportedMarkdownNodeData({
        kind: 'text',
        path: 'assets/notes.md',
        name: 'notes.md',
        title: 'notes',
        content: '# Notes',
        format: 'markdown',
      }),
    ).toEqual({
      content: '# Notes',
      title: 'notes',
      provenance: {
        importMode: 'snapshot',
        sourcePath: 'assets/notes.md',
        sourceName: 'notes.md',
      },
    });
  });

  it('keeps Fountain literal instead of creating Script metadata', () => {
    const data = createImportedMarkdownNodeData({
      kind: 'text',
      path: 'assets/pilot.fountain',
      name: 'pilot.fountain',
      title: 'pilot',
      content: 'INT. ROOM - DAY',
      format: 'plain',
    });

    expect(data).toMatchObject({ content: 'INT. ROOM - DAY', title: 'pilot' });
    expect(data).not.toHaveProperty('format');
    expect(data).not.toHaveProperty('scriptPath');
    expect(data).not.toHaveProperty('docPath');
  });
});

describe('createTableMarkdownNodeData', () => {
  it('creates an editable GFM table without restoring the legacy table node type', () => {
    expect(createTableMarkdownNodeData()).toEqual({
      title: 'Table',
      content: '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |',
    });
  });
});
