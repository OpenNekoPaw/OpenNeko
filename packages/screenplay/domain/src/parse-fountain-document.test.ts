import { describe, expect, it } from 'vitest';
import { parseFountainDocument } from './parse-fountain-document';

describe('parseFountainDocument', () => {
  it('projects forced Chinese scenes, characters and dialogue from one source', () => {
    const source = [
      'Title: 蓝色信号',
      '',
      '.内景 废弃车站 - 夜 #1#',
      '',
      '@小橘',
      '有人吗？',
      '',
      'CUT TO:',
    ].join('\n');
    const result = parseFountainDocument(source, 'screenplay/main.fountain');

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.document.title).toBe('蓝色信号');
    expect(result.document.scenes[0]).toMatchObject({
      heading: '内景 废弃车站 - 夜',
      sceneNumber: '1',
      characters: ['小橘'],
    });
    expect(result.document.elements.find((element) => element.kind === 'dialogue')).toMatchObject({
      text: '有人吗？',
      dialogueOwner: '小橘',
    });
    expect(result.document.outline[0]?.label).toBe('内景 废弃车站 - 夜');
    expect(result.document.source).toBe(source);
  });

  it('preserves CRLF source positions and repeated text ordering', () => {
    const source = 'INT. ROOM - DAY\r\n\r\nEcho.\r\n\r\nEcho.';
    const result = parseFountainDocument(source, 'repeat.fountain');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const actions = result.document.elements.filter((element) => element.kind === 'action');
    expect(actions).toHaveLength(2);
    expect(actions[0]?.range.start.offset).toBeLessThan(actions[1]?.range.start.offset ?? 0);
  });

  it('fails only an oversized source', () => {
    expect(parseFountainDocument('12345', 'large.fountain', { maxSourceCodeUnits: 4 })).toEqual({
      status: 'failed',
      diagnostics: [
        {
          code: 'fountain-source-too-large',
          severity: 'error',
          parameters: { actual: 5, limit: 4 },
        },
      ],
    });
    expect(parseFountainDocument('INT. ROOM - DAY', 'valid.fountain').status).toBe('ready');
  });

  it('reports unforced CJK screenplay-like lines without rewriting them', () => {
    const source = '内景 客厅 - 夜\n\n小橘\n你好。';
    const result = parseFountainDocument(source, 'ambiguous.fountain');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.document.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'fountain-cjk-scene-heading-unforced',
    );
    expect(result.document.source).toBe(source);
  });
});
