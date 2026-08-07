import { describe, expect, it } from 'vitest';
import { createResourceBrowserPresentationSnapshotStore } from './presentation-snapshot';

describe('Resource Browser presentation snapshot store', () => {
  it('isolates exact Project and Workspace identities and returns immutable copies', () => {
    const store = createResourceBrowserPresentationSnapshotStore();
    const first = { projectId: 'project-1', workspaceId: 'workspace-1' };
    const second = { projectId: 'project-1', workspaceId: 'workspace-2' };
    const expandedResourceIds = ['content:shots'];
    store.write(first, {
      query: 'shot',
      activeFacet: 'files',
      viewMode: 'list',
      expandedResourceIds,
      selectedResourceIds: { files: 'content:shots/one.png' },
      activeContainerResourceIds: {},
      entityDrafts: {
        'entity:rin': { canonicalName: 'Rin draft', mergeTargetId: '', bindingPath: '' },
      },
    });
    expandedResourceIds.push('content:mutated');

    expect(store.read(first)).toEqual({
      query: 'shot',
      activeFacet: 'files',
      viewMode: 'list',
      expandedResourceIds: ['content:shots'],
      selectedResourceIds: { files: 'content:shots/one.png' },
      activeContainerResourceIds: {},
      entityDrafts: {
        'entity:rin': { canonicalName: 'Rin draft', mergeTargetId: '', bindingPath: '' },
      },
    });
    expect(store.read(second)).toBeUndefined();
    expect(JSON.stringify(store.read(first))).not.toMatch(
      /absolutePath|contentLocator|previewSessionId|rendererSessionId|url/u,
    );
  });

  it('deletes a presentation instead of retaining an empty record', () => {
    const store = createResourceBrowserPresentationSnapshotStore();
    const identity = { projectId: 'project-1', workspaceId: 'workspace-1' };
    store.write(identity, {
      query: 'shot',
      activeFacet: 'files',
      viewMode: 'list',
      expandedResourceIds: [],
      selectedResourceIds: {},
      activeContainerResourceIds: {},
      entityDrafts: {},
    });
    store.write(identity, undefined);

    expect(store.read(identity)).toBeUndefined();
  });
});
