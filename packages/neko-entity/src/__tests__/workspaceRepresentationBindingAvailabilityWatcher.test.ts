import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CreativeEntityService } from '../core/CreativeEntityService';
import {
  resolveCharacterRegistryPath,
  resolveEntityRepresentationBindingsPath,
} from '../core/paths';
import { WorkspaceRepresentationBindingAvailabilityWatcher } from '../host-vscode/workspaceRepresentationBindingAvailabilityWatcher';
import { MemoryEntityFileStore, createFixedClock } from '../testing';

const projectRoot = '/workspace/neko-test';
const now = '2026-06-10T00:00:00.000Z';

describe('WorkspaceRepresentationBindingAvailabilityWatcher', () => {
  it('orphans direct workspace/document bindings without automatically restoring them', async () => {
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
      [resolveEntityRepresentationBindingsPath(projectRoot)]: {
        version: 2,
        bindings: [
          {
            id: 'binding-portrait',
            entityId: 'char_xiaoju',
            entityKind: 'character',
            representation: { kind: 'workspace-file', path: 'assets/xiaoju.png' },
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: now,
          },
          {
            id: 'binding-reference',
            entityId: 'char_xiaoju',
            entityKind: 'character',
            representation: {
              kind: 'document-entry',
              source: { kind: 'workspace-file', path: 'books/xiaoju.epub' },
              entryPath: 'OPS/images/portrait.png',
            },
            role: 'reference',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: now,
          },
          {
            id: 'binding-generated',
            entityId: 'char_xiaoju',
            entityKind: 'character',
            representation: {
              kind: 'generated-output',
              outputId: 'xiaoju-generated',
              revision: 'revision-1',
              digest: 'sha256:xiaoju',
              path: 'neko/generated/xiaoju.png',
            },
            role: 'style',
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
    const watcher = new WorkspaceRepresentationBindingAvailabilityWatcher({
      projectRoot,
      service,
      workspace: watcherHost.workspace,
      debounceMs: 10,
      now: () => '2026-06-10T01:00:00.000Z',
    });

    watcherHost.delete(vscode.Uri.file('/workspace/neko-test/assets/xiaoju.png'));
    watcherHost.delete(vscode.Uri.file('/workspace/neko-test/books/xiaoju.epub'));
    watcherHost.delete(vscode.Uri.file('/workspace/neko-test/neko/generated/xiaoju.png'));
    await watcher.flushNow();

    expect(files.get(resolveEntityRepresentationBindingsPath(projectRoot))).toEqual({
      version: 2,
      bindings: expect.arrayContaining([
        expect.objectContaining({ id: 'binding-portrait', availability: 'orphaned' }),
        expect.objectContaining({ id: 'binding-reference', availability: 'orphaned' }),
        expect.objectContaining({ id: 'binding-generated', availability: 'active' }),
      ]),
    });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'mark-binding-orphaned',
        changedRefs: expect.arrayContaining([
          expect.objectContaining({ id: 'binding-portrait' }),
          expect.objectContaining({ id: 'binding-reference' }),
        ]),
      }),
    );

    watcherHost.create(vscode.Uri.file('/workspace/neko-test/assets/xiaoju.png'));
    await watcher.flushNow();
    expect(files.get(resolveEntityRepresentationBindingsPath(projectRoot))).toEqual(
      expect.objectContaining({
        bindings: expect.arrayContaining([
          expect.objectContaining({ id: 'binding-portrait', availability: 'orphaned' }),
        ]),
      }),
    );
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
    workspace: { createFileSystemWatcher: vi.fn(() => watcher) },
    create(uri: vscode.Uri) {
      for (const listener of createdListeners) listener(uri);
    },
    delete(uri: vscode.Uri) {
      for (const listener of deletedListeners) listener(uri);
    },
  };
}
