import { describe, expect, it } from 'vitest';
import { createImportedTextNodeData } from './useNodeHelpers';

describe('createImportedTextNodeData', () => {
  it('creates an editable Markdown snapshot with portable provenance', () => {
    expect(
      createImportedTextNodeData({
        kind: 'text',
        path: 'assets/notes.md',
        name: 'notes.md',
        title: 'notes',
        content: '# Notes',
        format: 'markdown',
      }),
    ).toEqual({
      content: '# Notes',
      format: 'markdown',
      title: 'notes',
      provenance: {
        importMode: 'snapshot',
        sourcePath: 'assets/notes.md',
        sourceName: 'notes.md',
      },
    });
  });

  it('keeps Fountain literal instead of creating Script metadata', () => {
    const data = createImportedTextNodeData({
      kind: 'text',
      path: 'assets/pilot.fountain',
      name: 'pilot.fountain',
      title: 'pilot',
      content: 'INT. ROOM - DAY',
      format: 'plain',
    });

    expect(data).toMatchObject({ content: 'INT. ROOM - DAY', format: 'plain', title: 'pilot' });
    expect(data).not.toHaveProperty('scriptPath');
    expect(data).not.toHaveProperty('docPath');
  });
});
