import { describe, expect, it } from 'vitest';
import type { CompositeArtifact, StoryboardTable } from '../index';
import * as artifactProjection from '../artifact-projection';
import {
  projectCompositeArtifactToCutStoryboardPayload,
  projectCompositeArtifactToStoryboardTable,
} from '../artifact-projection';
import * as storyboardTableContract from '../storyboard-table';

describe('artifact storyboard projection', () => {
  it('does not expose shared Canvas storyboard compiler/projector paths', () => {
    expect(artifactProjection).not.toHaveProperty('ARTIFACT_PROJECTOR_STORYBOARD_TO_CANVAS');
    expect(artifactProjection).not.toHaveProperty(
      'projectCompositeArtifactToCanvasStoryboardPayload',
    );
    expect(storyboardTableContract).not.toHaveProperty('projectStoryboardTableToCanvasPayload');
  });

  it('projects a StoryboardTable domain block into review data and Cut payloads', () => {
    const artifact = makeArtifact(makeStoryboardTable());

    expect(projectCompositeArtifactToStoryboardTable({ artifact })).toMatchObject({
      table: { kind: 'storyboard-table', title: 'Artifact Storyboard' },
      diagnostics: [],
    });
    expect(projectCompositeArtifactToCutStoryboardPayload({ artifact }).payload).toEqual({
      projectName: 'Artifact Storyboard',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 1.5,
          dialogue: 'Go.',
          voiceCues: [
            expect.objectContaining({
              cueId: 'shot-1-dialogue-1',
              speakerName: 'Rin',
            }),
          ],
          label: '#001 Opening',
          imagePath: '${WORKSPACE}/comic/panel-1.png',
        },
      ],
    });
  });

  it('diagnoses missing storyboard domain blocks without producing execution payloads', () => {
    const result = projectCompositeArtifactToCutStoryboardPayload({
      artifact: {
        schemaVersion: 1,
        kind: 'composite-artifact',
        artifactId: 'artifact-empty',
        title: 'No storyboard',
        blocks: [{ blockId: 'summary', kind: 'text', text: 'Review only.' }],
      },
    });

    expect(result.payload).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'missing-required-field',
      }),
    ]);
  });

  it('keeps Cut projection review-only when storyboard image refs are not projectable', () => {
    const artifact = makeArtifact(
      makeStoryboardTable({
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Opening',
            shots: [
              {
                shotId: 'shot-1',
                shotNumber: 1,
                duration: 1.5,
                visualDescription: 'A panel.',
                characterAction: 'A character runs.',
                imageStrategy: 'generate-new',
                generationPrompt: 'running character',
              },
            ],
          },
        ],
      }),
    );

    const result = projectCompositeArtifactToCutStoryboardPayload({ artifact });

    expect(result.payload).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('projectable image refs'),
      }),
    ]);
  });

  it('maps invalid storyboard diagnostics back to the artifact domain block path', () => {
    const artifact = makeArtifact({
      ...makeStoryboardTable(),
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Opening',
          shots: [
            {
              shotId: 'shot-1',
              shotNumber: 1,
              duration: 1.5,
              visualDescription: 'A panel.',
              characterAction: 'A character runs.',
              imageStrategy: 'reuse-original',
            },
          ],
        },
      ],
    });

    const result = projectCompositeArtifactToCutStoryboardPayload({ artifact });

    expect(result.payload).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'invalid-required-field',
        path: expect.arrayContaining(['blocks', 'storyboard-domain', 'payload']),
      }),
    ]);
  });
});

function makeArtifact(table: StoryboardTable): CompositeArtifact {
  return {
    schemaVersion: 1,
    kind: 'composite-artifact',
    artifactId: 'artifact-storyboard',
    title: 'Artifact Storyboard',
    blocks: [
      {
        blockId: 'storyboard-domain',
        kind: 'domain',
        domainKind: 'StoryboardTable',
        schemaVersion: 1,
        payload: table,
      },
    ],
  };
}

function makeStoryboardTable(overrides: Partial<StoryboardTable> = {}): StoryboardTable {
  const sourceRef = {
    id: 'artifact-storyboard-source',
    scope: 'project' as const,
    provider: 'fixture',
    kind: 'storyboard-reference' as const,
    source: {
      kind: 'file' as const,
      projectRelativePath: 'storyboards/artifact-source.json',
      identity: { hash: 'artifact-source-hash' },
    },
    fingerprint: { strategy: 'hash' as const, value: 'artifact-source-hash' },
  };
  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    contractVersion: 1,
    sourceProfile: 'from-existing-storyboard',
    revision: {
      revisionId: 'artifact-storyboard-v1',
      sequence: 1,
      contentDigest: 'artifact-storyboard-digest',
      createdAt: '2026-07-11T00:00:00.000Z',
    },
    sourceTrace: [
      {
        traceId: 'artifact-storyboard-source:root',
        sourceProfile: 'from-existing-storyboard',
        sourceRef,
      },
    ],
    projections: [],
    title: 'Artifact Storyboard',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Opening',
        shots: [
          {
            shotId: 'shot-1',
            shotNumber: 1,
            duration: 1.5,
            visualDescription: 'A panel.',
            characterAction: 'A character runs.',
            dialogue: 'Go.',
            voiceCues: [
              {
                cueId: 'shot-1-dialogue-1',
                kind: 'dialogue',
                text: 'Go.',
                speakerName: 'Rin',
                speakerCharacterId: 'char-rin',
                speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
              },
            ],
            characters: [
              {
                characterId: 'char-rin',
                entityRef: { entityId: 'char-rin', entityKind: 'character' },
                name: 'Rin',
                role: 'primary',
                continuityNotes: 'Keep scarf.',
              },
            ],
            imageStrategy: 'reuse-original',
            sourceMediaRefs: [
              {
                refId: 'panel-1',
                role: 'source',
                locator: {
                  type: 'workspace-path',
                  path: '${WORKSPACE}/comic/panel-1.png',
                },
                mimeType: 'image/png',
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}
