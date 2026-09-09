import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProviderCredentialAuthority } from '../provider-credential-authority';
import { FileUserConfigManager } from '../user-config';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-config-credentials-'));
  roots.push(root);
  const filePath = path.join(root, 'config.toml');
  return {
    filePath,
    manager: new FileUserConfigManager({ filePath }),
    authority: new ProviderCredentialAuthority({ filePath }),
  };
}

const provider = (id: string) => ({
  id,
  name: id,
  type: 'generic' as const,
  apiUrl: 'https://example.invalid/api',
});

describe('ProviderCredentialAuthority', () => {
  it('reads current exact Provider credentials and exposes only status for settings', async () => {
    const { manager, authority, filePath } = fixture();
    await manager.addProvider(provider('first'), 'first-synthetic-key');
    await manager.addProvider(provider('second'), 'second-synthetic-key');
    const read = vi.spyOn(authority, 'read');
    await expect(authority.status('second')).resolves.toBe('configured');
    expect(read).not.toHaveBeenCalled();
    await expect(authority.read('second')).resolves.toEqual({
      type: 'api_key',
      key: 'second-synthetic-key',
    });
    await expect(authority.read('absent')).resolves.toBeUndefined();
    await expect(authority.status('absent')).resolves.toBe('missing');
    const editor = new FileUserConfigManager({ filePath });
    await editor.addProvider(provider('second'), 'replacement-synthetic-key');
    await expect(authority.read('second')).resolves.toEqual({
      type: 'api_key',
      key: 'replacement-synthetic-key',
    });
    await editor.removeProvider('second');
    await expect(authority.read('second')).resolves.toBeUndefined();
    await expect(authority.read('first')).resolves.toEqual({
      type: 'api_key',
      key: 'first-synthetic-key',
    });
  });

  it('isolates invalid declarations and keeps their contents out of diagnostics', async () => {
    const { filePath, authority, manager } = fixture();
    await manager.addProvider(provider('valid'), 'valid-synthetic-key');
    fs.appendFileSync(
      filePath,
      '\n[[providers]]\nid = "invalid"\nname = "invalid"\ntype = "generic"\napi_key = ["invalid-synthetic-secret"]\n',
    );
    await expect(authority.status('invalid')).rejects.toThrow('providers.invalid.api_key');
    await expect(authority.read('invalid')).rejects.not.toThrow('invalid-synthetic-secret');
    await expect(authority.status('valid')).resolves.toBe('configured');
    await expect(authority.read('valid')).resolves.toEqual({
      type: 'api_key',
      key: 'valid-synthetic-key',
    });
  });

  it('reports missing and malformed configuration without fabricating a credential', async () => {
    const { filePath, authority } = fixture();
    await expect(authority.status('missing')).resolves.toBe('missing');
    await expect(authority.read(' invalid ')).rejects.toThrow('identity is invalid');
    fs.writeFileSync(filePath, '[[providers');
    await expect(authority.read('missing')).rejects.toThrow('invalidToml');
  });
});
