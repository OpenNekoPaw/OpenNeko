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
