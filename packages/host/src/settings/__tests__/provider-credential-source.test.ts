import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FileProviderCredentialSource } from '../provider-credential-source';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('FileProviderCredentialSource', () => {
  it('reads only the exact provider credential declaration', async () => {
    const filePath = createConfig([
      '[[providers]]',
      'id = "first"',
      'name = "first"',
      'type = "generic"',
      'api_key = "first-secret"',
      '',
      '[[providers]]',
      'id = "second"',
      'name = "second"',
      'type = "generic"',
      'api_key = "second-secret"',
    ]);
    const source = new FileProviderCredentialSource({ filePath });

    await expect(source.read('second')).resolves.toMatchObject({
      status: 'configured',
      apiKey: 'second-secret',
      updatedAt: expect.any(String),
    });
    await expect(source.read('absent')).resolves.toBeUndefined();
  });

  it('returns an owner path for an invalid declaration without exposing its value', async () => {
    const filePath = createConfig([
      '[[providers]]',
      'id = "invalid"',
      'name = "invalid"',
      'type = "generic"',
      'api_key = ""',
    ]);
    const source = new FileProviderCredentialSource({ filePath });

    const result = await source.read('invalid');
    expect(result).toEqual({
      status: 'invalid',
      path: 'providers.invalid.api_key',
    });
    expect(JSON.stringify(result)).not.toContain('apiKey');
  });
});

function createConfig(lines: readonly string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-provider-credential-'));
  tempRoots.push(root);
  const filePath = path.join(root, 'config.toml');
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return filePath;
}
