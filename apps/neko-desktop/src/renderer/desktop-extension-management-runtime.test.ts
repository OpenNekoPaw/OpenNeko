import { describe, expect, it, vi } from 'vitest';
import { DesktopExtensionManagementRuntime } from './desktop-extension-management-runtime';
import type { AgentExtensionManagementHostRequest } from '@neko/agent-contracts/extension-management-host';

describe('DesktopExtensionManagementRuntime', () => {
  it('reads the DSH-owned projection without exposing mutation commands', async () => {
    const execute = vi.fn(async (request: AgentExtensionManagementHostRequest) => {
      if (request.route === 'skill.detail.get') {
        return {
          requestId: request.requestId,
          route: request.route,
          detail: {
            id: `dsh-skill:${request.source}:${request.name}`,
            name: request.name,
            description: 'Review drafts.',
            source: request.source,
            provider: 'filesystem',
            userInvocable: true,
            modelInvocable: true,
            content: '# Review',
            fingerprint: `sha256:${'d'.repeat(64)}`,
          },
        };
      }
      return {
        requestId: request.requestId,
        route: request.route,
        projection: {
          identity: { windowId: 'window-1' },
          catalogScope: 'global' as const,
          skills: [],
          mcp: [],
          diagnostics: [],
        },
      };
    });
    const runtime = new DesktopExtensionManagementRuntime(
      { windowId: 'window-1' },
      { extensionManagement: { execute } },
    );
    await expect(runtime.getSnapshot()).resolves.toMatchObject({
      mcp: [],
      diagnostics: [],
    });
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(
      runtime.getSkillDetail({ name: 'review', source: 'bundled' }),
    ).resolves.toMatchObject({ content: '# Review' });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
