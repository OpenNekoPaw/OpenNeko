import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { DEFAULT_USER_CONFIG } from '@neko/platform';
import { parseTomlConfigText } from '@neko/shared';
import { buildUserConfigTemplate } from './configFileHandler';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

const tempRoots: string[] = [];

function createTempHome(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-config-extension-'));
  tempRoots.push(root);
  return root;
}

describe('ConfigFileHandler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the NewAPI/local MVP default config as the new file template', () => {
    const template = buildUserConfigTemplate();

    expect(parseTomlConfigText(template)).toEqual(DEFAULT_USER_CONFIG);
    expect(template).toContain('# Provider fields:');
    expect(template).toContain('protocol_profile: "newapi", "openai-chat"');
    expect(template).toContain('DeepSeek direct');
    expect(template).toContain(
      'protocol_profile: optional request protocol override for gateway models',
    );
    expect(template).toContain('[[providers]]');
  });
});
