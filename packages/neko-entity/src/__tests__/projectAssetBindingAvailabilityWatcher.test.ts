import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CreativeEntityService } from '../core/CreativeEntityService';
import { resolveCharacterRegistryPath, resolveEntityAssetBindingsPath } from '../core/paths';
import {
  ProjectAssetBindingAvailabilityWatcher,
  type ProjectAssetRefResolver,
} from '../host-vscode/projectAssetBindingAvailabilityWatcher';
import { MemoryEntityFileStore, createFixedClock } from '../testing';

const projectRoot = '/workspace/neko-test';
const now = '2026-06-10T00:00:00.000Z';

describe('ProjectAssetBindingAvailabilityWatcher', () => {
  it('marks resolved project bindings orphaned and restores them in coalesced updates', async () => {
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
          {
            id: 'binding-voice',
            entityId: 'char_xiaoju',
            entityKind: 'character',
            assetRef: 'market://voice/xiaoju',
            role: 'voice',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: now,
          },
        ],
      },
    });
    const events = { emit: vi.fn() };
    const service = new CreativeEntityService({
      projectRoot,
      ports: { files, clock: createFixedClock(now), events },
    });
    const watcherHost = createWatcherHost();
    const resolver: ProjectAssetRefResolver = {
      async resolveProjectAssetRefs(input) {
        expect(input.assetRefs).toEqual(['project://assets/xiaoju-portrait']);
        return [
          {
            assetRef: 'project://assets/xiaoju-portrait',
            uris: [vscode.Uri.file('/workspace/neko-test/assets/xiaoju.png')],
          },
        ];
      },
    };
    const watcher = new ProjectAssetBindingAvailabilityWatcher({
      projectRoot,
      service,
      resolver,
      workspace: watcherHost.workspace,
      debounceMs: 10,
      now: () => '2026-06-10T01:00:00.000Z',
    });

    watcherHost.delete(vscode.Uri.file('/workspace/neko-test/unbound.png'));
    watcherHost.delete(vscode.Uri.file('/workspace/neko-test/assets/xiaoju.png'));
    await watcher.flushNow();

    expect(files.get(resolveEntityAssetBindingsPath(projectRoot))).toEqual({
      version: 1,
      bindings: expect.arrayContaining([
        expect.objectContaining({
          id: 'binding-portrait',
          status: 'confirmed',
          availability: 'orphaned',
          orphanedAt: '2026-06-10T01:00:00.000Z',
        }),
        expect.objectContaining({
          id: 'binding-voice',
          availability: 'active',
        }),
      ]),
    });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'mark-binding-orphaned',
        changedRefs: [
          expect.objectContaining({
            id: 'binding-portrait',
            entityRef: expect.objectContaining({ entityId: 'char_xiaoju' }),
          }),
        ],
      }),
    );

    watcherHost.create(vscode.Uri.file('/workspace/neko-test/assets/xiaoju.png'));
    await watcher.flushNow();

    expect(files.get(resolveEntityAssetBindingsPath(projectRoot))).toEqual({
      version: 1,
      bindings: expect.arrayContaining([
        expect.objectContaining({
          id: 'binding-portrait',
          status: 'confirmed',
          availability: 'active',
        }),
      ]),
    });
    watcher.dispose();
  });
});

function createWatcherHost() {
  const createdListeners: ((uri: vscode.Uri) => void)[] = [];
  const deletedListeners: ((uri: vscode.Uri) => void)[] = [];
  const watcher = {
    ignoreCreateEvents: false,
    ignoreChangeEvents: false,
    ignoreDeleteEvents: false,
    onDidCreate(listener: (uri: vscode.Uri) => void) {
      createdListeners.push(listener);
      return { dispose() {} };
    },
    onDidDelete(listener: (uri: vscode.Uri) => void) {
      deletedListeners.push(listener);
      return { dispose() {} };
    },
    onDidChange() {
      return { dispose() {} };
    },
    dispose() {},
  };
  return {
    workspace: {
      createFileSystemWatcher: vi.fn(() => watcher),
    },
    create(uri: vscode.Uri) {
      for (const listener of createdListeners) listener(uri);
    },
    delete(uri: vscode.Uri) {
      for (const listener of deletedListeners) listener(uri);
    },
  };
}
