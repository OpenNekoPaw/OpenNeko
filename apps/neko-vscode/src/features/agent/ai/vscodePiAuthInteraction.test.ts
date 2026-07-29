import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VSCodePiAuthInteraction } from './vscodePiAuthInteraction';

describe('VSCodePiAuthInteraction', () => {
  const logger = { info: vi.fn(), error: vi.fn() };

  beforeEach(() => {
    vi.mocked(vscode.window.showInputBox).mockReset();
    vi.mocked(vscode.window.showQuickPick).mockReset();
    vi.mocked(vscode.window.showInformationMessage).mockReset();
    vi.mocked(vscode.env.openExternal).mockReset().mockResolvedValue(true);
    logger.info.mockReset();
    logger.error.mockReset();
  });

  it('projects secret and selection prompts without changing Pi option identity', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('secret-value');
    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ id: 'device', label: 'Device' });
    const interaction = new VSCodePiAuthInteraction(logger);

    await expect(
      interaction.prompt({ type: 'secret', message: 'API key', placeholder: 'key' }),
    ).resolves.toBe('secret-value');
    await expect(
      interaction.prompt({
        type: 'select',
        message: 'Login method',
        options: [{ id: 'device', label: 'Device', description: 'Use another device' }],
      }),
    ).resolves.toBe('device');

    expect(vscode.window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'API key', placeHolder: 'key', password: true }),
      undefined,
    );
    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      [{ id: 'device', label: 'Device', description: 'Use another device' }],
      expect.objectContaining({ title: 'Login method' }),
      undefined,
    );
  });

  it('fails visibly on user cancellation and an already-aborted prompt', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce(undefined);
    const interaction = new VSCodePiAuthInteraction(logger);
    const controller = new AbortController();
    controller.abort();

    await expect(interaction.prompt({ type: 'text', message: 'Account' })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(
      interaction.prompt({ type: 'manual_code', message: 'Code', signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('opens Pi authentication URLs and reports progress without logging credentials', async () => {
    const interaction = new VSCodePiAuthInteraction(logger);

    interaction.notify({
      type: 'auth_url',
      url: 'https://identity.example/authorize',
      instructions: 'Continue in the browser.',
    });
    interaction.notify({
      type: 'device_code',
      verificationUri: 'https://identity.example/device',
      userCode: 'ABCD-EFGH',
    });
    interaction.notify({ type: 'progress', message: 'Waiting for provider' });
    await vi.waitFor(() => expect(vscode.env.openExternal).toHaveBeenCalledTimes(2));

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Continue in the browser.');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Enter device code: ABCD-EFGH',
    );
    expect(logger.info).toHaveBeenCalledWith('Pi provider authentication progress');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('Waiting for provider');
  });
});
