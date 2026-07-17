import { describe, expect, it } from 'vitest';
import { normalizeScriptScenes } from './scriptScenes';

describe('normalizeScriptScenes', () => {
  it('returns an empty array for null payloads', () => {
    expect(normalizeScriptScenes(null)).toEqual([]);
  });

  it('normalizes malformed scene entries into safe ScriptScene objects', () => {
    expect(
      normalizeScriptScenes([
        {
          id: 'scene-1',
          title: 'INT. OFFICE - DAY',
          lineStart: 12,
          lineEnd: 20,
        },
        {
          title: 42,
          lineStart: 'bad',
        },
        null,
      ]),
    ).toEqual([
      {
        id: 'scene-1',
        title: 'INT. OFFICE - DAY',
        lineStart: 12,
        lineEnd: 20,
      },
      {
        id: 'script-scene-1',
        title: '',
        lineStart: 0,
        lineEnd: 0,
      },
      {
        id: 'script-scene-2',
        title: '',
        lineStart: 0,
        lineEnd: 0,
      },
    ]);
  });
});
