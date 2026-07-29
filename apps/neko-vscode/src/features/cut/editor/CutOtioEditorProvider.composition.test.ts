import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Cut media composition root', () => {
  it('selects only the Node/FFmpeg adapter', async () => {
    const source = await readFile(
      fileURLToPath(new URL('./CutOtioEditorProvider.ts', import.meta.url)),
      'utf8',
    );

    expect(source).toContain('import { NodeFfmpegCutMediaAdapter }');
    expect(source).toContain('new NodeFfmpegCutMediaAdapter(');
    expect(source).not.toContain('NekoEngineCutMediaAdapter');
    expect(source).not.toContain('EngineConnection');
    expect(source).not.toMatch(/fallback|retryWithEngine/iu);
  });
});
