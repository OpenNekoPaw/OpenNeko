import { describe, expect, it } from 'vitest';
import {
  DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
  createDesktopHomeAssetImportRequest,
  createDesktopHomeAssetRemoveRequest,
  createDesktopHomeAssetSearchRequest,
  createDesktopHomeLibraryThumbnailRequest,
  createDesktopHomeMediaLibraryAddRequest,
  createDesktopHomeMediaLibraryChildrenRequest,
  createDesktopHomeMediaLibraryRequest,
  createDesktopHomeMediaLibrarySearchRequest,
  createDesktopHomeExtensionsRequest,
  parseDesktopHomeAssetSearchRequest,
  parseDesktopHomeAssetSearchResult,
  parseDesktopHomeAssetImportRequest,
  parseDesktopHomeAssetImportResult,
  parseDesktopHomeAssetRemoveRequest,
  parseDesktopHomeAssetRemoveResult,
  parseDesktopHomeLibraryThumbnailRequest,
  parseDesktopHomeLibraryThumbnailResult,
  parseDesktopHomeMediaLibraryAddRequest,
  parseDesktopHomeMediaLibraryAddResult,
  parseDesktopHomeMediaLibraryChildrenRequest,
  parseDesktopHomeMediaLibraryRemoveResult,
  parseDesktopHomeMediaLibraryRequest,
  parseDesktopHomeMediaLibraryRevealResult,
  parseDesktopHomeMediaLibrarySearchRequest,
  parseDesktopHomeMediaLibrarySearchResult,
  parseDesktopHomeExtensionsRequest,
  parseDesktopHomeExtensionsResult,
} from './home-management-contract';

const endpointEpoch = 'app-1:window-1:1';

describe('Desktop Home management contract', () => {
  it('keeps Asset Library queries independent from Media Library facets', () => {
    const request = createDesktopHomeAssetSearchRequest('asset-request', endpointEpoch, {
      query: 'video',
      sortBy: 'modifiedAt',
      sortDirection: 'descending',
      limit: 40,
    });

    expect(parseDesktopHomeAssetSearchRequest(request)).toEqual(request);
    expect(() => parseDesktopHomeAssetSearchRequest({ ...request, facet: 'libraries' })).toThrow(
      'invalid',
    );
    const { endpointEpoch: _endpointEpoch, ...requestWithoutEndpoint } = request;
    expect(() => parseDesktopHomeAssetSearchRequest(requestWithoutEndpoint)).toThrow(
      'endpoint epoch is required',
    );
    expect(() => parseDesktopHomeAssetSearchRequest({ ...request, schemaVersion: 4 })).toThrow(
      'unsupported',
    );
  });

  it('accepts exact v7 Media Library connection requests and rejects v6 copy payloads', () => {
    const search = createDesktopHomeMediaLibrarySearchRequest('search-1', endpointEpoch, {
      query: '',
      sortBy: 'name',
      sortDirection: 'ascending',
    });
    const add = createDesktopHomeMediaLibraryAddRequest('add-1', endpointEpoch, 'nas', 2);
    const library = createDesktopHomeMediaLibraryRequest(
      'remove-1',
      endpointEpoch,
      'media-library:nas:Footage',
      2,
    );
    const children = createDesktopHomeMediaLibraryChildrenRequest('children-1', endpointEpoch, {
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
        schemaVersion: 6,
        requestId: 'add-1',
      }),
    ).toThrow('unsupported');
    expect(() =>
      parseDesktopHomeMediaLibraryRequest({
        ...library,
        absolutePath: '/Volumes/private/Footage',
      }),
    ).toThrow('invalid');
    expect(() =>
      createDesktopHomeMediaLibraryRequest('remove-1', endpointEpoch, 'library:Footage', 2),
    ).toThrow('invalid');
    expect(() =>
      createDesktopHomeMediaLibraryChildrenRequest('children-2', endpointEpoch, {
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
        revision: 3,
        items: [
          {
            id: 'media-library:abc123',
            owner: 'media-library',
            libraryId: 'media-library:cloud:References',
            libraryLabel: 'References',
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
          revision: 3,
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
          revision: 2,
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
          revision: 3,
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
          revision: 4,
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
          revision: 4,
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

  it('accepts exact Asset import/remove and thumbnail contracts without physical paths', () => {
    const importRequest = createDesktopHomeAssetImportRequest(
      'asset-import-1',
      endpointEpoch,
      4,
    );
    const removeRequest = createDesktopHomeAssetRemoveRequest(
      'asset-remove-1',
      endpointEpoch,
      'asset-library:abc123',
      4,
    );
    const thumbnailRequest = createDesktopHomeLibraryThumbnailRequest(
      'thumbnail-1',
      endpointEpoch,
      {
        owner: 'asset-library',
        itemId: 'asset-library:abc123',
        expectedCatalogRevision: 4,
        descriptorId: 'asset-library:def456',
        thumbnailRevision: '2026-07-31T00:00:00.000Z:42',
        variant: 'hover',
      },
    );

    expect(parseDesktopHomeAssetImportRequest(importRequest)).toEqual(importRequest);
    expect(parseDesktopHomeAssetRemoveRequest(removeRequest)).toEqual(removeRequest);
    expect(parseDesktopHomeLibraryThumbnailRequest(thumbnailRequest)).toEqual(thumbnailRequest);
    expect(
      parseDesktopHomeAssetImportResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'asset-import-1',
          status: 'completed',
          revision: 5,
          outcomes: [
            { status: 'added', label: 'Hero.png', assetId: 'asset-library:abc123' },
            { status: 'conflict', label: 'Existing.png', diagnostic: 'Asset already exists.' },
          ],
        },
        'asset-import-1',
      ),
    ).toMatchObject({ status: 'completed', revision: 5 });
    expect(
      parseDesktopHomeAssetRemoveResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'asset-remove-1',
          status: 'removed',
          assetId: 'asset-library:abc123',
          revision: 6,
        },
        'asset-remove-1',
      ),
    ).toMatchObject({ status: 'removed', revision: 6 });
    expect(
      parseDesktopHomeLibraryThumbnailResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: thumbnailRequest.requestId,
          owner: thumbnailRequest.owner,
          itemId: thumbnailRequest.itemId,
          expectedCatalogRevision: thumbnailRequest.expectedCatalogRevision,
          descriptorId: thumbnailRequest.descriptorId,
          thumbnailRevision: thumbnailRequest.thumbnailRevision,
          variant: thumbnailRequest.variant,
          dataUrl: 'data:image/png;base64,AA==',
        },
        'thumbnail-1',
      ),
    ).toMatchObject({ variant: 'hover' });
    expect(() =>
      parseDesktopHomeAssetRemoveRequest({ ...removeRequest, absolutePath: '/private/Hero.png' }),
    ).toThrow('invalid');
  });

  it('parses revisioned Asset Library items owned only by the Asset Library', () => {
    expect(
      parseDesktopHomeAssetSearchResult(
        {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: 'asset-search-1',
          status: 'ready',
          revision: 2,
          items: [
            {
              id: 'asset-library:abc123',
              owner: 'asset-library',
              label: 'Hero.png',
              kind: 'asset',
              mediaType: 'image',
              byteLength: 42,
              modifiedAt: '2026-07-31T00:00:00.000Z',
              availability: 'available',
              thumbnail: {
                descriptorId: 'asset-library:def456',
                revision: '2026-07-31T00:00:00.000Z:42',
                mediaType: 'image',
              },
            },
          ],
        },
        'asset-search-1',
      ),
    ).toMatchObject({ status: 'ready', revision: 2 });
  });

  it('accepts only sanitized global Skill and extension manifest projections', () => {
    const request = createDesktopHomeExtensionsRequest('request-2', 'endpoint-1');
    expect(parseDesktopHomeExtensionsRequest(request)).toEqual(request);

    const result = parseDesktopHomeExtensionsResult(
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
        extensions: [
          {
            id: 'computer-use@openai-bundled',
            name: 'computer-use',
            displayName: 'Computer Use',
            description: 'Control Mac apps.',
            version: '1.0.2',
            developer: 'OpenAI',
            marketplace: 'openai-bundled',
            mcpServerIds: ['computer-use'],
            hasSkills: true,
            appIds: [],
          },
        ],
        extensionDiscovery: {
          diagnostics: [{ code: 'package_missing', count: 1 }],
        },
      },
      request.requestId,
    );

    expect(result.skills[0]).toEqual({
      name: 'story-planner',
      description: 'Plan a story.',
      source: 'personal',
    });
    expect(result.extensions[0]).toMatchObject({
      id: 'computer-use@openai-bundled',
      mcpServerIds: ['computer-use'],
      hasSkills: true,
    });
    expect(result.skills[0]).not.toHaveProperty('locator');
    expect(JSON.stringify(result)).not.toContain('ownerSlice');
    expect(JSON.stringify(result)).not.toContain('command');
  });

  it('rejects unsafe Skill discovery diagnostics', () => {
    const request = createDesktopHomeExtensionsRequest('request-3', 'endpoint-1');
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
      extensions: [],
      extensionDiscovery: { diagnostics: [] },
    };
    expect(() => parseDesktopHomeExtensionsResult(payload, request.requestId)).toThrow(
      'diagnostic',
    );
  });

  it('rejects removed capability payloads and unsafe extension fields', () => {
    const request = createDesktopHomeExtensionsRequest('request-4', 'endpoint-1');
    const base = {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: request.requestId,
      skills: [],
      skillDiscovery: { diagnostics: [], duplicateCount: 0 },
      extensionDiscovery: { diagnostics: [] },
    };

    expect(() =>
      parseDesktopHomeExtensionsResult(
        {
          ...base,
          capabilities: [{ id: 'canvas', status: 'ready' }],
        },
        request.requestId,
      ),
    ).toThrow('invalid');
    expect(() =>
      parseDesktopHomeExtensionsResult(
        {
          ...base,
          extensions: [
            {
              id: 'computer-use@openai-bundled',
              name: 'computer-use',
              displayName: 'Computer Use',
              description: 'Control Mac apps.',
              version: '1.0.2',
              developer: 'OpenAI',
              marketplace: 'openai-bundled',
              mcpServerIds: ['computer-use'],
              hasSkills: true,
              appIds: [],
              command: './private-launcher',
            },
          ],
        },
        request.requestId,
      ),
    ).toThrow('invalid');
  });
});
