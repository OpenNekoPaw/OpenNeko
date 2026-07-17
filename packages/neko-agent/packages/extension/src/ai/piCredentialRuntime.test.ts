import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createVSCodePiCredentialRuntime } from './piCredentialRuntime';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('VS Code Pi credential runtime', () => {
  it('uses the program user store shared with the TUI persistence contract', async () => {
    const root = mkdtempSync(join(tmpdir(), 'neko-pi-credentials-'));
    roots.push(root);
    const vscodeRuntime = createVSCodePiCredentialRuntime(root);
    await vscodeRuntime.credentials.replace(
      'provider-a',
      { type: 'api_key', key: 'must-not-appear-in-status' },
      'interactive',
    );

    const status = await vscodeRuntime.credentials.status('provider-a');

    expect(status).toMatchObject({
      providerId: 'provider-a',
      type: 'api_key',
      provenance: 'interactive',
    });
    expect(JSON.stringify(status)).not.toContain('must-not-appear-in-status');
    vscodeRuntime.credentials.dispose();
  });
});
