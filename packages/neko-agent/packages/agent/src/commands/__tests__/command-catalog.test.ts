import { describe, expect, it } from 'vitest';
import { listSlashCommandCatalog, resolveSlashCommandCatalogEntry } from '../command-catalog';

describe('command catalog semantics', () => {
  it('keeps command identities stable and leaves missing artifact descriptions unresolved', () => {
    const skills = [
      {
        name: 'Commit Helper',
        command: 'commit',
        entryPointKind: 'command-artifact' as const,
        enabled: true,
      },
    ];
    const commands = listSlashCommandCatalog({ surface: 'tui', skills });
    const command = commands.find((entry) => entry.name === 'commit');

    expect(command).toEqual(
      expect.objectContaining({
        source: 'command-artifact',
        name: 'commit',
      }),
    );
    expect(command).not.toHaveProperty('description');
    expect(commands.map((entry) => entry.name)).not.toContain('提交');
  });

  it('returns the same locale-neutral artifact identity when resolving directly', () => {
    const command = resolveSlashCommandCatalogEntry('commit', {
      surface: 'tui',
      skills: [
        {
          name: 'Commit Helper',
          command: 'commit',
          entryPointKind: 'command-artifact',
          enabled: true,
        },
      ],
    });

    expect(command).toEqual(
      expect.objectContaining({
        source: 'command-artifact',
        name: 'commit',
      }),
    );
    expect(command).not.toHaveProperty('description');
  });
});
