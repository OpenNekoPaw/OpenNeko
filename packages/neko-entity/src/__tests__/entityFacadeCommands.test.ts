import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITY_FACADE_COMMANDS, isEntityFacadeCommandError } from '@neko/shared';
import { registerEntityFacadeCommands, VSCodeEntityRuntimeRegistry } from '../host-vscode';
import { CreativeEntityService } from '../core/CreativeEntityService';
import { resolveCharacterRegistryPath, resolveEntityAssetBindingsPath } from '../core/paths';
import type { EntityRuntimePorts } from '../core/ports';
import { MemoryEntityFileStore, createFixedClock } from '../testing';
import { EventEmitter, commands, resetVSCodeTestDouble } from '../testing/vscode';

const projectRoot = '/workspace/neko-test';
const now = '2026-06-10T00:00:00.000Z';

describe('entity facade commands', () => {
  beforeEach(() => {
    resetVSCodeTestDouble();
  });

  it('rejects invalid requests without mutating project facts', async () => {
    const files = new MemoryEntityFileStore();
    const registry = createMemoryRuntimeRegistry(files);
    const disposable = registerEntityFacadeCommands({ runtimeRegistry: registry });

    const result = await commands.executeCommand(ENTITY_FACADE_COMMANDS.confirmCandidate, {
      projectRoot,
      candidateId: '',
    });

    expect(isEntityFacadeCommandError(result)).toBe(true);
    expect(result).toEqual(expect.objectContaining({ code: 'invalid-request' }));
    expect(files.writes).toEqual([]);

    disposable.dispose();
    registry.dispose();
  });

  it('confirms a candidate through the canonical facade', async () => {
    const files = new MemoryEntityFileStore();
    const registry = createMemoryRuntimeRegistry(files);
    const facadeDisposable = registerEntityFacadeCommands({ runtimeRegistry: registry });

    const candidate = await commands.executeCommand(ENTITY_FACADE_COMMANDS.proposeCandidate, {
      projectRoot,
      candidate: {
        kind: 'character',
        name: '小橘',
        provenance: [{ providerId: 'fountain-content', sourceKind: 'story' }],
      },
    });
    expect(candidate).toEqual(expect.objectContaining({ id: 'candidate:character:char_小橘' }));

    const result = await commands.executeCommand(ENTITY_FACADE_COMMANDS.confirmCandidate, {
      projectRoot,
      candidateId: 'candidate:character:char_小橘',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        action: 'confirm-candidate',
        changedRefs: expect.arrayContaining([
          expect.objectContaining({
            kind: 'candidate',
            id: 'candidate:character:char_小橘',
            entityRef: expect.objectContaining({ entityId: 'char_小橘' }),
          }),
        ]),
      }),
    );
    expect(files.get(resolveCharacterRegistryPath(projectRoot))).toEqual({
      version: 1,
      characters: [
        expect.objectContaining({
          id: 'char_小橘',
          canonicalName: '小橘',
          status: 'confirmed',
        }),
      ],
    });

    facadeDisposable.dispose();
    registry.dispose();
  });

  it('runs quick edit commands with validation and event emission', async () => {
    const files = new MemoryEntityFileStore({
      [resolveCharacterRegistryPath(projectRoot)]: {
        version: 1,
        characters: [
          {
            id: 'char_xiaoju',
            canonicalName: '小橘',
            displayName: '小橘',
            aliases: [],
            status: 'confirmed',
          },
          {
            id: 'char_xiaoxia',
            canonicalName: '小夏',
            aliases: [],
            status: 'confirmed',
          },
        ],
      },
    });
    const events: unknown[] = [];
    const registry = createMemoryRuntimeRegistry(files, events);
    const disposable = registerEntityFacadeCommands({ runtimeRegistry: registry });

    const duplicate = await commands.executeCommand(ENTITY_FACADE_COMMANDS.renameEntity, {
      projectRoot,
      entityRef: { entityId: 'char_xiaoju', entityKind: 'character' },
      canonicalName: '小夏',
    });
    expect(duplicate).toEqual(expect.objectContaining({ code: 'duplicate-name' }));

    const renamed = await commands.executeCommand(ENTITY_FACADE_COMMANDS.renameEntity, {
      projectRoot,
      entityRef: { entityId: 'char_xiaoju', entityKind: 'character' },
      canonicalName: '橘子',
      keepPreviousAsAlias: true,
    });
    expect(renamed).toEqual(expect.objectContaining({ ok: true, action: 'rename' }));

    await commands.executeCommand(ENTITY_FACADE_COMMANDS.addAlias, {
      projectRoot,
      entityRef: { entityId: 'char_xiaoju', entityKind: 'character' },
      alias: 'Xiaoju',
    });
    await commands.executeCommand(ENTITY_FACADE_COMMANDS.updateMetadata, {
      projectRoot,
      entityRef: { entityId: 'char_xiaoju', entityKind: 'character' },
      metadata: { appearanceSummary: 'orange hoodie' },
    });

    expect(files.get(resolveCharacterRegistryPath(projectRoot))).toEqual(
      expect.objectContaining({
        version: 1,
        characters: expect.arrayContaining([
          expect.objectContaining({
            id: 'char_xiaoju',
            canonicalName: '橘子',
            aliases: ['小橘', 'Xiaoju'],
            metadata: expect.objectContaining({ appearanceSummary: 'orange hoodie' }),
          }),
          expect.objectContaining({ id: 'char_xiaoxia' }),
        ]),
      }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'rename' }),
        expect.objectContaining({ reason: 'add-alias' }),
        expect.objectContaining({ reason: 'update-metadata' }),
      ]),
    );

    disposable.dispose();
    registry.dispose();
  });

  it('rejects unsupported complex metadata edits', async () => {
    const registry = createMemoryRuntimeRegistry(
      new MemoryEntityFileStore({
        [resolveCharacterRegistryPath(projectRoot)]: {
          version: 1,
          characters: [
            {
              id: 'char_xiaoju',
              canonicalName: '小橘',
              aliases: [],
              status: 'confirmed',
            },
          ],
        },
      }),
    );
    const disposable = registerEntityFacadeCommands({ runtimeRegistry: registry });

    const result = await commands.executeCommand(ENTITY_FACADE_COMMANDS.updateMetadata, {
      projectRoot,
      entityRef: { entityId: 'char_xiaoju', entityKind: 'character' },
      metadata: { longMemory: 'multi-field memory edits belong in the Entity editor' },
    });

    expect(result).toEqual(expect.objectContaining({ code: 'unsupported-edit' }));

    disposable.dispose();
    registry.dispose();
  });

  it('sets default binding and maps widget triggers to facade commands', async () => {
    const files = new MemoryEntityFileStore({
      [resolveCharacterRegistryPath(projectRoot)]: {
        version: 1,
        characters: [
          {
            id: 'char_xiaoju',
            canonicalName: '小橘',
            aliases: [],
            status: 'confirmed',
          },
        ],
      },
    });
    const registry = createMemoryRuntimeRegistry(files);
    const disposable = registerEntityFacadeCommands({ runtimeRegistry: registry });

    const direct = await commands.executeCommand(ENTITY_FACADE_COMMANDS.setDefaultBinding, {
      projectRoot,
      binding: {
        id: 'binding-portrait',
        entityId: 'char_xiaoju',
        entityKind: 'character',
        assetRef: 'project://assets/xiaoju-portrait',
        role: 'portrait',
        status: 'confirmed',
        availability: 'active',
        source: 'user',
        updatedAt: now,
      },
    });
    expect(direct).toEqual(expect.objectContaining({ ok: true, action: 'set-default-binding' }));

    const widget = await commands.executeCommand(
      ENTITY_FACADE_COMMANDS.triggerBindingWidgetAction,
      {
        context: { surface: 'canvas', projectRoot, nodeId: 'shot-1' },
        action: 'bind-asset',
        entityRef: { entityId: 'char_xiaoju', entityKind: 'character' },
        assetRef: 'project://assets/xiaoju-reference',
        role: 'reference',
      },
    );
    expect(widget).toEqual(expect.objectContaining({ ok: true, action: 'bind' }));
    expect(files.get(resolveEntityAssetBindingsPath(projectRoot))).toEqual({
      version: 1,
      bindings: expect.arrayContaining([
        expect.objectContaining({
          id: 'binding-portrait',
          role: 'portrait',
          isDefault: true,
        }),
        expect.objectContaining({
          assetRef: 'project://assets/xiaoju-reference',
          role: 'reference',
        }),
      ]),
    });

    disposable.dispose();
    registry.dispose();
  });

  it('projects orphaned bindings in the default-binding QuickPick without dropping text context', async () => {
    const files = new MemoryEntityFileStore({
      [resolveCharacterRegistryPath(projectRoot)]: {
        version: 1,
        characters: [
          {
            id: 'char_xiaoju',
            canonicalName: '小橘',
            aliases: [],
            status: 'confirmed',
          },
        ],
      },
      [resolveEntityAssetBindingsPath(projectRoot)]: {
        version: 1,
        bindings: [
          {
            id: 'binding-active',
            entityId: 'char_xiaoju',
            entityKind: 'character',
            assetRef: 'project://assets/xiaoju-active',
            role: 'reference',
            status: 'suggested',
            availability: 'active',
            source: 'user',
            updatedAt: now,
          },
          {
            id: 'binding-orphaned',
            entityId: 'char_xiaoju',
            entityKind: 'character',
            assetRef: 'project://assets/missing-portrait',
            role: 'portrait',
            status: 'confirmed',
            availability: 'orphaned',
            orphanedAt: '2026-06-10T01:00:00.000Z',
            source: 'user',
            updatedAt: now,
          },
        ],
      },
    });
    const quickPickCalls: unknown[][] = [];
    const showQuickPick = createDefaultBindingQuickPick(quickPickCalls);
    const registry = createMemoryRuntimeRegistry(files);
    const disposable = registerEntityFacadeCommands({
      runtimeRegistry: registry,
      quickPick: { showQuickPick },
    });

    const result = await commands.executeCommand(ENTITY_FACADE_COMMANDS.setDefaultBinding, {
      projectRoot,
      entityRef: { entityId: 'char_xiaoju', entityKind: 'character' },
      interactive: true,
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, action: 'set-default-binding' }));
    expect(quickPickCalls[0]).toEqual([
      expect.arrayContaining([
        expect.objectContaining({
          label: 'portrait: project://assets/missing-portrait',
          description: 'confirmed · unavailable · orphaned at 2026-06-10T01:00:00.000Z',
          detail: expect.stringContaining('Representation asset is unavailable'),
        }),
      ]),
      expect.objectContaining({ title: 'Set default binding' }),
    ]);
    const nextBindings = files.get(resolveEntityAssetBindingsPath(projectRoot));
    expect(nextBindings).toEqual({
      version: 1,
      bindings: expect.arrayContaining([
        expect.objectContaining({
          id: 'binding-orphaned',
          availability: 'orphaned',
          isDefault: true,
        }),
        expect.objectContaining({
          id: 'binding-active',
          availability: 'active',
        }),
      ]),
    });
    const active = isBindingFile(nextBindings)
      ? nextBindings.bindings.find((binding) => binding.id === 'binding-active')
      : undefined;
    expect(active?.isDefault).not.toBe(true);

    disposable.dispose();
    registry.dispose();
  });

  it('finds creative entities bound to an asset without mutating facts', async () => {
    const files = new MemoryEntityFileStore({
      [resolveCharacterRegistryPath(projectRoot)]: {
        version: 1,
        characters: [
          {
            id: 'char_xiaoju',
            canonicalName: '小橘',
            displayName: '小橘',
            aliases: [],
            status: 'confirmed',
          },
        ],
      },
      [resolveEntityAssetBindingsPath(projectRoot)]: {
        version: 1,
        bindings: [
          {
            id: 'binding-portrait',
            entityId: 'char_xiaoju',
            entityKind: 'character',
            assetRef: 'project://assets/xiaoju-portrait',
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            isDefault: true,
            updatedAt: now,
          },
        ],
      },
    });
    const registry = createMemoryRuntimeRegistry(files);
    const disposable = registerEntityFacadeCommands({ runtimeRegistry: registry });

    const result = await commands.executeCommand(ENTITY_FACADE_COMMANDS.findEntitiesByAsset, {
      projectRoot,
      assetRef: 'project://assets/xiaoju-portrait',
    });
    const missing = await commands.executeCommand(ENTITY_FACADE_COMMANDS.findEntitiesByAsset, {
      projectRoot,
      assetRef: 'project://assets/missing',
    });

    expect(result).toEqual({
      assetRef: 'project://assets/xiaoju-portrait',
      entities: [
        {
          entityRef: {
            entityId: 'char_xiaoju',
            entityKind: 'character',
            projectRoot,
            source: 'neko-entity',
          },
          label: '小橘',
          role: 'portrait',
          bindingId: 'binding-portrait',
          status: 'confirmed',
          availability: 'active',
          isDefault: true,
        },
      ],
    });
    expect(missing).toEqual({
      assetRef: 'project://assets/missing',
      entities: [],
    });

    disposable.dispose();
    registry.dispose();
  });

  it('lists and unbinds creative entity asset bindings through facade commands', async () => {
    const files = new MemoryEntityFileStore({
      [resolveCharacterRegistryPath(projectRoot)]: {
        version: 1,
        characters: [
          {
            id: 'char_xiaoju',
            canonicalName: '小橘',
            aliases: [],
            status: 'confirmed',
          },
        ],
      },
      [resolveEntityAssetBindingsPath(projectRoot)]: {
        version: 1,
        bindings: [
          {
            id: 'binding-portrait',
            entityId: 'char_xiaoju',
            entityKind: 'character',
            assetRef: 'project://assets/xiaoju-portrait',
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: now,
          },
        ],
      },
    });
    const events: unknown[] = [];
    const registry = createMemoryRuntimeRegistry(files, events);
    const disposable = registerEntityFacadeCommands({ runtimeRegistry: registry });

    await expect(
      commands.executeCommand(ENTITY_FACADE_COMMANDS.listBindings, {
        projectRoot,
        assetRef: 'project://assets/xiaoju-portrait',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'binding-portrait',
        entityId: 'char_xiaoju',
      }),
    ]);

    const result = await commands.executeCommand(
      ENTITY_FACADE_COMMANDS.triggerBindingWidgetAction,
      {
        context: { surface: 'assets', projectRoot },
        action: 'unbind-asset',
        payload: { bindingId: 'binding-portrait' },
      },
    );

    expect(result).toEqual(expect.objectContaining({ ok: true, action: 'unbind' }));
    expect(files.get(resolveEntityAssetBindingsPath(projectRoot))).toEqual({
      version: 1,
      bindings: [],
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'unbind',
          changedRefs: expect.arrayContaining([
            expect.objectContaining({
              kind: 'binding',
              id: 'binding-portrait',
              entityRef: expect.objectContaining({ entityId: 'char_xiaoju' }),
            }),
          ]),
        }),
      ]),
    );

    disposable.dispose();
    registry.dispose();
  });

  it('updates binding availability lifecycle through facade commands', async () => {
    const files = new MemoryEntityFileStore({
      [resolveCharacterRegistryPath(projectRoot)]: {
        version: 1,
        characters: [
          {
            id: 'char_xiaoju',
            canonicalName: '小橘',
            aliases: [],
            status: 'confirmed',
          },
        ],
      },
      [resolveEntityAssetBindingsPath(projectRoot)]: {
        version: 1,
        bindings: [
          {
            id: 'binding-portrait',
            entityId: 'char_xiaoju',
            entityKind: 'character',
            assetRef: 'project://assets/xiaoju-portrait',
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: now,
          },
        ],
      },
    });
    const registry = createMemoryRuntimeRegistry(files);
    const disposable = registerEntityFacadeCommands({ runtimeRegistry: registry });

    await commands.executeCommand(ENTITY_FACADE_COMMANDS.markBindingOrphaned, {
      projectRoot,
      bindingIds: ['binding-portrait'],
      orphanedAt: '2026-06-10T01:00:00.000Z',
    });
    expect(files.get(resolveEntityAssetBindingsPath(projectRoot))).toEqual({
      version: 1,
      bindings: [
        expect.objectContaining({
          id: 'binding-portrait',
          status: 'confirmed',
          availability: 'orphaned',
          orphanedAt: '2026-06-10T01:00:00.000Z',
        }),
      ],
    });

    await commands.executeCommand(ENTITY_FACADE_COMMANDS.restoreBinding, {
      projectRoot,
      bindingIds: ['binding-portrait'],
    });
    expect(files.get(resolveEntityAssetBindingsPath(projectRoot))).toEqual({
      version: 1,
      bindings: [
        expect.objectContaining({
          id: 'binding-portrait',
          status: 'confirmed',
          availability: 'active',
        }),
      ],
    });

    await commands.executeCommand(ENTITY_FACADE_COMMANDS.archiveBinding, {
      projectRoot,
      bindingIds: ['binding-portrait'],
    });
    expect(files.get(resolveEntityAssetBindingsPath(projectRoot))).toEqual({
      version: 1,
      bindings: [
        expect.objectContaining({
          id: 'binding-portrait',
          status: 'confirmed',
          availability: 'archived',
        }),
      ],
    });

    disposable.dispose();
    registry.dispose();
  });
});

function createMemoryRuntimeRegistry(
  files: MemoryEntityFileStore,
  events: unknown[] = [],
): VSCodeEntityRuntimeRegistry {
  return new VSCodeEntityRuntimeRegistry({
    createRuntime({ projectRoot }) {
      const eventEmitter = new EventEmitter<import('@neko/shared').CreativeEntityChangeEvent>();
      const ports: EntityRuntimePorts = {
        files,
        clock: createFixedClock(now),
        events: {
          emit(event) {
            events.push(event);
            eventEmitter.fire(event);
          },
        },
      };
      const service = new CreativeEntityService({
        projectRoot,
        ports,
      });
      return {
        service,
        ports,
        onDidChangeEntity: eventEmitter.event,
        flushProjection: async () => undefined,
        dispose() {
          eventEmitter.dispose();
        },
      };
    },
  });
}

function isBindingFile(value: unknown): value is {
  readonly bindings: readonly { readonly id: string; readonly isDefault?: boolean }[];
} {
  return isRecord(value) && Array.isArray(value['bindings']);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOrphanedBindingPick(
  value: unknown,
): value is { readonly binding: { readonly id: 'binding-orphaned' } } {
  return (
    isRecord(value) && isRecord(value['binding']) && value['binding']['id'] === 'binding-orphaned'
  );
}

function createDefaultBindingQuickPick(
  calls: unknown[][],
): typeof import('vscode').window.showQuickPick {
  function showQuickPick(
    items: readonly string[] | Thenable<readonly string[]>,
    options: import('vscode').QuickPickOptions & { canPickMany: true },
    token?: import('vscode').CancellationToken,
  ): Thenable<string[] | undefined>;
  function showQuickPick(
    items: readonly string[] | Thenable<readonly string[]>,
    options?: import('vscode').QuickPickOptions,
    token?: import('vscode').CancellationToken,
  ): Thenable<string | undefined>;
  function showQuickPick<T extends import('vscode').QuickPickItem>(
    items: readonly T[] | Thenable<readonly T[]>,
    options: import('vscode').QuickPickOptions & { canPickMany: true },
    token?: import('vscode').CancellationToken,
  ): Thenable<T[] | undefined>;
  function showQuickPick<T extends import('vscode').QuickPickItem>(
    items: readonly T[] | Thenable<readonly T[]>,
    options?: import('vscode').QuickPickOptions,
    token?: import('vscode').CancellationToken,
  ): Thenable<T | undefined>;
  function showQuickPick(items: unknown, options?: unknown, _token?: unknown): Thenable<unknown> {
    calls.push([items, options]);
    return Promise.resolve(Array.isArray(items) ? items.find(isOrphanedBindingPick) : undefined);
  }
  return showQuickPick;
}
