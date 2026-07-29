import { describe, expect, it } from 'vitest';
import {
  createDesktopHomeAssetSearchRequest,
  createDesktopHomePluginsRequest,
  parseDesktopHomeAssetSearchRequest,
  parseDesktopHomeAssetSearchResult,
  parseDesktopHomePluginsResult,
} from './home-management-contract';

describe('Desktop Home management contract', () => {
  it('requires explicit Project identity and bounded asset queries', () => {
    const request = createDesktopHomeAssetSearchRequest('request-1', {
      projectId: 'project-1',
      facet: 'media',
      query: 'video',
      limit: 40,
    });

    expect(parseDesktopHomeAssetSearchRequest(request)).toEqual(request);
    expect(() =>
      parseDesktopHomeAssetSearchRequest({ ...request, projectId: '' }),
    ).toThrow('projectId');
    expect(() =>
      parseDesktopHomeAssetSearchRequest({ ...request, limit: 201 }),
    ).toThrow('between 1 and 200');
  });

  it('parses project-scoped diagnostics instead of converting failures to empty success', () => {
    expect(
      parseDesktopHomeAssetSearchResult(
        {
          schemaVersion: 1,
          requestId: 'request-1',
          projectId: 'project-1',
          facet: 'entities',
          status: 'error',
          diagnostic: { message: 'Entity data is malformed.' },
        },
        'request-1',
      ),
    ).toMatchObject({
      status: 'error',
      diagnostic: { message: 'Entity data is malformed.' },
    });
  });

  it('accepts only sanitized Skill records and explicit Plugin Host availability', () => {
    const request = createDesktopHomePluginsRequest('request-2', 'project-1');
    const result = parseDesktopHomePluginsResult(
      {
        schemaVersion: 1,
        requestId: request.requestId,
        projectId: request.projectId,
        skills: [
          {
            name: 'story-planner',
            description: 'Plan a story.',
            source: 'project',
            trusted: true,
            enabled: true,
          },
        ],
        extensions: [],
        externalPluginHost: 'unavailable',
      },
      request.requestId,
    );

    expect(result.skills[0]).toEqual({
      name: 'story-planner',
      description: 'Plan a story.',
      source: 'project',
      trusted: true,
      enabled: true,
    });
    expect(result.skills[0]).not.toHaveProperty('locator');
    expect(result.skills[0]).not.toHaveProperty('fingerprint');
    expect(result.externalPluginHost).toBe('unavailable');
  });
});
