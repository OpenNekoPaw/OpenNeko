import { describe, expect, it } from 'vitest';
import { projectContextReferencesFromPayloads } from '../context-reference-presenter';
import type { AgentContextPayload } from '@neko/shared';

describe('context-reference-presenter', () => {
  it('does not infer an Asset catalog id from presentation type', () => {
    const payload: AgentContextPayload = {
      type: 'asset',
      id: 'asset-1',
      label: 'Hero portrait',
      summary: 'Asset: Hero portrait',
      data: {
        navigationData: {
          owner: 'generated-output',
          outputId: 'asset-1',
        },
      },
    };

    expect(projectContextReferencesFromPayloads([payload])).toEqual([
      {
        type: 'asset',
        id: 'asset-1',
        label: 'Hero portrait',
        summary: 'Asset: Hero portrait',
        navigationData: { owner: 'generated-output', outputId: 'asset-1' },
      },
    ]);
  });

  it('uses resolvedPath as filePath while retaining portable path data', () => {
    const payload: AgentContextPayload = {
      type: 'media',
      id: 'media-1',
      label: 'Hero reference',
      summary: 'Media: Hero reference',
      data: {
        path: '${REFS}/hero.png',
        resolvedPath: '/mnt/media/hero.png',
        navigationData: {
          partition: 'media-library',
          portablePath: '${REFS}/hero.png',
        },
      },
    };

    expect(projectContextReferencesFromPayloads([payload])).toEqual([
      {
        type: 'media',
        id: 'media-1',
        label: 'Hero reference',
        summary: 'Media: Hero reference',
        navigationData: {
          path: '${REFS}/hero.png',
          filePath: '/mnt/media/hero.png',
          partition: 'media-library',
          portablePath: '${REFS}/hero.png',
        },
      },
    ]);
  });
});
