import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityProvider } from '../../../types/agent-capability';

const vscodeMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  getExtension: vi.fn(),
}));

vi.mock('vscode', () => ({
  commands: { executeCommand: vscodeMocks.executeCommand },
  extensions: { getExtension: vscodeMocks.getExtension },
}));

import {
  REGISTER_AGENT_CAPABILITIES_COMMAND,
  registerOptionalAgentCapabilityProvider,
} from '../optional-agent-capability-registration';
import {
  EmbeddedFeatureRegistry,
  installEmbeddedFeatureRegistry,
} from '../embedded-feature-registry';

const provider = { id: 'test-provider' } as AgentCapabilityProvider;

describe('registerOptionalAgentCapabilityProvider', () => {
  beforeEach(() => {
    globalThis.__openNekoEmbeddedFeatureRegistry = undefined;
    vscodeMocks.executeCommand.mockReset();
    vscodeMocks.getExtension.mockReset();
  });

  it('waits for the embedded Agent before executing its registration command', async () => {
    const registry = new EmbeddedFeatureRegistry();
    registry.register({
      id: 'neko.neko-agent',
      extensionUri: uri('/features/neko-agent'),
      packageJSON: {},
      activate: () => ({}),
    });
    const owner = installEmbeddedFeatureRegistry(registry);
    vscodeMocks.executeCommand.mockResolvedValue(undefined);

    const registration = registerOptionalAgentCapabilityProvider(provider);
    await Promise.resolve();
    expect(vscodeMocks.executeCommand).not.toHaveBeenCalled();

    await registry.activateAll(['neko.neko-agent']);
    await expect(registration).resolves.toBe(true);
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith(
      REGISTER_AGENT_CAPABILITIES_COMMAND,
      provider,
    );
    owner.dispose();
  });

  it('does not execute the Agent command when the optional extension is absent', async () => {
    vscodeMocks.getExtension.mockReturnValue(undefined);

    await expect(registerOptionalAgentCapabilityProvider(provider)).resolves.toBe(false);
    expect(vscodeMocks.executeCommand).not.toHaveBeenCalled();
  });

  it('registers through the real command when the Agent extension is installed', async () => {
    vscodeMocks.getExtension.mockReturnValue({ id: 'neko.neko-agent' });
    vscodeMocks.executeCommand.mockResolvedValue(undefined);

    await expect(registerOptionalAgentCapabilityProvider(provider)).resolves.toBe(true);
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith(
      REGISTER_AGENT_CAPABILITIES_COMMAND,
      provider,
    );
  });

  it('keeps an installed Agent registration failure visible', async () => {
    vscodeMocks.getExtension.mockReturnValue({ id: 'neko.neko-agent' });
    vscodeMocks.executeCommand.mockRejectedValue(new Error('registration failed'));

    await expect(registerOptionalAgentCapabilityProvider(provider)).rejects.toThrow(
      'registration failed',
    );
  });
});

function uri(fsPath: string) {
  return {
    fsPath,
    scheme: 'file',
    authority: '',
    path: fsPath,
    query: '',
    fragment: '',
    with: () => uri(fsPath),
    toJSON: () => ({ scheme: 'file', path: fsPath }),
    toString: () => `file://${fsPath}`,
  };
}
