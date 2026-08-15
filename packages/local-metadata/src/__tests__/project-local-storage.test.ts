import { describe, expect, it } from 'vitest';
import {
  assertProjectPortablePath,
  decideProjectTraversal,
  readProjectLocalJsonRecord,
  type ProjectLocalRecordCodec,
} from '../index';

interface LocalRecord {
  readonly selected: string | null;
}

function createCodec(
  relativePath: string,
  kind: 'presentation' | 'cache' = 'presentation',
): ProjectLocalRecordCodec<LocalRecord> {
  return {
    owner: '@neko/test-owner',
    kind,
    relativePath,
    createDefault: () => ({ selected: null }),
    parse: (value) => {
      if (
        typeof value !== 'object' ||
        value === null ||
        !('selected' in value) ||
        (value.selected !== null && typeof value.selected !== 'string')
      ) {
        throw new TypeError('selected must be a string or null');
      }
      return { selected: value.selected };
    },
  };
}

describe('project-local record initialization', () => {
  it.each([
    ['presentation', '.neko/presentation/canvas/view.json'],
    ['cache', '.neko/cache/search/results.json'],
  ] as const)('initializes absent %s state from its owner default', (kind, relativePath) => {
    expect(readProjectLocalJsonRecord(null, createCodec(relativePath, kind))).toEqual({
      status: 'initialized',
      value: { selected: null },
      diagnostic: null,
    });
  });

  it('isolates one malformed record and leaves valid siblings and unknown files untouched', () => {
    const localFiles = new Map([
      ['.neko/presentation/test/valid.json', '{"selected":"entry-a"}'],
      ['.neko/presentation/test/invalid.json', '{not-json'],
      ['.neko/presentation/test/future-owner.bin', 'opaque future bytes'],
    ]);
    const before = new Map(localFiles);

    const valid = readProjectLocalJsonRecord(
      localFiles.get('.neko/presentation/test/valid.json') ?? null,
      createCodec('.neko/presentation/test/valid.json'),
    );
    const invalid = readProjectLocalJsonRecord(
      localFiles.get('.neko/presentation/test/invalid.json') ?? null,
      createCodec('.neko/presentation/test/invalid.json'),
    );

    expect(valid).toEqual({
      status: 'available',
      value: { selected: 'entry-a' },
      diagnostic: null,
    });
    expect(invalid).toMatchObject({
      status: 'invalid',
      value: { selected: null },
      diagnostic: {
        code: 'project-local-record-invalid',
        relativePath: '.neko/presentation/test/invalid.json',
      },
    });
    expect(localFiles).toEqual(before);
  });

  it('cannot synthesize or mutate synchronized facts when all local state is absent', () => {
    const projectFacts = new Map([
      ['neko/project.json', '{"workspaceId":"9b2de3b5-5f50-4be4-9551-71fb5b512489"}'],
      ['neko/entities/entity-a.json', '{"name":"A"}'],
    ]);
    const before = new Map(projectFacts);

    readProjectLocalJsonRecord(null, createCodec('.neko/presentation/test/view.json'));
    readProjectLocalJsonRecord(
      null,
      createCodec('.neko/presentation/canvas/view.json', 'presentation'),
    );
    readProjectLocalJsonRecord(null, createCodec('.neko/cache/search/results.json', 'cache'));

    expect(projectFacts).toEqual(before);
  });

  it('rejects identity and owner records outside their exact local roots', () => {
    expect(() => readProjectLocalJsonRecord(null, createCodec('.neko/workspace.json'))).toThrow(
      'must be owned below .neko/presentation/',
    );
    expect(() =>
      readProjectLocalJsonRecord(null, createCodec('neko/settings.json', 'presentation')),
    ).toThrow('must be owned below .neko/presentation/');
  });
});

describe('project transfer traversal', () => {
  it.each(['sync', 'package', 'enumerate'] as const)(
    'excludes root .neko before %s traversal without Git state',
    (operation) => {
      expect(decideProjectTraversal('.neko', 'directory', operation)).toMatchObject({
        action: 'exclude-project-local',
        traverse: false,
        followSymbolicLink: false,
      });
      expect(decideProjectTraversal('.neko', 'symbolic-link', operation)).toMatchObject({
        action: 'exclude-project-local',
        traverse: false,
        followSymbolicLink: false,
      });
      expect(decideProjectTraversal('.neko/private/credential', 'file', operation)).toMatchObject({
        action: 'exclude-project-local',
        traverse: false,
      });
    },
  );

  it('keeps synchronized facts and ordinary project content visitable', () => {
    expect(decideProjectTraversal('neko/project.json', 'file', 'sync')).toMatchObject({
      action: 'visit',
      traverse: false,
    });
    expect(decideProjectTraversal('media/shot.mov', 'file', 'package')).toMatchObject({
      action: 'visit',
      traverse: false,
    });
  });

  it.each(['sync', 'package', 'enumerate'] as const)(
    'never follows a managed Media Library link during %s traversal',
    (operation) => {
      expect(
        decideProjectTraversal('neko/assets/Footage', 'symbolic-link', operation),
      ).toMatchObject({
        action: 'visit',
        traverse: false,
        followSymbolicLink: false,
      });
    },
  );

  it('rejects project-local and unsafe paths from portable output', () => {
    expect(() => assertProjectPortablePath('.neko/media-libraries/a.json')).toThrow(
      'cannot enter synchronized or packaged output',
    );
    expect(() => assertProjectPortablePath('../escape')).toThrow('invalid segment');
    expect(() => assertProjectPortablePath('/absolute')).toThrow('must be relative');
  });
});
