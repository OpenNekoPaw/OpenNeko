import { describe, expect, it } from 'vitest';
import {
  DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
  createDesktopHomeAssetSearchRequest,
  createDesktopHomeMediaLibraryAddRequest,
  createDesktopHomeMediaLibraryChildrenRequest,
  createDesktopHomeMediaLibraryRequest,
  createDesktopHomeMediaLibrarySearchRequest,
  createDesktopHomePluginsRequest,
  parseDesktopHomeAssetSearchRequest,
  parseDesktopHomeAssetSearchResult,
  parseDesktopHomeMediaLibraryAddRequest,
  parseDesktopHomeMediaLibraryAddResult,
  parseDesktopHomeMediaLibraryChildrenRequest,
  parseDesktopHomeMediaLibraryRemoveResult,
  parseDesktopHomeMediaLibraryRequest,
  parseDesktopHomeMediaLibraryRevealResult,
  parseDesktopHomeMediaLibrarySearchRequest,
  parseDesktopHomeMediaLibrarySearchResult,
  parseDesktopHomePluginsRequest,
  parseDesktopHomePluginsResult,
} from './home-management-contract';

describe('Desktop Home management contract', () => {
  it('keeps Asset Library queries independent from Media Library facets', () => {
    const request = createDesktopHomeAssetSearchRequest('asset-request', {
      query: 'video',
      sortBy: 'modifiedAt',
      sortDirection: 'descending',
      limit: 40,
    });

    expect(parseDesktopHomeAssetSearchRequest(request)).toEqual(request);
    expect(() => parseDesktopHomeAssetSearchRequest({ ...request, facet: 'libraries' })).toThrow(
      'invalid',
    );
    expect(() => parseDesktopHomeAssetSearchRequest({ ...request, schemaVersion: 4 })).toThrow(
      'unsupported',
    );
  });

  it('accepts exact v5 Media Library connection requests and rejects v4 copy payloads', () => {
    const search = createDesktopHomeMediaLibrarySearchRequest('search-1', {
      query: '',
      sortBy: 'name',
      sortDirection: 'ascending',
    });
    const add = createDesktopHomeMediaLibraryAddRequest('add-1', 'nas');
    const library = createDesktopHomeMediaLibraryRequest('remove-1', 'media-library:nas:Footage');
    const children = createDesktopHomeMediaLibraryChildrenRequest('children-1', {
      libraryId: library.libraryId,
      relativePath: 'shots/day-1',
      sortBy: 'name',
      sortDirection: 'ascending',
    });

    expect(parseDesktopHomeMediaLibrarySearchRequest(search)).toEqual(search);
    expect(parseDesktopHomeMediaLibraryAddRequest(add)).toEqual(add);
    expect(parseDesktopHomeMediaLibraryRequest(library)).toEqual(library);
    expect(parseDesktopHomeMediaLibraryChildrenRequest(children)).toEqual(children);
    expect(() =>
      parseDesktopHomeMediaLibraryAddRequest({
        schemaVersion: 4,
        requestId: 'add-1',
      }),
    ).toThrow('unsupported');
    expect(() =>
      parseDesktopHomeMediaLibraryRequest({
        ...library,
        absolutePath: '/Volumes/private/Footage',
      }),
    ).toThrow('invalid');
    expect(() => createDesktopHomeMediaLibraryRequest('remove-1', 'library:Footage')).toThrow(
      'invalid',
    );
    expect(() =>
      createDesktopHomeMediaLibraryChildrenRequest('children-2', {
        ...children,
        relativePath: '../private',
      }),
    ).toThrow('invalid');
  });

  it('parses Media Library results without accepting target paths', () => {
    const result = parseDesktopHomeMediaLibrarySearchResult(
      {
        schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
        requestId: 'search-1',
        status: 'ready',
        items: [
          {
            id: 'media-library:cloud:References:root',
            libraryId: 'media-library:cloud:References',
            label: 'References',
            kind: 'library',
            locationKind: 'cloud',
            relativePath: '',
            availability: 'available',
          },
        ],
      },
      'search-1',
    );
    expect(result).toMatchObject({
      status: 'ready',
      items: [{ locationKind: 'cloud', kind: 'library' }],
    });
    if (result.status !== 'ready') throw new Error('Expected ready Media Library result.');
    expect(() =>
      parseDesktopHomeMediaLibrarySearchResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'search-1',
          status: 'ready',
          items: [
            {
              ...result.items[0],
              targetPath: '/Users/private/Cloud',
            },
          ],
        },
        'search-1',
      ),
    ).toThrow('invalid');
  });

  it('parses only request-matched Media Library mutation results', () => {
    expect(
      parseDesktopHomeMediaLibraryAddResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'add-1',
          status: 'cancelled',
        },
        'add-1',
      ),
    ).toMatchObject({ status: 'cancelled' });
    expect(
      parseDesktopHomeMediaLibraryAddResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'add-2',
          status: 'added',
          libraryId: 'media-library:local:Footage',
        },
        'add-2',
      ),
    ).toMatchObject({ status: 'added', libraryId: 'media-library:local:Footage' });
    expect(
      parseDesktopHomeMediaLibraryRemoveResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'remove-1',
          status: 'removed',
          libraryId: 'media-library:local:Footage',
        },
        'remove-1',
      ),
    ).toMatchObject({ status: 'removed' });
    expect(
      parseDesktopHomeMediaLibraryRevealResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'reveal-1',
          status: 'revealed',
          libraryId: 'media-library:nas:Footage',
        },
        'reveal-1',
      ),
    ).toMatchObject({ status: 'revealed' });
  });

  it('parses Asset Library diagnostics without Media Library identity', () => {
    expect(
      parseDesktopHomeAssetSearchResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'request-1',
          status: 'error',
          diagnostic: { message: 'Global asset root is unreadable.' },
        },
        'request-1',
      ),
    ).toMatchObject({
      status: 'error',
      diagnostic: { message: 'Global asset root is unreadable.' },
    });
  });

  it('accepts only sanitized global Skill and plugin records', () => {
    const request = createDesktopHomePluginsRequest('request-2');
    expect(parseDesktopHomePluginsRequest(request)).toEqual(request);

    const result = parseDesktopHomePluginsResult(
      {
        schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
        requestId: request.requestId,
        skills: [
          {
            name: 'story-planner',
            description: 'Plan a story.',
            source: 'personal',
          },
        ],
        skillDiscovery: {
          diagnostics: [{ code: 'invalid_metadata', source: 'personal', count: 2 }],
          duplicateCount: 1,
        },
        plugins: [
          {
            id: 'canvas',
            name: 'Canvas',
            description: 'Built-in creative surface',
            kind: 'builtin',
            status: 'ready',
          },
        ],
        externalPluginHost: 'unavailable',
      },
      request.requestId,
    );

    expect(result.skills[0]).toEqual({
      name: 'story-planner',
      description: 'Plan a story.',
      source: 'personal',
    });
    expect(result.plugins[0]).toMatchObject({ id: 'canvas', kind: 'builtin', status: 'ready' });
    expect(result.skills[0]).not.toHaveProperty('locator');
    expect(result.externalPluginHost).toBe('unavailable');
  });

  it('rejects unsafe Skill discovery diagnostics', () => {
    const request = createDesktopHomePluginsRequest('request-3');
    const payload = {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: request.requestId,
      skills: [],
      skillDiscovery: {
        diagnostics: [
          {
            code: 'invalid_metadata',
            source: 'personal',
            count: 1,
            path: '/Users/private/.agents/skills/broken/SKILL.md',
          },
        ],
        duplicateCount: 0,
      },
      plugins: [],
      externalPluginHost: 'unavailable',
    };
    expect(() => parseDesktopHomePluginsResult(payload, request.requestId)).toThrow('diagnostic');
  });
});
