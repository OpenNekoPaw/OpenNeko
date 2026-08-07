import { describe, expect, it } from 'vitest';
import {
  findInlineSvgControlViolations,
  findPackageSpecificTokenViolations,
} from './source-guards';

describe('@neko/ui source guards', () => {
  it('finds inline svg and unicode glyph control icons in touched sources', () => {
    const sources = new Map([
      ['ok.tsx', '<IconButton icon={<PlayIcon />} />'],
      ['bad-svg.tsx', '<button><svg viewBox="0 0 24 24" /></button>'],
      ['bad-glyph.tsx', "const icon = '▶';"],
    ]);

    expect(findInlineSvgControlViolations(sources)).toEqual([
      { filePath: 'bad-svg.tsx', reason: 'inline svg' },
      { filePath: 'bad-glyph.tsx', reason: 'unicode glyph icon' },
    ]);
  });

  it('finds package-specific token prefixes in touched sources', () => {
    const sources = new Map([
      ['ok.css', 'color: var(--neko-fg);'],
      ['bad.css', 'color: var(--sketch-panel-bg); border-color: var(--model-grid);'],
    ]);

    expect(findPackageSpecificTokenViolations(sources)).toEqual([
      { filePath: 'bad.css', reason: 'package token --sketch-' },
      { filePath: 'bad.css', reason: 'package token --model-' },
    ]);
  });
});
