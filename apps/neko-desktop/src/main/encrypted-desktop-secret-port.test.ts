import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import {
  createEncryptedDesktopSecretPort,
  type DesktopSecretEncryption,
} from './encrypted-desktop-secret-port';

describe('EncryptedDesktopSecretPort', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('persists only encrypted values in an atomic owner-only file', async () => {
    const root = await createRoot();
    const filePath = join(root, 'secrets', 'agent.json');
    const port = createEncryptedDesktopSecretPort({
      filePath,
      encryption: fixtureEncryption(),
    });

    await Promise.all([
      port.set('provider:a', 'first-plain-secret'),
      port.set('provider:b', 'second-plain-secret'),
    ]);

    await expect(port.get('provider:a')).resolves.toBe('first-plain-secret');
    await expect(port.get('provider:b')).resolves.toBe('second-plain-secret');
    const source = await readFile(filePath, 'utf8');
    expect(source).not.toContain('first-plain-secret');
    expect(source).not.toContain('second-plain-secret');
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);

    await port.delete('provider:a');
    await expect(port.get('provider:a')).resolves.toBeUndefined();
    await expect(port.get('provider:b')).resolves.toBe('second-plain-secret');
  });

  it('fails visibly when encryption is unavailable or persisted schema is invalid', async () => {
    const root = await createRoot();
    const unavailable = createEncryptedDesktopSecretPort({
      filePath: join(root, 'unavailable.json'),
      encryption: {
        assertAvailable: () => {
          throw new Error('fixture encryption unavailable');
        },
        encrypt: () => new Uint8Array(),
        decrypt: () => '',
      },
    });

    await expect(unavailable.get('provider:a')).rejects.toThrow(
      'fixture encryption unavailable',
    );

    const filePath = join(root, 'invalid.json');
    await writeFile(filePath, '{"schemaVersion":99,"entries":{}}\n', 'utf8');
    const port = createEncryptedDesktopSecretPort({
      filePath,
      encryption: fixtureEncryption(),
    });
    await expect(port.get('provider:a')).rejects.toThrow('unknown schema version');
  });

  async function createRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'neko-desktop-secrets-'));
    roots.push(root);
    return root;
  }
});

function fixtureEncryption(): DesktopSecretEncryption {
  return {
    assertAvailable: () => undefined,
    encrypt: (value) => xor(Buffer.from(value, 'utf8')),
    decrypt: (value) => Buffer.from(xor(value)).toString('utf8'),
  };
}

function xor(value: Uint8Array): Uint8Array {
  return Uint8Array.from(value, (byte) => byte ^ 0xa5);
}
