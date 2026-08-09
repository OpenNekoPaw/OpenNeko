import { describe, expect, it, vi } from 'vitest';
import type { AuthorizedWorkspaceDirectoryCreator } from '../workspace-entry-creation';
import {
  WorkspaceEntryContractError,
  WorkspaceEntryCreationService,
  parseWorkspaceEntryCreateRequest,
} from '../workspace-entry-creation';
import type { AuthorizedWorkspaceWriter } from '../../contracts';

describe('WorkspaceEntryCreationService', () => {
  it('normalizes a portable name and publishes an empty ordinary file exclusively', async () => {
    const writer = createWriter();
    const service = new WorkspaceEntryCreationService({
      writer,
      directoryCreator: createDirectoryCreator(),
    });

    await expect(
      service.create({ kind: 'file', targetDirectory: 'notes', name: 'Cafe\u0301.md' }),
    ).resolves.toEqual({ status: 'created', kind: 'file', path: 'notes/Caf\u00e9.md' });
    expect(writer.write).toHaveBeenCalledWith(
      { kind: 'workspace-file', path: 'notes/Caf\u00e9.md' },
      new Uint8Array(),
      { conflict: 'fail-if-exists', maxBytes: 1 },
    );
  });

  it.each(['board.nkc', 'timeline.OTIO'])(
    'rejects reserved creative document extension %s without calling the writer',
    async (name) => {
      const writer = createWriter();
      const service = new WorkspaceEntryCreationService({
        writer,
        directoryCreator: createDirectoryCreator(),
      });

      await expect(service.create({ kind: 'file', targetDirectory: '', name })).resolves.toEqual({
        status: 'unavailable',
        kind: 'file',
        path: name,
        diagnostic: {
          code: 'reserved-creative-document-extension',
          requiredKind: name.toLocaleLowerCase('en-US').endsWith('.nkc') ? 'canvas' : 'cut',
        },
      });
      expect(writer.write).not.toHaveBeenCalled();
    },
  );

  it('delegates one canonical directory path without creating parents implicitly', async () => {
    const directoryCreator = createDirectoryCreator();
    const service = new WorkspaceEntryCreationService({
      writer: createWriter(),
      directoryCreator,
    });

    await expect(
      service.create({ kind: 'directory', targetDirectory: 'references', name: 'Images' }),
    ).resolves.toEqual({
      status: 'created',
      kind: 'directory',
      path: 'references/Images',
    });
    expect(directoryCreator.create).toHaveBeenCalledWith('references/Images');
  });

  it.each([
    { kind: 'file', targetDirectory: '../outside', name: 'notes.md' },
    { kind: 'file', targetDirectory: '', name: 'CON' },
    { kind: 'file', targetDirectory: '', name: '.hidden' },
    { kind: 'file', targetDirectory: '', name: 'trailing. ' },
    { kind: 'file', targetDirectory: '', name: 'nested/name.md' },
  ])('rejects non-portable request %#', (request) => {
    expect(() => parseWorkspaceEntryCreateRequest(request)).toThrow(WorkspaceEntryContractError);
  });
});

function createWriter(): AuthorizedWorkspaceWriter & { readonly write: ReturnType<typeof vi.fn> } {
  const write = vi.fn<AuthorizedWorkspaceWriter['write']>(async (locator) => ({
    status: 'written',
    locator,
    byteLength: 0,
  }));
  return { write };
}

function createDirectoryCreator(): AuthorizedWorkspaceDirectoryCreator & {
  readonly create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn<AuthorizedWorkspaceDirectoryCreator['create']>(async (path) => ({
    status: 'created',
    path,
  }));
  return { create };
}
