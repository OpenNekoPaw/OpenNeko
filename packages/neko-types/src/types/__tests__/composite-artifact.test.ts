import { describe, expect, it } from 'vitest';
import {
  validateCompositeArtifact,
  validateGenericTable,
  type ArtifactProfileDescriptor,
  type CompositeArtifact,
  type GenericTable,
} from '../composite-artifact';

const profile: ArtifactProfileDescriptor = {
  profileId: 'media-production.shot-image-prep',
  kind: 'artifact',
  protocol: 'GenericTable',
  version: 1,
  source: 'skill-local',
  columns: [
    { columnId: 'shotId', cellType: 'string', required: true },
    { columnId: 'sourcePanel', cellType: 'media-preview', required: true },
    {
      columnId: 'motionPlan',
      cellType: 'json',
      required: true,
      shape: {
        requiredKeys: ['layer', 'durationMs'],
        fieldTypes: { layer: 'string', durationMs: 'number' },
      },
    },
  ],
};

describe('composite artifact contracts', () => {
  it('validates a composite artifact with a profiled generic table', () => {
    const table = makeTable();
    const artifact: CompositeArtifact = {
      schemaVersion: 1,
      kind: 'composite-artifact',
      artifactId: 'artifact-1',
      title: 'Media production from comic',
      blocks: [
        { blockId: 'summary', kind: 'text', text: 'Review these shots.', format: 'plain' },
        { blockId: 'table', kind: 'table', table },
      ],
    };

    expect(validateGenericTable(table, { profiles: [profile] })).toEqual({
      ok: true,
      diagnostics: [],
    });
    expect(validateCompositeArtifact(artifact, { profiles: [profile] })).toEqual({
      ok: true,
      diagnostics: [],
    });
  });

  it('diagnoses unknown block and cell kinds without treating them as executable', () => {
    const artifact = {
      schemaVersion: 1,
      kind: 'composite-artifact',
      artifactId: 'artifact-1',
      title: 'Bad artifact',
      blocks: [{ blockId: 'x', kind: 'spreadsheet' }],
      suggestedActions: [{ actionId: 'run', kind: 'execute' }],
    };
    const table = {
      ...makeTable(),
      rows: [
        {
          rowId: 'row-1',
          cells: {
            shotId: { type: 'unknown', value: 'shot-1' },
          },
        },
      ],
    };

    expect(validateCompositeArtifact(artifact).diagnostics.map((d) => d.code)).toContain(
      'invalid-block-kind',
    );
    expect(validateGenericTable(table).diagnostics.map((d) => d.code)).toContain(
      'invalid-cell-type',
    );
  });

  it('rejects runtime-only handles and absolute local paths in persisted values', () => {
    const table = makeTable({
      rows: [
        {
          rowId: 'row-1',
          cells: {
            shotId: { type: 'string', value: '/Users/feng/tmp/frame.png' },
            sourcePanel: makeMediaCell(),
            motionPlan: { type: 'json', value: { layer: 'fg', durationMs: 1200 } },
          },
        },
      ],
    });

    const result = validateGenericTable(table, { profiles: [profile] });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain('unsafe-runtime-handle');
  });

  it('keeps persisted profile versions lightweight but fail-closed on unsupported versions', () => {
    const table = makeTable({ profileVersion: 2 });

    const result = validateGenericTable(table, { profiles: [profile], persisted: true });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported-profile-version', severity: 'error' }),
      ]),
    );
  });

  it('fails closed when a persisted artifact references a missing profile descriptor', () => {
    const table = makeTable({ profile: 'studio.missing-profile' });

    const result = validateGenericTable(table, { profiles: [], persisted: true });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-profile-descriptor', severity: 'error' }),
      ]),
    );
  });

  it('allows temporary profiled chat tables to omit profileVersion', () => {
    const result = validateGenericTable(makeTable({ profileVersion: undefined }), {
      profiles: [profile],
      persisted: false,
    });

    expect(result.ok).toBe(true);
  });

  it('bounds json cells with schemaRef and shallow profile shape checks', () => {
    const table = makeTable({
      rows: [
        {
          rowId: 'row-1',
          cells: {
            shotId: { type: 'string', value: 'shot-1' },
            sourcePanel: makeMediaCell(),
            motionPlan: {
              type: 'json',
              schemaRef: 'neko.motion-plan.v1',
              value: { layer: 'fg', durationMs: '1200' },
            },
          },
        },
      ],
    });

    const result = validateGenericTable(table, {
      profiles: [profile],
      resolvedSchemaRefs: [],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining(['unresolved-schema-ref', 'invalid-required-field']),
    );
  });

  it('enforces profile enum values, resource media types, schema refs, and suggested actions', () => {
    const strictProfile: ArtifactProfileDescriptor = {
      profileId: 'strict-shot-profile',
      kind: 'artifact',
      protocol: 'GenericTable',
      version: 1,
      source: 'builtin',
      columns: [
        { columnId: 'review', cellType: 'enum', required: true, enumValues: ['approved'] },
        {
          columnId: 'sourcePanel',
          cellType: 'media-preview',
          required: true,
          resourceMediaTypes: ['image'],
        },
        {
          columnId: 'motionPlan',
          cellType: 'json',
          required: true,
          schemaRef: 'neko.motion-plan.v1',
        },
      ],
      suggestedActions: [{ actionId: 'review.shot.approve', kind: 'review' }],
    };
    const table = makeTable({
      profile: 'strict-shot-profile',
      columns: [
        { columnId: 'review', cellType: 'enum', required: true },
        { columnId: 'sourcePanel', cellType: 'media-preview', required: true },
        {
          columnId: 'motionPlan',
          cellType: 'json',
          required: true,
          schemaRef: 'neko.other-plan.v1',
        },
      ],
      actions: [{ actionId: 'canvas.ingestMarkdown', kind: 'review' }],
      rows: [
        {
          rowId: 'row-1',
          cells: {
            review: { type: 'enum', value: 'rejected' },
            sourcePanel: makeMediaCell({ mediaType: 'video' }),
            motionPlan: {
              type: 'json',
              schemaRef: 'neko.other-plan.v1',
              value: { durationMs: 1200 },
            },
          },
        },
      ],
    });

    const result = validateGenericTable(table, {
      profiles: [strictProfile],
      resolvedSchemaRefs: ['neko.motion-plan.v1'],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining([
        'profile-enum-value-mismatch',
        'profile-resource-modality-mismatch',
        'profile-schema-ref-mismatch',
        'invalid-profile',
      ]),
    );
  });

  it('composes profile columns from reusable field groups with explicit column overrides', () => {
    const composedProfile: ArtifactProfileDescriptor = {
      profileId: 'comic-shot-review',
      kind: 'artifact',
      protocol: 'GenericTable',
      version: 1,
      source: 'skill-local',
      fieldDefinitions: [
        { columnId: 'shotId', cellType: 'string', required: true },
        { columnId: 'sourcePanel', cellType: 'media-preview', required: true },
        {
          columnId: 'characters',
          cellType: 'json',
          required: false,
          schemaRef: 'neko.characters.v1',
          shape: {
            requiredKeys: ['name'],
            fieldTypes: { name: 'string' },
          },
        },
        { columnId: 'dialogue', cellType: 'string', required: false },
      ],
      fieldGroups: [
        { groupId: 'shot-core', fieldIds: ['shotId', 'sourcePanel'] },
        { groupId: 'character-dialogue', fieldIds: ['characters', 'dialogue'] },
      ],
      includeFieldGroups: ['shot-core', 'character-dialogue'],
      columns: [
        {
          columnId: 'characters',
          cellType: 'json',
          required: true,
        },
      ],
    };
    const table = makeTable({
      profile: 'comic-shot-review',
      columns: [
        { columnId: 'shotId', cellType: 'string', required: true },
        { columnId: 'sourcePanel', cellType: 'media-preview', required: true },
        { columnId: 'characters', cellType: 'json', required: true },
        { columnId: 'dialogue', cellType: 'string' },
      ],
      rows: [
        {
          rowId: 'row-1',
          cells: {
            shotId: { type: 'string', value: 'shot-1' },
            sourcePanel: makeMediaCell(),
            characters: {
              type: 'json',
              schemaRef: 'neko.characters.v1',
              value: { role: 'primary' },
            },
            dialogue: { type: 'string', value: '那一願望實現囉！' },
          },
        },
      ],
    });

    const result = validateGenericTable(table, {
      profiles: [composedProfile],
      resolvedSchemaRefs: ['neko.characters.v1'],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain('profile-required-cell-missing');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['rows', 0, 'cells', 'characters', 'value', 'name'],
        }),
      ]),
    );
  });

  it('fails closed when composed profile field groups reference unknown fields', () => {
    const brokenProfile: ArtifactProfileDescriptor = {
      profileId: 'broken-comic-shot-review',
      kind: 'artifact',
      protocol: 'GenericTable',
      version: 1,
      source: 'skill-local',
      fieldDefinitions: [{ columnId: 'shotId', cellType: 'string', required: true }],
      fieldGroups: [{ groupId: 'shot-core', fieldIds: ['shotId', 'missingField'] }],
      includeFieldGroups: ['shot-core', 'missing-group'],
    };
    const table = makeTable({
      profile: 'broken-comic-shot-review',
      columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
      rows: [
        {
          rowId: 'row-1',
          cells: {
            shotId: { type: 'string', value: 'shot-1' },
          },
        },
      ],
    });

    const result = validateGenericTable(table, { profiles: [brokenProfile] });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'profile-field-definition-missing' }),
        expect.objectContaining({ code: 'profile-field-group-missing' }),
      ]),
    );
  });
});

function makeTable(overrides: Partial<GenericTable> = {}): GenericTable {
  return {
    schemaVersion: 1,
    kind: 'generic-table',
    tableId: 'asset-prep',
    profile: 'media-production.shot-image-prep',
    profileVersion: 1,
    title: 'Asset prep',
    columns: [
      { columnId: 'shotId', cellType: 'string', required: true },
      { columnId: 'sourcePanel', cellType: 'media-preview', required: true },
      { columnId: 'motionPlan', cellType: 'json', required: true },
    ],
    rows: [
      {
        rowId: 'row-1',
        cells: {
          shotId: { type: 'string', value: 'shot-1' },
          sourcePanel: makeMediaCell(),
          motionPlan: { type: 'json', value: { layer: 'fg', durationMs: 1200 } },
        },
      },
    ],
    ...overrides,
  };
}

function makeMediaCell(
  overrides: Partial<
    Extract<
      GenericTable['rows'][number]['cells'][string],
      { readonly type: 'media-preview' }
    >['value']
  > = {},
): GenericTable['rows'][number]['cells'][string] {
  return {
    type: 'media-preview',
    value: {
      itemId: 'panel-1',
      mediaType: 'image',
      label: 'Panel 1',
      resourceRef: {
        kind: 'tool-result',
        toolCallId: 'read-comic',
        assetIndex: 0,
      },
      ...overrides,
    },
  };
}
