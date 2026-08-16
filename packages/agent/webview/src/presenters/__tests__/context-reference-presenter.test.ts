import { describe, expect, it } from 'vitest';
import {
  projectContextReferencesFromFileReferences,
  projectContextReferencesFromPayloads,
  projectMessageContextReferences,
} from '../context-reference-presenter';
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
          kind: 'workspace-file',
          path: 'neko/assets/References/hero.png',
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
          kind: 'workspace-file',
          path: 'neko/assets/References/hero.png',
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

  it('projects file references through stable locators and preserves renderable metadata', () => {
    expect(
      projectContextReferencesFromFileReferences([
        {
          id: 'file:hero.png',
          label: 'hero.png',
          mediaType: 'image',
          source: 'workspace',
          thumbnailUri: 'neko-resource://thumbnail/hero',
          contentLocator: {
            kind: 'workspace-file',
            path: 'neko/assets/References/hero.png',
          },
        },
      ]),
    ).toEqual([
      {
        type: 'image',
        id: 'file:hero.png',
        label: 'hero.png',
        summary: 'neko/assets/References/hero.png',
        thumbnailUri: 'neko-resource://thumbnail/hero',
        mediaType: 'image',
        contentLocator: {
          kind: 'workspace-file',
          path: 'neko/assets/References/hero.png',
        },
      },
    ]);
  });

  it('merges payload and file references once by exact reference identity', () => {
    expect(
      projectMessageContextReferences({
        payloads: [
          {
            type: 'canvas-node',
            id: 'canvas-node-1',
            label: 'Opening shot',
            summary: 'Opening shot',
            data: {},
          },
        ],
        fileReferences: [
          {
            id: 'canvas-node-1',
            label: 'Duplicate opening shot',
            source: 'canvas',
            contentLocator: { kind: 'workspace-file', path: 'neko/boards/workspace.nkc' },
          },
          {
            id: 'file:hero.png',
            label: 'hero.png',
            mediaType: 'image',
            contentLocator: { kind: 'workspace-file', path: 'hero.png' },
          },
        ],
      }),
    ).toEqual([
      {
        type: 'canvas-node',
        id: 'canvas-node-1',
        label: 'Opening shot',
        summary: 'Opening shot',
        navigationData: { nodeId: 'canvas-node-1' },
      },
      {
        type: 'image',
        id: 'file:hero.png',
        label: 'hero.png',
        summary: 'hero.png',
        mediaType: 'image',
        contentLocator: { kind: 'workspace-file', path: 'hero.png' },
      },
    ]);
  });
});
