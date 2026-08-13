import { describe, expect, it } from 'vitest';
import { projectContextReferencesFromPayloads } from '../context-reference-presenter';
import type { AgentContextPayload } from '@neko/agent-contracts';

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

  it('keeps a stable content locator and strips path-shaped navigation metadata', () => {
    const payload: AgentContextPayload = {
      type: 'media',
      id: 'media-1',
      label: 'Hero reference',
      summary: 'Media: Hero reference',
      data: {
        contentLocator: {
          kind: 'media-library',
          libraryName: 'References',
          relativePath: 'hero.png',
        },
        navigationData: {
          partition: 'media-library',
          resolvedPath: '/mnt/media/hero.png',
        },
      },
    };

    expect(projectContextReferencesFromPayloads([payload])).toEqual([
      {
        type: 'media',
        id: 'media-1',
        label: 'Hero reference',
        summary: 'Media: Hero reference',
        contentLocator: {
          kind: 'media-library',
          libraryName: 'References',
          relativePath: 'hero.png',
        },
        navigationData: { partition: 'media-library' },
      },
    ]);
  });

  it('projects an authorized locator reference without exposing provider prompt text', () => {
    const payload: AgentContextPayload = {
      type: 'file',
      id: 'file:test.png',
      label: 'test.png',
      summary: 'Workspace image',
      data: {
        kind: 'authorized-content-reference',
        locator: { kind: 'workspace-file', path: 'test.png' },
        mediaType: 'image',
      },
    };

    expect(projectContextReferencesFromPayloads([payload])).toEqual([
      {
        type: 'image',
        id: 'file:test.png',
        label: 'test.png',
        summary: 'Workspace image',
        mediaType: 'image',
        contentLocator: { kind: 'workspace-file', path: 'test.png' },
      },
    ]);
  });
});
