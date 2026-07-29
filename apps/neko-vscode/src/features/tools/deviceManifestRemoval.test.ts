import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('neko-tools device manifest removal', () => {
  it('does not contribute the removed Device view or commands', () => {
    const manifest = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8');

    expect(manifest).not.toContain('neko.devices');
    expect(manifest).not.toContain('neko-devices');
    expect(manifest).not.toContain('Neko Devices');
  });
});

describe('neko-tools retired timeline surface', () => {
  it('does not contribute NKV, JVI, Timeline Diff, or removed settings', () => {
    const manifestText = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8');
    const manifest = JSON.parse(manifestText) as {
      readonly contributes?: {
        readonly languages?: readonly { readonly id?: string; readonly extensions?: string[] }[];
        readonly customEditors?: readonly {
          readonly viewType?: string;
          readonly selector?: unknown;
        }[];
        readonly commands?: readonly { readonly command?: string }[];
        readonly configuration?: unknown;
      };
    };

    expect(manifest.contributes?.languages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ extensions: expect.arrayContaining(['.nkv']) }),
      ]),
    );
    expect(manifestText).not.toMatch(/\bJVI\b|mediaLsp|timelineDiff|Timeline Diff/u);
    expect(manifestText).not.toContain('neko.tools.diffMode');
    expect(manifestText).not.toContain('neko.tools.showMetadata');
  });

  it('does not bootstrap a language server or workspace timeline index', () => {
    const bootstrap = readFileSync(
      new URL('./bootstrap/bootstrapExtension.ts', import.meta.url),
      'utf8',
    );

    expect(bootstrap).not.toMatch(/mediaLsp|Jvi|WorkspaceIndex|TimelineDiff/u);
  });
});
