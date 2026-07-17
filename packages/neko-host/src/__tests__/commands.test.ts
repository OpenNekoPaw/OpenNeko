import { describe, expect, it } from 'vitest';
import { NEKO_COMMANDS, NekoCommandExecutionError, createNekoCommandRegistry } from '../commands';

describe('neko host command registry', () => {
  it('executes registered neko.* commands through the host adapter', async () => {
    const registry = createNekoCommandRegistry();
    registry.register(NEKO_COMMANDS.workspaceSearchFiles, async (payload) => ({
      files: [
        {
          path: `story/${payload.filter}.md`,
          name: `${payload.filter}.md`,
          type: 'file',
          source: 'workspace',
          icon: 'MD',
        },
      ],
    }));

    await expect(
      registry.execute(
        NEKO_COMMANDS.workspaceSearchFiles,
        { filter: 'scene', limit: 10 },
        { actor: 'agent' },
      ),
    ).resolves.toEqual({
      files: [
        {
          path: 'story/scene.md',
          name: 'scene.md',
          type: 'file',
          source: 'workspace',
          icon: 'MD',
        },
      ],
    });
  });

  it('fails visibly when a host does not implement a command', async () => {
    const registry = createNekoCommandRegistry();

    await expect(
      registry.execute(NEKO_COMMANDS.workspaceOpenFile, { path: 'scene.md' }, { actor: 'agent' }),
    ).rejects.toMatchObject({
      name: 'NekoCommandExecutionError',
      diagnostic: {
        code: 'missingNekoCommandHandler',
        severity: 'error',
        metadata: {
          commandId: NEKO_COMMANDS.workspaceOpenFile,
          actor: 'agent',
        },
      },
    });
  });

  it('rejects duplicate command handlers', () => {
    const registry = createNekoCommandRegistry();
    registry.register(NEKO_COMMANDS.configOpenUser, async () => undefined);

    expect(() => registry.register(NEKO_COMMANDS.configOpenUser, async () => undefined)).toThrow(
      NekoCommandExecutionError,
    );
  });
});
