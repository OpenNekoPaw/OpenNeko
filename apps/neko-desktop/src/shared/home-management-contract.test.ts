import { describe, expect, it } from 'vitest';
import {
  DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
  createDesktopHomeAssetAddLibraryRequest,
  createDesktopHomeAssetLibraryRequest,
  createDesktopHomeAssetSearchRequest,
  createDesktopHomePluginsRequest,
  parseDesktopHomeAssetAddLibraryRequest,
  parseDesktopHomeAssetAddLibraryResult,
  parseDesktopHomeAssetLibraryRequest,
  parseDesktopHomeAssetRemoveLibraryResult,
  parseDesktopHomeAssetRevealLibraryResult,
  parseDesktopHomeAssetSearchRequest,
  parseDesktopHomeAssetSearchResult,
  parseDesktopHomePluginsRequest,
  parseDesktopHomePluginsResult,
} from './home-management-contract';

describe('Desktop Home management contract', () => {
  it('accepts only project-free bounded global asset queries with explicit sorting', () => {
    const request = createDesktopHomeAssetSearchRequest('request-1', {
      facet: 'assets',
      query: 'video',
      sortBy: 'modifiedAt',
      sortDirection: 'descending',
      limit: 40,
    });

    expect(parseDesktopHomeAssetSearchRequest(request)).toEqual(request);
    expect(() =>
      parseDesktopHomeAssetSearchRequest({ ...request, projectId: 'content:workspace-1' }),
    ).toThrow('invalid');
    expect(() => parseDesktopHomeAssetSearchRequest({ ...request, schemaVersion: 2 })).toThrow(
      'unsupported',
    );
    expect(() => parseDesktopHomeAssetSearchRequest({ ...request, limit: 201 })).toThrow(
      'between 1 and 200',
    );
  });

  it('accepts exact v4 media-library mutation requests and rejects legacy payloads', () => {
    const add = createDesktopHomeAssetAddLibraryRequest('add-1');
    const library = createDesktopHomeAssetLibraryRequest('remove-1', 'library:Footage');

    expect(parseDesktopHomeAssetAddLibraryRequest(add)).toEqual(add);
    expect(parseDesktopHomeAssetLibraryRequest(library)).toEqual(library);
    expect(() => parseDesktopHomeAssetAddLibraryRequest({ ...add, schemaVersion: 3 })).toThrow(
      'unsupported',
    );
    expect(() =>
      parseDesktopHomeAssetLibraryRequest({ ...library, absolutePath: '/private/Footage' }),
    ).toThrow('invalid');
    expect(() => createDesktopHomeAssetLibraryRequest('remove-1', 'asset:Footage')).toThrow(
      'invalid',
    );
    expect(() => createDesktopHomeAssetLibraryRequest('remove-1', 'library:../Footage')).toThrow(
      'invalid',
    );
  });

  it('parses only request-matched media-library mutation results', () => {
    expect(
      parseDesktopHomeAssetAddLibraryResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'add-1',
          status: 'cancelled',
        },
        'add-1',
      ),
    ).toMatchObject({ status: 'cancelled' });
    expect(
      parseDesktopHomeAssetAddLibraryResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'add-2',
          status: 'added',
          libraryId: 'library:Footage',
        },
        'add-2',
      ),
    ).toMatchObject({ status: 'added', libraryId: 'library:Footage' });
    expect(
      parseDesktopHomeAssetRemoveLibraryResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'remove-1',
          status: 'removed',
          libraryId: 'library:Footage',
        },
        'remove-1',
      ),
    ).toMatchObject({ status: 'removed' });
    expect(
      parseDesktopHomeAssetRevealLibraryResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'reveal-1',
          status: 'revealed',
          libraryId: 'library:Footage',
        },
        'reveal-1',
      ),
    ).toMatchObject({ status: 'revealed' });
    expect(() =>
      parseDesktopHomeAssetRemoveLibraryResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'remove-2',
          status: 'removed',
          libraryId: 'library:Footage',
        },
        'remove-1',
      ),
    ).toThrow('does not match');
  });

  it('parses global diagnostics without Project or Workspace identity', () => {
    expect(
      parseDesktopHomeAssetSearchResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'request-1',
          facet: 'assets',
          status: 'error',
          diagnostic: { message: 'Global asset root is unreadable.' },
        },
        'request-1',
      ),
    ).toEqual({
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: 'request-1',
      facet: 'assets',
      status: 'error',
      diagnostic: { message: 'Global asset root is unreadable.' },
    });
    expect(() =>
      parseDesktopHomeAssetSearchResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'request-1',
          projectId: 'content:workspace-1',
          facet: 'assets',
          status: 'ready',
          items: [],
        },
        'request-1',
      ),
    ).toThrow('invalid');
  });

  it('accepts only sanitized global Skill and plugin records', () => {
    const request = createDesktopHomePluginsRequest('request-2');
    expect(parseDesktopHomePluginsRequest(request)).toEqual(request);
    expect(() =>
      parseDesktopHomePluginsRequest({ ...request, projectId: 'content:workspace-1' }),
    ).toThrow('invalid');

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
    expect(result.skills[0]).not.toHaveProperty('fingerprint');
    expect(result.skills[0]).not.toHaveProperty('trusted');
    expect(result.skills[0]).not.toHaveProperty('enabled');
    expect(result.externalPluginHost).toBe('unavailable');
  });

  it('rejects project Skills and unsafe discovery diagnostics', () => {
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
    expect(() =>
      parseDesktopHomePluginsResult(
        {
          ...payload,
          skillDiscovery: { diagnostics: [], duplicateCount: 0 },
          skills: [{ name: 'project-only', description: '', source: 'project' }],
        },
        request.requestId,
      ),
    ).toThrow('source');
  });
});
