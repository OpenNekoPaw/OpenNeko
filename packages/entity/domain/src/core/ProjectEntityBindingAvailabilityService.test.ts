import { describe, expect, it, vi } from 'vitest';
import type { ContentLocator, ContentReadOptions, ContentStat } from '@neko/content';
import {
  ProjectEntityBindingAvailabilityService,
  type ProjectEntityBindingResourcePort,
  type ProjectEntityDocument,
} from '../index';

describe('ProjectEntityBindingAvailabilityService', () => {
  it('routes every binding kind to its owner and derives attention without editing facts', async () => {
    const calls: string[] = [];
    const service = new ProjectEntityBindingAvailabilityService({
      workspaceFile: port('workspace-file', calls, ready),
      documentEntry: port('document-entry', calls, unavailable('content-changed')),
      generatedOutput: port('generated-output', calls, unavailable('content-unauthorized')),
      packageResource: port('package-resource', calls, unavailable('content-missing')),
    });
    const before = structuredClone(DOCUMENT);

    await expect(service.project(DOCUMENT, CHECKED_AT)).resolves.toEqual([
      expect.objectContaining({
        bindingId: 'binding-workspace',
        owner: 'workspace-file',
        availability: 'available',
      }),
      expect.objectContaining({
        bindingId: 'binding-document',
        owner: 'document',
        availability: 'needs-attention',
        attention: { diagnostic: { code: 'content-changed' }, action: 'rebind' },
      }),
      expect.objectContaining({
        bindingId: 'binding-generated',
        owner: 'generated-output',
        availability: 'needs-attention',
        attention: { diagnostic: { code: 'content-unauthorized' }, action: 'reconnect' },
      }),
      expect.objectContaining({
        bindingId: 'binding-package',
        owner: 'asset',
        availability: 'needs-attention',
        attention: { diagnostic: { code: 'content-missing' }, action: 'reinstall' },
      }),
    ]);
    expect(calls).toEqual([
      'workspace-file',
      'document-entry',
      'generated-output',
      'package-resource',
    ]);
    expect(DOCUMENT).toEqual(before);
  });

  it('fails visibly when an owner returns a foreign locator', async () => {
    const service = new ProjectEntityBindingAvailabilityService({
      workspaceFile: {
        stat: async () => ready({ kind: 'workspace-file', path: 'other.png' }),
      },
      documentEntry: unusedPort(),
      generatedOutput: unusedPort(),
      packageResource: unusedPort(),
    });
    const document = {
      ...DOCUMENT,
      entities: [{ ...DOCUMENT.entities[0]!, representations: [WORKSPACE] }],
    };

    await expect(service.project(document, CHECKED_AT)).rejects.toMatchObject({
      diagnostics: [{ code: 'project-entity-binding-unavailable', bindingId: 'binding-workspace' }],
    });
  });

  it('propagates cancellation as an operation diagnostic instead of needs-attention', async () => {
    const service = new ProjectEntityBindingAvailabilityService({
      workspaceFile: port('workspace-file', [], unavailable('content-cancelled')),
      documentEntry: unusedPort(),
      generatedOutput: unusedPort(),
      packageResource: unusedPort(),
    });
    const document = {
      ...DOCUMENT,
      entities: [{ ...DOCUMENT.entities[0]!, representations: [WORKSPACE] }],
    };

    await expect(service.project(document, CHECKED_AT)).rejects.toMatchObject({
      diagnostics: [{ code: 'project-entity-operation-cancelled' }],
    });
  });
});

function port<TLocator extends ContentLocator>(
  kind: TLocator['kind'],
  calls: string[],
  result: (locator: TLocator) => ContentStat,
): ProjectEntityBindingResourcePort<TLocator> {
  return {
    stat: vi.fn(async (locator: TLocator, _options: ContentReadOptions) => {
      calls.push(kind);
      return result(locator);
    }),
  };
}

function unusedPort<TLocator>(): ProjectEntityBindingResourcePort<TLocator> {
  return { stat: vi.fn(async () => Promise.reject(new Error('Unexpected binding owner.'))) };
}

function ready(locator: ContentLocator): ContentStat {
  return {
    status: 'ready',
    locator,
    byteLength: 1,
    fingerprint: { strategy: 'sha256', value: 'a'.repeat(64) },
  };
}

function unavailable(
  code: Extract<ContentStat, { status: 'unavailable' }>['diagnostic']['code'],
): (locator: ContentLocator) => ContentStat {
  return (locator) => ({ status: 'unavailable', locator, diagnostic: { code } });
}

const WORKSPACE: ProjectEntityDocument['entities'][number]['representations'][number] = {
  bindingId: 'binding-workspace',
  role: 'portrait',
  target: { kind: 'workspace-file', path: 'rin.png' },
  source: 'user',
  acceptedAt: '2026-08-05T00:00:00.000Z',
};
const DOCUMENT_ENTRY: ProjectEntityDocument['entities'][number]['representations'][number] = {
  bindingId: 'binding-document',
  role: 'reference',
  target: {
    kind: 'document-entry',
    source: { kind: 'workspace-file', path: 'story.epub' },
    entryPath: 'images/rin.png',
  },
  source: 'user',
  acceptedAt: '2026-08-05T00:00:00.000Z',
};
const GENERATED: ProjectEntityDocument['entities'][number]['representations'][number] = {
  bindingId: 'binding-generated',
  role: 'reference',
  target: {
    kind: 'generated-output',
    outputId: 'output-rin',
    revision: '1',
    digest: 'b'.repeat(64),
    path: 'neko/generated/rin.png',
  },
  source: 'agent',
  acceptedAt: '2026-08-05T00:00:00.000Z',
};
const PACKAGE: ProjectEntityDocument['entities'][number]['representations'][number] = {
  bindingId: 'binding-package',
  role: 'live2d',
  target: {
    kind: 'package-resource',
    packageId: 'asset-rin',
    revision: '2',
    digest: 'c'.repeat(64),
    resourcePath: 'model/model.json',
  },
  source: 'import',
  acceptedAt: '2026-08-05T00:00:00.000Z',
};
const DOCUMENT: ProjectEntityDocument = {
  projectId: 'project-neko',
  entities: [
    {
      entityId: 'character-rin',
      kind: 'character',
      names: { canonical: 'Rin', aliases: [] },
      facts: { role: 'lead' },
      representations: [WORKSPACE, DOCUMENT_ENTRY, GENERATED, PACKAGE],
      lifecycle: { state: 'active' },
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    },
  ],
};
const CHECKED_AT = '2026-08-05T02:00:00.000Z';
