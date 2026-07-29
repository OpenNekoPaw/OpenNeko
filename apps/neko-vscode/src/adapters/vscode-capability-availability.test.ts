import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(async () => undefined),
  showErrorMessage: vi.fn(async () => undefined),
}));

vi.mock('vscode', () => ({
  commands: { executeCommand: vscodeMocks.executeCommand },
  window: { showErrorMessage: vscodeMocks.showErrorMessage },
}));

import { createVSCodeCapabilityContribution } from './vscode-capability-availability';
import { DisposableStore } from '../kernel/disposable-store';
import { createLazyCapability } from '../kernel/lazy-capability';

describe('VS Code capability availability projection', () => {
  beforeEach(() => {
    vscodeMocks.executeCommand.mockClear();
    vscodeMocks.showErrorMessage.mockClear();
  });

  it('projects idle, starting and unavailable states and shows the causal diagnostic', async () => {
    const owner = new DisposableStore();
    const capability = createLazyCapability({
      id: 'neko.capability.generation',
      dependencies: {},
      async start() {
        throw new Error('provider configuration is invalid');
      },
    });
    const contribution = await createVSCodeCapabilityContribution({
      capability,
      owner,
      contextKey: 'neko.capability.generation',
      label: 'Media generation',
    });

    await expect(contribution.invoke(() => 'unreachable')).rejects.toThrow(
      'provider configuration is invalid',
    );
    await owner.dispose();

    expect(vscodeMocks.executeCommand.mock.calls).toEqual([
      ['setContext', 'neko.capability.generation.status', 'idle'],
      ['setContext', 'neko.capability.generation.available', true],
      ['setContext', 'neko.capability.generation.status', 'starting'],
      ['setContext', 'neko.capability.generation.available', true],
      ['setContext', 'neko.capability.generation.status', 'unavailable'],
      ['setContext', 'neko.capability.generation.available', false],
    ]);
    expect(vscodeMocks.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining(
        'Media generation is unavailable [neko.capability.generation/initialization-failed]',
      ),
    );
  });

  it('fails registration visibly when the initial context projection fails', async () => {
    vscodeMocks.executeCommand.mockRejectedValueOnce(new Error('setContext failed'));
    const owner = new DisposableStore();
    const capability = createLazyCapability({
      id: 'neko.capability.preview',
      dependencies: {},
      async start() {
        return 'preview';
      },
    });

    await expect(
      createVSCodeCapabilityContribution({
        capability,
        owner,
        contextKey: 'neko.capability.preview',
        label: 'Preview',
      }),
    ).rejects.toThrow('setContext failed');
    expect(capability.state().status).toBe('idle');
  });
});
