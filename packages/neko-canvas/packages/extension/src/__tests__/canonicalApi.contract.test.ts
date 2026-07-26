import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sharedApiSource = readFileSync(
  join(__dirname, '../../../../../neko-types/src/types/extension-api.ts'),
  'utf-8',
);
const canvasApiSource = readFileSync(join(__dirname, '../api.ts'), 'utf-8');
const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');

describe('canonical Canvas Extension API', () => {
  it('exposes authoring, nodes, references, and generic playback', () => {
    for (const source of [sharedApiSource, canvasApiSource]) {
      expect(source).toContain('readonly authoring');
      expect(source).toContain('createConnection');
      expect(source).toContain('createComposite');
      expect(source).toContain('getPlan');
      expect(source).toContain('revealWorkspace');
    }
  });

  it('removes the old Storyboard and Shot generation API', () => {
    for (const source of [sharedApiSource, canvasApiSource, extensionSource]) {
      expect(source).not.toContain('storyboard: {');
      expect(source).not.toContain('getExecutionSummary');
      expect(source).not.toContain('generateBatch(');
      expect(source).not.toContain('generateImage(');
      expect(source).not.toContain('createStoryboardFromPayload');
    }
  });
});
