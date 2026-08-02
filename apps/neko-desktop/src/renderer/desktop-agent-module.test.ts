import { describe, expect, it, vi } from 'vitest';
import { loadDesktopAgentWebviewRootModule } from './desktop-agent-module';

vi.mock('@neko/agent-webview/root', () => ({
  AgentWebviewRoot: vi.fn(),
}));

describe('Desktop Agent module loader', () => {
  it('returns one cached module promise to startup and every Agent Surface', async () => {
    const startupPromise = loadDesktopAgentWebviewRootModule();
    const surfacePromise = loadDesktopAgentWebviewRootModule();

    expect(surfacePromise).toBe(startupPromise);
    await expect(startupPromise).resolves.toHaveProperty('AgentWebviewRoot');
  });
});
