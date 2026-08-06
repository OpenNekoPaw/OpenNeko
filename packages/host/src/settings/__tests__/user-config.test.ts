import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeConfigFile } from '../config-reader';
import { FileUserConfigManager, getUserConfigPath } from '../user-config';

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-user-config-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('FileUserConfigManager', () => {
  it('uses the canonical user config path by default', () => {
    const manager = new FileUserConfigManager();
    const result = manager.loadRawResult();

    expect(result.filePath).toBe(getUserConfigPath());
  });

  it('loads an explicit config.toml path without reading the default location', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    writeConfigFile(filePath, {
      defaultModels: {
        llm: { providerId: 'profile-provider', modelId: 'profile-chat' },
      },
      providers: [
        {
          id: 'profile-provider',
          name: 'Profile Provider',
          displayName: 'Profile Provider',
          type: 'newapi',
          apiUrl: 'https://example.invalid/api',
          apiKey: '${PROFILE_API_KEY}',
          enabled: true,
          connectionKind: 'gateway',
          protocolProfile: 'newapi',
          requiresApiKey: true,
        },
      ],
      models: [
        {
          id: 'profile-chat',
          name: 'Profile Chat',
          providerId: 'profile-provider',
          type: 'llm',
          capabilities: ['chat', 'streaming', 'function_calling'],
          enabled: true,
        },
      ],
    });

    const manager = new FileUserConfigManager({ filePath });
    const raw = manager.loadRawResult();
    const config = manager.load();

    expect(raw.status).toBe('ok');
    expect(raw.filePath).toBe(filePath);
    expect(config.providers.map((provider) => provider.id)).toEqual(['profile-provider']);
    expect(config.models.map((model) => model.id)).toEqual(['profile-chat']);
  });

  it('writes model binding updates to the explicit config.toml path', async () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    const manager = new FileUserConfigManager({ filePath });

    await manager.updateScalars({
      defaultModels: {
        llm: { providerId: 'local-provider', modelId: 'local-chat' },
      },
    });

    const raw = manager.loadRawResult();
    expect(raw.status).toBe('ok');
    if (raw.status !== 'ok') throw new Error('Expected explicit config to be written');
    expect(raw.filePath).toBe(filePath);
    expect(raw.config.defaultModels?.llm).toEqual({
      providerId: 'local-provider',
      modelId: 'local-chat',
    });
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
