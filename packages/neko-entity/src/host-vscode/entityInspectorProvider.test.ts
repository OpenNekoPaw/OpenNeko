import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  commands: { executeCommand: vi.fn() },
  env: { language: 'en' },
  l10n: { t: (message: string) => message },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: () => ({ get: () => false }),
  },
}));

import { isInspectorEventRelated, toInspectorDashboardRef } from './entityInspectorProvider';

describe('EntityInspectorProvider canonical Entity path', () => {
  it('projects retained entity requests onto the neutral Entity source', () => {
    expect(
      toInspectorDashboardRef(
        {
          entityRef: {
            entityId: 'character-1',
            entityKind: 'character',
            projectRoot: '/old-workspace',
            source: 'removed-story-source',
          },
        },
        '/workspace',
      ),
    ).toEqual({
      source: 'neko-entity',
      sourceEntityId: 'entity:character-1',
      entityId: 'character-1',
      entityKind: 'character',
      projectRoot: '/workspace',
    });
  });

  it('keeps candidate requests inside the retained workspace source', () => {
    expect(toInspectorDashboardRef({ candidateId: 'candidate:1' }, '/workspace')).toEqual({
      source: 'neko-entity',
      sourceEntityId: 'candidate:1',
      entityKind: 'character',
      projectRoot: '/workspace',
    });
  });

  it('refreshes an inspected entity when the canonical runtime reports a related change', () => {
    expect(
      isInspectorEventRelated(
        {
          source: 'neko-entity',
          sourceEntityId: 'entity:character-1',
          entityId: 'character-1',
          entityKind: 'character',
          projectRoot: '/workspace',
        },
        {
          type: 'refreshed',
          source: 'neko-entity',
          freshness: 'fresh',
          changedRefs: [
            {
              kind: 'binding',
              id: 'character-1',
              entityRef: {
                entityId: 'character-1',
                entityKind: 'character',
                projectRoot: '/workspace',
              },
            },
          ],
        },
      ),
    ).toBe(true);
  });
});
