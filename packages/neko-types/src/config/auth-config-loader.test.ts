import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadAuthConfigFromFiles } from './auth-config-loader';

const tempRoots: string[] = [];
const originalHome = process.env.HOME;

function useTempHome(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-auth-config-'));
  tempRoots.push(root);
  process.env.HOME = root;
  return root;
}

describe('auth-config-loader', () => {
  afterEach(() => {
    process.env.HOME = originalHome;
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats missing config as unconfigured auth', () => {
    useTempHome();

    expect(loadAuthConfigFromFiles()).toEqual(
      expect.objectContaining({
        authUrl: '',
        tokenUrl: '',
        scopes: ['openid', 'profile', 'email'],
        redirectPort: 6419,
      }),
    );
  });

  it('fails visibly when auth config TOML is invalid', () => {
    const home = useTempHome();
    const configDir = path.join(home, '.neko');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.toml'), 'auth = [', 'utf-8');

    expect(() => loadAuthConfigFromFiles()).toThrow('Configuration file contains invalid TOML');
  });
});
