import { describe, expect, it } from 'vitest';
import { buildFountainScriptIndex } from './fountain-script-index';

describe('buildFountainScriptIndex', () => {
  it('projects scenes and characters from Fountain without a Story extension', () => {
    const index = buildFountainScriptIndex({
      uri: 'file:///workspace/pilot.fountain',
      content:
        'INT. CAFE - DAY #1#\n\nALICE\nWe should leave.\n\nEXT. STREET - NIGHT\n\nBOB\nWait.',
    });

    expect(index.scenes).toHaveLength(2);
    expect(index.scenes[0]).toMatchObject({
      heading: 'INT. CAFE - DAY #1#',
      intExt: 'INT',
      location: 'CAFE',
      timeOfDay: 'DAY',
      sceneNumber: '1',
      sceneCharacters: ['ALICE'],
    });
    expect(index.characters).toEqual([
      expect.objectContaining({ name: 'ALICE', scene_ids: [index.scenes[0]!.sceneId] }),
      expect.objectContaining({ name: 'BOB', scene_ids: [index.scenes[1]!.sceneId] }),
    ]);
  });
});
