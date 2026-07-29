import { describe, expect, it, vi } from 'vitest';
import { ENTITY_FACADE_COMMANDS } from '@neko/shared';
import {
  EntityBrowserEntityItem,
  EntityBrowserGroupItem,
  EntityBrowserTreeProvider,
  EntityBrowserUnavailableItem,
  groupEntityTreeItems,
} from './EntityBrowserTreeProvider';

vi.mock('vscode', () => ({
  TreeItem: class TreeItem {
    label: unknown;
    collapsibleState: unknown;
    description?: string;
    contextValue?: string;
    iconPath?: unknown;
    tooltip?: string;
    command?: unknown;
    constructor(label: unknown, collapsibleState: unknown) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class ThemeIcon {
    constructor(readonly id: string) {}
  },
  l10n: {
    t: (message: string, ...args: readonly unknown[]) =>
      args.reduce((text, arg, index) => text.replace(`{${index}}`, String(arg)), message),
  },
  EventEmitter: class EventEmitter<T> {
    readonly event = (_listener: (event: T) => void) => ({ dispose() {} });
    fire(_event: T) {}
    dispose() {}
  },
  commands: { executeCommand: vi.fn() },
  workspace: { workspaceFolders: [{ uri: { fsPath: '/workspace' } }] },
}));

describe('EntityBrowserTreeProvider', () => {
  it('groups confirmed entities and candidates by kind', () => {
    const groups = groupEntityTreeItems([
      {
        id: 'entity:char-rin',
        label: 'Rin',
        kind: 'character',
        status: 'confirmed',
        entityRef: { entityId: 'char-rin', entityKind: 'character' },
      },
      {
        id: 'candidate:candidate-mika',
        label: 'Mika?',
        kind: 'character',
        status: 'open',
        candidateId: 'candidate-mika',
      },
    ]);

    expect(groups.map(([kind, items]) => [kind, items.map((item) => item.id)])).toEqual([
      ['character', ['entity:char-rin']],
      ['candidate', ['candidate:candidate-mika']],
    ]);
  });

  it('loads tree items through entity facade commands only', async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'char-rin',
          kind: 'character',
          canonicalName: 'Rin',
          aliases: [],
          status: 'confirmed',
        },
      ])
      .mockResolvedValueOnce([]);
    const provider = new EntityBrowserTreeProvider({
      executeCommand,
      getProjectRoot: () => '/workspace',
    });

    const roots = await provider.getChildren();
    const children = await provider.getChildren(roots[0] as EntityBrowserGroupItem);

    expect(executeCommand).toHaveBeenCalledWith(ENTITY_FACADE_COMMANDS.listEntities, {
      projectRoot: '/workspace',
    });
    expect(executeCommand).toHaveBeenCalledWith(ENTITY_FACADE_COMMANDS.listCandidates, {
      projectRoot: '/workspace',
      status: 'open',
    });
    expect(roots[0]).toBeInstanceOf(EntityBrowserGroupItem);
    expect(children[0]).toBeInstanceOf(EntityBrowserEntityItem);
  });

  it('localizes TreeView group and candidate fallback labels', async () => {
    const translate = vi.fn((message: string, ...args: readonly unknown[]) =>
      args.reduce((text, arg, index) => text.replace(`{${index}}`, String(arg)), `t:${message}`),
    );
    const provider = new EntityBrowserTreeProvider({
      translate,
      executeCommand: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'candidate-visual',
            kind: 'character',
            name: '',
            status: 'open',
            identityBasis: 'visual',
          },
        ]),
    });

    const roots = await provider.getChildren();
    const children = await provider.getChildren(roots[0] as EntityBrowserGroupItem);

    expect(roots[0]?.label).toBe('t:Candidates');
    expect(children[0]?.label).toBe('t:Unnamed candidate');
    expect((children[0] as EntityBrowserEntityItem).item.summary).toBe(
      't:Pending name · visual candidate',
    );
  });

  it('shows unavailable state when facade commands fail', async () => {
    const provider = new EntityBrowserTreeProvider({
      executeCommand: vi.fn().mockRejectedValue(new Error('missing command')),
    });

    const roots = await provider.getChildren();

    expect(roots[0]).toBeInstanceOf(EntityBrowserUnavailableItem);
  });

  it('invokes Inspector for selected tree entity', async () => {
    const executeCommand = vi.fn(async () => ({ ok: true }));
    const provider = new EntityBrowserTreeProvider({
      executeCommand,
      getProjectRoot: () => '/workspace',
    });
    const item = new EntityBrowserEntityItem({
      id: 'entity:char-rin',
      label: 'Rin',
      kind: 'character',
      status: 'confirmed',
      entityRef: { entityId: 'char-rin', entityKind: 'character' },
    });

    await provider.inspect(item);

    expect(executeCommand).toHaveBeenCalledWith(ENTITY_FACADE_COMMANDS.inspectEntity, {
      projectRoot: '/workspace',
      entityRef: { entityId: 'char-rin', entityKind: 'character' },
      context: { surface: 'treeview', projectRoot: '/workspace' },
    });
  });
});
