import fs from 'node:fs';
import * as configFs from 'fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readConfigFileResult } from '../config-reader';
import { FileUserConfigManager } from '../user-config';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const provider = (id: string) => ({
  id,
  name: id,
  type: 'generic' as const,
  apiUrl: 'https://example.invalid/api',
});
function fixture() {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'neko-provider-write-'));
  roots.push(root);
  const filePath = path.join(root, 'user', 'config.toml');
  return { filePath, manager: new FileUserConfigManager({ filePath }) };
}
function read(filePath: string) {
  const result = readConfigFileResult(filePath);
  if (result.status !== 'ok') throw new Error(`Expected valid config: ${result.status}`);
  return result;
}

describe('Provider configuration persistence', () => {
  it('preserves credentials across metadata edits and removes only the deleted Provider key', async () => {
    const { filePath, manager } = fixture();
    await manager.addProvider(provider('first'), 'first-fixture-key');
    await manager.addProvider(provider('second'), 'second-fixture-key');
    await manager.updateScalars({ temperature: 0.4 });
    const reopened = new FileUserConfigManager({ filePath });
    await reopened.addProvider({ ...provider('first'), displayName: 'Updated' });
    expect(read(filePath).providerCredentials).toEqual({
      first: { status: 'configured', apiKey: 'first-fixture-key' },
      second: { status: 'configured', apiKey: 'second-fixture-key' },
    });
    await reopened.addProvider(provider('first'), 'replacement-fixture-key');
    await reopened.removeProvider('second');
    const result = read(filePath);
    expect(result.providerCredentials).toEqual({
      first: { status: 'configured', apiKey: 'replacement-fixture-key' },
    });
    expect(result.config.temperature).toBe(0.4);
    expect(result.config.providers?.map(({ id }) => id)).toEqual(['first']);
    expect(JSON.stringify(result.config)).not.toContain('fixture-key');
    expect(fs.readdirSync(path.dirname(filePath))).toEqual(['config.toml']);
  });

  it('writes private configuration files and replaces permissive files atomically', async () => {
    const { filePath, manager } = fixture();
    await manager.addProvider(provider('first'), 'private-fixture-key');
    if (process.platform !== 'win32') {
      expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(filePath)).mode & 0o777).toBe(0o700);
      fs.chmodSync(filePath, 0o644);
    }
    await manager.addProvider(provider('first'), 'replacement-fixture-key');
    if (process.platform !== 'win32') expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
  });

  it('keeps the previous document and cached Provider intact when the atomic commit fails', async () => {
    const { filePath, manager } = fixture();
    await manager.addProvider(provider('first'), 'original-fixture-key');
    manager.load();
    const original = fs.readFileSync(filePath);
    vi.mocked(configFs.renameSync).mockImplementationOnce(() => {
      throw new Error('fixture commit failed');
    });
    await expect(
      manager.addProvider(
        { ...provider('first'), displayName: 'Uncommitted' },
        'replacement-fixture-key',
      ),
    ).rejects.toThrow('fixture commit failed');
    expect(fs.readFileSync(filePath)).toEqual(original);
    expect(manager.load().providers[0]?.displayName).not.toBe('Uncommitted');
    expect(fs.readdirSync(path.dirname(filePath))).toEqual(['config.toml']);
    vi.restoreAllMocks();
    await manager.addProvider(provider('second'), 'sibling-fixture-key');
    expect(read(filePath).providerCredentials.first).toEqual({
      status: 'configured',
      apiKey: 'original-fixture-key',
    });
  });

  it('rejects invalid input and malformed documents without replacing user bytes', async () => {
    const { filePath, manager } = fixture();
    await manager.addProvider(provider('first'), 'original-fixture-key');
    const original = fs.readFileSync(filePath);
    await expect(manager.addProvider(provider('first'), '  ')).rejects.toThrow('must not be empty');
    expect(fs.readFileSync(filePath)).toEqual(original);
    fs.writeFileSync(filePath, '[[invalid');
    await expect(
      manager.addProvider(provider('first'), 'replacement-fixture-key'),
    ).rejects.toThrow();
    expect(fs.readFileSync(filePath, 'utf8')).toBe('[[invalid');
  });
});
