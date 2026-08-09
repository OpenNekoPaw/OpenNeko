import { describe, expect, it } from 'vitest';

import { classifyAgentContentPath } from './content-path-classification';

describe('Agent content path classification', () => {
  it.each([
    ['notes/readme.md', 'text', 'text'],
    ['src/main.ts', 'text', 'text'],
    ['books/story.epub', 'document', 'document'],
    ['pages/page.png', 'image', 'image'],
    ['audio/theme.mp3', 'audio', 'audio'],
    ['video/cut.mp4', 'video', 'video'],
    ['score/theme.musicxml', 'score', undefined],
    ['archives/source.zip', 'archive', undefined],
    ['bin/helper.exe', 'executable', undefined],
    ['boards/workspace.nkc', 'canvas-project', undefined],
    ['cuts/timeline.otio', 'cut-project', undefined],
    ['data/custom.unknown', 'unknown', undefined],
  ] as const)('classifies %s as %s', (path, kind, mediaType) => {
    expect(classifyAgentContentPath(path)).toMatchObject({ kind });
    expect(classifyAgentContentPath(path).mediaType).toBe(mediaType);
  });

  it('declares exact processor requirements for non-readable binary classes', () => {
    expect(classifyAgentContentPath('score.mid').processorRequirement).toBe('score-analysis');
    expect(classifyAgentContentPath('bundle.tar').processorRequirement).toBe('bounded archive');
    expect(classifyAgentContentPath('helper.bin').processorRequirement).toBe(
      'isolated executable/native-binary',
    );
  });

  it('preserves sequence media classification from the shared media detector', () => {
    expect(classifyAgentContentPath('frames/shot.0001.png')).toMatchObject({
      kind: 'image',
      mediaType: 'sequence',
    });
  });
});
