import { describe, expect, it } from 'vitest';
import {
  findInlineSvgControlViolations,
  findPackageSpecificTokenViolations,
  findSharedComponentsImportViolations,
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

  it('allows only documented legacy @neko/shared/components imports', () => {
    const sources = new Map([
      ['allowed.tsx', "import { ResizeHandle, useResizable } from '@neko/shared/components';"],
      ['unlisted-name.tsx', "import { ResizeHandle, ContextMenu } from '@neko/shared/components';"],
      ['unlisted-file.tsx', "import type { MenuItem } from '@neko/shared/components';"],
      ['default.tsx', "import LegacySharedComponents from '@neko/shared/components';"],
      ['side-effect.tsx', "import '@neko/shared/components';"],
      ['comment-only.tsx', "// import { MacButton } from '@neko/shared/components';"],
    ]);

    expect(
      findSharedComponentsImportViolations(sources, [
        {
          filePath: 'allowed.tsx',
          importNames: ['ResizeHandle', 'useResizable'],
        },
        {
          filePath: 'unlisted-name.tsx',
          importNames: ['ResizeHandle'],
        },
      ]),
    ).toEqual([
      {
        filePath: 'unlisted-name.tsx',
        reason: 'unlisted @neko/shared/components import ContextMenu',
      },
      {
        filePath: 'unlisted-file.tsx',
        reason: 'legacy @neko/shared/components import is not exempted',
      },
      {
        filePath: 'default.tsx',
        reason: 'legacy @neko/shared/components import is not exempted',
      },
      {
        filePath: 'side-effect.tsx',
        reason: 'legacy @neko/shared/components import is not exempted',
      },
    ]);
  });
});
