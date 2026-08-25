import { describe, expect, it } from 'vitest';

import {
  parseWorldPortableHostRequest,
  parseWorldPortableHostResult,
} from '../world-portable-host';

describe('World portable Host contracts', () => {
  it('keeps export sender-bound and excludes paths and archive bytes', () => {
    const request = parseWorldPortableHostRequest({
      requestId: 'request-1',
      rendererSessionId: 'renderer-1',
      windowId: 'window-1',
      operation: 'export',
      binding: binding(),
      selection: {
        worldProjectId: 'world-1',
        worldVersionId: 'version-1',
        embeddedResourceIds: [],
      },
    });

    expect(request).not.toHaveProperty('archiveBytes');
    expect(request).not.toHaveProperty('sourcePath');
    expect(request).not.toHaveProperty('destinationPath');
    expect(() => parseWorldPortableHostRequest({ ...request, archiveBytes: [1, 2, 3] })).toThrow(
      'unsupported fields',
    );
  });

  it('accepts one direct import with an optional exact target', () => {
    expect(
      parseWorldPortableHostRequest({
        requestId: 'request-2',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        operation: 'import',
        target: { kind: 'new', globalWorldId: 'global-world-1' },
      }),
    ).toMatchObject({ operation: 'import', target: { globalWorldId: 'global-world-1' } });
  });

  it('parses a completed import and rejects another request identity', () => {
    const value = {
      requestId: 'request-3',
      status: 'completed',
      result: {
        kind: 'import-completed',
        worldProjectId: 'world-1',
        worldVersionId: 'version-1',
      },
    };
    expect(parseWorldPortableHostResult(value, 'request-3')).toMatchObject({
      status: 'completed',
      result: { kind: 'import-completed' },
    });
    expect(() => parseWorldPortableHostResult(value, 'request-other')).toThrow('request mismatch');
  });
});

function binding() {
  return {
    workspaceId: 'workspace-1',
    workspaceGrantId: 'grant-1',
    authority: { kind: 'project' as const, projectId: 'project-1' },
  };
}
