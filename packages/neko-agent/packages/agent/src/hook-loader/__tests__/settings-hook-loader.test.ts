import { describe, expect, it, vi } from 'vitest';
import { SettingsHookLoader, type ISettingsFileSystem } from '../settings-hook-loader';

function createFs(files: Record<string, string>): ISettingsFileSystem {
  return {
    readFile: async (path) => files[path] ?? '',
    exists: async (path) => Object.prototype.hasOwnProperty.call(files, path),
  };
}

describe('SettingsHookLoader', () => {
  it('loads hooks from settings files in personal/project/local order', async () => {
    const loader = new SettingsHookLoader({
      fs: createFs({
        '/home/.neko/settings.json': JSON.stringify({
          hooks: {
            PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'personal' }] }],
          },
        }),
        '/repo/.neko/settings.json': JSON.stringify({
          hooks: {
            PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'project' }] }],
          },
        }),
        '/repo/.neko/settings.local.json': JSON.stringify({
          hooks: {
            UserPromptSubmit: [{ matcher: '*', hooks: [{ type: 'command', command: 'local' }] }],
          },
        }),
      }),
      shell: { execute: vi.fn() },
    });

    await expect(
      loader.loadFromSettings('/repo/.neko', '/home/.neko/settings.json'),
    ).resolves.toMatchObject({
      errors: [],
      hooks: [
        { event: 'PreToolUse', matcher: 'Read', source: 'personal' },
        { event: 'PreToolUse', matcher: 'Write', source: 'project' },
        { event: 'UserPromptSubmit', matcher: '*', source: 'local' },
      ],
    });
  });

  it('executes matching settings hooks with JSON stdin and parses block decisions', async () => {
    const execute = vi.fn(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({ decision: 'block', reason: 'policy' }),
      stderr: '',
    }));
    const loader = new SettingsHookLoader({
      fs: createFs({
        '/repo/.neko/settings.json': JSON.stringify({
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard' }] }],
          },
        }),
      }),
      shell: { execute },
    });

    await loader.loadFromSettings('/repo/.neko', '/home/.neko/settings.json');
    await expect(loader.executePreToolUse('Bash', { command: 'rm -rf dist' })).resolves.toEqual({
      success: true,
      blocked: true,
      reason: 'policy',
      updatedInput: undefined,
      stdout: JSON.stringify({ decision: 'block', reason: 'policy' }),
      stderr: '',
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const [command, stdin] = execute.mock.calls[0]!;
    expect(command).toBe('guard');
    expect(JSON.parse(stdin ?? '')).toMatchObject({
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf dist' },
      timestamp: expect.any(String),
    });
  });
});
