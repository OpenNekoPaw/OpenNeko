import { describe, expect, it } from 'vitest';
import {
  createCharacterPortableHostRequest,
  parseCharacterPortableHostRequest,
  parseCharacterPortableHostResult,
  type CharacterPortableHostBinding,
} from '@neko/chara/contracts';

describe('Character portable Host contract', () => {
  const context = {
    requestId: 'request-1',
    rendererSessionId: 'renderer-1',
    windowId: 'window-1',
  };
  const binding: CharacterPortableHostBinding = {
    workspaceId: 'workspace-1',
    workspaceGrantId: 'grant-1',
    authority: { kind: 'content-project', contentProjectId: 'content-project-1' },
  };

  it('creates exact project-local export and receipt requests', () => {
    expect(
      createCharacterPortableHostRequest(context, binding, {
        kind: 'export-scope',
        characterProjectId: 'character-1',
      }),
    ).toMatchObject({ operation: 'export-scope', characterProjectId: 'character-1' });
    expect(
      createCharacterPortableHostRequest(context, binding, {
        kind: 'export',
        characterProjectId: 'character-1',
        selection: {
          characterStorylineIds: ['storyline-1'],
          authoringTestSnapshotIds: [],
          embeddedRepresentationIds: ['portrait-1'],
        },
      }),
    ).toMatchObject({
      ...context,
      ...binding,
      operation: 'export',
      characterProjectId: 'character-1',
    });
    expect(
      createCharacterPortableHostRequest(context, binding, {
        kind: 'import-commit',
        importReceiptId: 'receipt-1',
      }),
    ).toMatchObject({ operation: 'import-commit', importReceiptId: 'receipt-1' });
  });

  it('rejects raw paths, extra fields and duplicate selections', () => {
    const request = createCharacterPortableHostRequest(context, binding, {
      kind: 'import-preview',
    });
    expect(() => parseCharacterPortableHostRequest({ ...request, rawPath: '/tmp/a.zip' })).toThrow(
      'unsupported or missing fields',
    );
    expect(() =>
      parseCharacterPortableHostRequest({
        ...request,
        operation: 'export',
        characterProjectId: 'character-1',
        selection: {
          characterStorylineIds: ['storyline-1', 'storyline-1'],
          authoringTestSnapshotIds: [],
          embeddedRepresentationIds: [],
        },
      }),
    ).toThrow('must be unique');
  });

  it('strictly parses a preview without exposing a source file identity', () => {
    expect(
      parseCharacterPortableHostResult(
        {
          requestId: context.requestId,
          status: 'scope-ready',
          scope: {
            characterProjectId: 'character-1',
            displayName: 'Lin',
            characterVersionIds: [],
            branchHeadCharacterVersionIds: [],
            unlinkedCharacterVersionIds: [],
            characterStorylines: [],
            authoringTestSnapshotIds: [],
            representations: [
              {
                representationId: 'portrait-1',
                kind: 'portrait',
                canEmbed: true,
                ownedFileCount: 1,
                ownedByteLength: 1024,
              },
            ],
          },
        },
        context.requestId,
      ),
    ).toMatchObject({
      status: 'scope-ready',
      scope: { representations: [{ canEmbed: true, ownedByteLength: 1024 }] },
    });
    expect(
      parseCharacterPortableHostResult(
        {
          requestId: context.requestId,
          status: 'preview-ready',
          importReceiptId: 'receipt-1',
          preview: {
            destination: binding.authority,
            characterProjectId: 'character-1',
            displayName: 'Lin',
            characterVersionIds: [],
            branchHeadCharacterVersionIds: [],
            unlinkedCharacterVersionIds: [],
            characterStorylineIds: [],
            embeddedAssets: [],
            externalDependencies: [],
            conflicts: [],
            canCommit: true,
          },
        },
        context.requestId,
      ),
    ).toMatchObject({ status: 'preview-ready', importReceiptId: 'receipt-1' });
    expect(() =>
      parseCharacterPortableHostResult(
        { requestId: context.requestId, status: 'exported', packagePath: '/tmp/a.zip' },
        context.requestId,
      ),
    ).toThrow('unsupported or missing fields');
  });
});
