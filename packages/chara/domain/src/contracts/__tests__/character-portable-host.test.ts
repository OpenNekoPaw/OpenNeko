import { describe, expect, it } from 'vitest';
import {
  createCharacterPortableHostRequest,
  parseCharacterPortableHostRequest,
  parseCharacterPortableHostResult,
  type CharacterPortableHostBinding,
} from '@neko/chara-domain/contracts';

describe('Character portable Host contract', () => {
  const context = {
    requestId: 'request-1',
    rendererSessionId: 'renderer-1',
    windowId: 'window-1',
  };
  const binding: CharacterPortableHostBinding = {
    workspaceId: 'workspace-1',
    workspaceGrantId: 'grant-1',
    authority: { kind: 'project', projectId: 'project-1' },
  };

  it('creates exact project-local export and direct import requests', () => {
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
          characterVersionId: 'character-version-1',
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
      createCharacterPortableHostRequest(context, undefined, {
        kind: 'import',
        target: { kind: 'new', globalCharacterId: 'global-character-1' },
      }),
    ).toMatchObject({
      operation: 'import',
      target: { kind: 'new', globalCharacterId: 'global-character-1' },
    });
  });

  it('rejects raw paths, extra fields and duplicate selections', () => {
    const request = createCharacterPortableHostRequest(context, undefined, { kind: 'import' });
    expect(() => parseCharacterPortableHostRequest({ ...request, rawPath: '/tmp/a.zip' })).toThrow(
      'unsupported or missing fields',
    );
    expect(() =>
      parseCharacterPortableHostRequest({
        ...createCharacterPortableHostRequest(context, binding, {
          kind: 'export',
          characterProjectId: 'character-1',
          selection: {
            characterVersionId: 'character-version-1',
            embeddedRepresentationIds: [],
          },
        }),
        selection: {
          characterVersionId: 'character-version-1',
          embeddedRepresentationIds: ['portrait-1', 'portrait-1'],
        },
      }),
    ).toThrow('must be unique');
    expect(() =>
      parseCharacterPortableHostRequest({
        ...request,
        authority: { kind: 'standalone-library' },
      }),
    ).toThrow();
    expect(() =>
      parseCharacterPortableHostRequest({
        ...request,
        authority: { kind: 'content-project', contentProjectId: 'project-1' },
      }),
    ).toThrow();
  });

  it('strictly parses an imported result without exposing a source file identity', () => {
    expect(
      parseCharacterPortableHostResult(
        {
          requestId: context.requestId,
          status: 'scope-ready',
          scope: {
            characterProjectId: 'character-1',
            displayName: 'Lin',
            characterVersionIds: [],
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
          status: 'imported',
          globalCharacterId: 'global-character-1',
        },
        context.requestId,
      ),
    ).toMatchObject({ status: 'imported', globalCharacterId: 'global-character-1' });
    expect(() =>
      parseCharacterPortableHostResult(
        { requestId: context.requestId, status: 'exported', packagePath: '/tmp/a.zip' },
        context.requestId,
      ),
    ).toThrow('unsupported or missing fields');
  });
});
