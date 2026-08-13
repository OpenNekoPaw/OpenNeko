import { describe, expect, it, vi } from 'vitest';
import type { ResourceBrowserItem } from '@neko/assets-domain/resource-browser/contract';
import type { OpenNekoDesktopProjectLocalAuthoringBridge } from '@neko/project/contracts';
import { createDesktopProjectCharacterFromResource } from './DesktopResourceBrowserSurface';

const binding = {
  workspaceId: 'workspace-source',
  workspaceGrantId: 'workspace-grant-source',
  contentProjectId: 'content-project-destination',
};

function createIds(...ids: string[]): () => string {
  const values = [...ids];
  return () => {
    const value = values.shift();
    if (!value) throw new Error('Test identity sequence exhausted.');
    return value;
  };
}

describe('Desktop Resource Browser Character creation handoff', () => {
  it('forwards exact Content authority and opens Studio only after complete project composition', async () => {
    const createTarget = vi.fn<
      OpenNekoDesktopProjectLocalAuthoringBridge['projectLocalAuthoring']['createTarget']
    >(async () => ({
      requestId: 'request-create',
      ...binding,
      status: 'created' as const,
      target: { kind: 'character-project' as const, characterProjectId: 'character-project:cp' },
    }));
    const retryCharacter =
      vi.fn<
        OpenNekoDesktopProjectLocalAuthoringBridge['projectLocalAuthoring']['retryCharacter']
      >();
    const onCreated = vi.fn();
    const item: ResourceBrowserItem = {
      resourceId: 'content:rin',
      source: 'files',
      role: 'content',
      depth: 0,
      kind: 'document',
      label: 'rin.md',
      locator: { kind: 'workspace-file', path: 'characters/rin.md' },
      capabilities: ['reveal'],
    };

    await expect(
      createDesktopProjectCharacterFromResource({
        binding,
        bridge: { projectLocalAuthoring: { createTarget, retryCharacter } },
        displayName: 'Rin',
        item,
        onCreated,
        windowId: 'window-1',
        createId: createIds('cp', 'evidence', 'entity'),
        now: () => '2026-08-12T10:00:00.000Z',
      }),
    ).resolves.toEqual({ status: 'created' });

    expect(createTarget).toHaveBeenCalledWith('window-1', binding, {
      kind: 'character-project',
      characterProjectId: 'character-project:cp',
      displayName: 'Rin',
      draft: expect.objectContaining({ representationRefs: [] }),
      sources: {
        evidence: [
          {
            kind: 'content',
            evidenceId: 'evidence:evidence',
            sourceWorkspaceId: 'workspace-source',
            sourceWorkspaceGrantId: 'workspace-grant-source',
            locator: { kind: 'workspace-file', path: 'characters/rin.md' },
            observedAt: '2026-08-12T10:00:00.000Z',
          },
        ],
        assetRepresentations: [],
      },
      entity: { kind: 'create', entityId: 'entity:entity', name: 'Rin' },
    });
    expect(onCreated).toHaveBeenCalledWith('character-project:cp', 'Rin');
    expect(retryCharacter).not.toHaveBeenCalled();
  });

  it('rejects Asset rows that do not expose an exact package resource representation', async () => {
    const createTarget =
      vi.fn<OpenNekoDesktopProjectLocalAuthoringBridge['projectLocalAuthoring']['createTarget']>();
    const retryCharacter =
      vi.fn<
        OpenNekoDesktopProjectLocalAuthoringBridge['projectLocalAuthoring']['retryCharacter']
      >();
    const bridge: OpenNekoDesktopProjectLocalAuthoringBridge = {
      projectLocalAuthoring: { createTarget, retryCharacter },
    };
    await expect(
      createDesktopProjectCharacterFromResource({
        binding,
        bridge,
        displayName: 'Rin',
        item: {
          resourceId: 'asset:rin',
          source: 'assets',
          role: 'asset',
          depth: 0,
          kind: 'asset',
          label: 'Rin Live2D',
          assetRef: { assetId: 'asset-rin' },
          availability: 'available',
          capabilities: [],
        },
        onCreated: vi.fn(),
        windowId: 'window-1',
        createId: createIds('cp'),
      }),
    ).rejects.toThrow('exact Content context');
    expect(createTarget).not.toHaveBeenCalled();
  });
});
