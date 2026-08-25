import { describe, expect, it, vi } from 'vitest';
import type { ContentLocator, ContentReadOptions, ContentStat } from '@neko/content-domain';
import {
  ProjectEntityBindingAvailabilityService,
  type ProjectEntityBindingResourcePort,
  type ProjectEntityDocument,
} from '../index';

describe('ProjectEntityBindingAvailabilityService', () => {
  it('checks every binding through the canonical Content port and derives owner semantics', async () => {
    const calls: ContentLocator[] = [];
    const content: ProjectEntityBindingResourcePort = {
      stat: vi.fn(async (locator: ContentLocator, _options: ContentReadOptions) => {
        calls.push(locator);
        if (locator.file.authority === 'package') return unavailable(locator, 'content-missing');
        if (locator.selector) return unavailable(locator, 'content-changed');
        if (locator.file.path === 'neko/generated/rin.png') {
          return unavailable(locator, 'content-unauthorized');
        }
        return ready(locator);
      }),
    };
    const service = new ProjectEntityBindingAvailabilityService({ content });
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
        owner: 'workspace-file',
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
    expect(calls).toEqual(DOCUMENT.entities[0]?.representations.map(({ target }) => target));
    expect(content.stat).toHaveBeenCalledTimes(4);
    expect(DOCUMENT).toEqual(before);
  });

  it('fails visibly when Content returns a foreign locator', async () => {
    const service = new ProjectEntityBindingAvailabilityService({
      content: {
        stat: async () => ready({ file: { authority: 'workspace', path: 'other.png' } }),
      },
    });
    const document = documentWithOnly(WORKSPACE);

    await expect(service.project(document, CHECKED_AT)).rejects.toMatchObject({
      diagnostics: [{ code: 'project-entity-binding-unavailable', bindingId: 'binding-workspace' }],
    });
  });

  it('propagates cancellation as an operation diagnostic instead of needs-attention', async () => {
    const service = new ProjectEntityBindingAvailabilityService({
      content: {
        stat: async (locator) => unavailable(locator, 'content-cancelled'),
      },
    });

    await expect(service.project(documentWithOnly(WORKSPACE), CHECKED_AT)).rejects.toMatchObject({
      diagnostics: [{ code: 'project-entity-operation-cancelled' }],
    });
  });
});

function ready(locator: ContentLocator): ContentStat {
  return {
    status: 'ready',
    locator,
    byteLength: 1,
    fingerprint: { strategy: 'sha256', value: 'a'.repeat(64) },
  };
}

function unavailable(
  locator: ContentLocator,
  code: Extract<ContentStat, { status: 'unavailable' }>['diagnostic']['code'],
): ContentStat {
  return { status: 'unavailable', locator, diagnostic: { code } };
}

function documentWithOnly(
  binding: ProjectEntityDocument['entities'][number]['representations'][number],
): ProjectEntityDocument {
  return {
    ...DOCUMENT,
    entities: [{ ...DOCUMENT.entities[0]!, representations: [binding] }],
  };
}

const WORKSPACE: ProjectEntityDocument['entities'][number]['representations'][number] = {
  bindingId: 'binding-workspace',
  role: 'portrait',
  target: { file: { authority: 'workspace', path: 'rin.png' } },
  source: 'user',
  acceptedAt: '2026-08-05T00:00:00.000Z',
};
const DOCUMENT_ENTRY: ProjectEntityDocument['entities'][number]['representations'][number] = {
  bindingId: 'binding-document',
  role: 'reference',
  target: {
    file: { authority: 'workspace', path: 'story.epub' },
    selector: { kind: 'entry', path: 'images/rin.png' },
  },
  source: 'user',
  acceptedAt: '2026-08-05T00:00:00.000Z',
};
const GENERATED: ProjectEntityDocument['entities'][number]['representations'][number] = {
  bindingId: 'binding-generated',
  role: 'reference',
  target: { file: { authority: 'workspace', path: 'neko/generated/rin.png' } },
  source: 'agent',
  acceptedAt: '2026-08-05T00:00:00.000Z',
};
const PACKAGE: ProjectEntityDocument['entities'][number]['representations'][number] = {
  bindingId: 'binding-package',
  role: 'live2d',
  target: {
    file: {
      authority: 'package',
      packageId: 'asset-rin',
      revision: '2',
      path: 'model/model.json',
    },
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
      representations: [WORKSPACE, DOCUMENT_ENTRY, GENERATED, PACKAGE],
      lifecycle: { state: 'active' },
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    },
  ],
};
const CHECKED_AT = '2026-08-05T02:00:00.000Z';
