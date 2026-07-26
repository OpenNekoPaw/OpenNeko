import { describe, expect, it } from 'vitest';
import { CURRENT_NKC_VERSION, detectNkcVersion, migrateNkc } from '../index';
import type { CanvasData } from '../../types/canvas';

function createLegacyCanvas(version: string): CanvasData {
  return {
    version,
    name: 'Migrator Fixture',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [
      {
        id: 'note-1',
        type: 'annotation',
        position: { x: 100, y: 200 },
        size: { width: 220, height: 120 },
        zIndex: 1,
        data: { content: '# Decision' },
      },
      {
        id: 'document-1',
        type: 'document',
        position: { x: 400, y: 200 },
        size: { width: 220, height: 180 },
        zIndex: 2,
        data: { docPath: 'notes/design.pdf', docType: 'pdf', title: 'Design' },
      },
    ],
    connections: [
      {
        id: 'connection-1',
        sourceId: 'note-1',
        targetId: 'document-1',
        sourceEndpoint: { nodeId: 'note-1', scope: 'node' },
        targetEndpoint: { nodeId: 'document-1', scope: 'node' },
        type: 'association',
      },
    ],
  };
}

describe('NKC migrator v3.0', () => {
  it('detects the canonical version', () => {
    expect(CURRENT_NKC_VERSION).toBe('3.0');
    expect(detectNkcVersion({ version: '3.0' })).toBe('3.0');
  });

  it('migrates legacy nodes and connections into the canonical model', () => {
    const result = migrateNkc(createLegacyCanvas('2.1'));

    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe('2.1');
    expect(result.toVersion).toBe('3.0');
    expect(result.data.version).toBe('3.0');
    expect(result.data.nodes.map((node) => node.type)).toEqual(['markdown', 'file']);
    expect(result.data.connections[0]?.type).toBe('reference');
    expect(result.steps).toEqual([expect.objectContaining({ from: '2.1', to: '3.0' })]);
    expect(result.warnings).toContain(
      'Mapped legacy connection type "association" to "reference".',
    );
  });

  it('keeps current v3.0 data untouched', () => {
    const canvas: CanvasData = {
      version: '3.0',
      name: 'Canonical',
      nodes: [],
      connections: [],
    };
    const result = migrateNkc(canvas);

    expect(result.migrated).toBe(false);
    expect(result.data).toBe(canvas);
    expect(result.steps).toEqual([]);
  });

  it('fails visibly for malformed roots', () => {
    expect(() => migrateNkc('not-a-canvas')).toThrow('data must be an object');
    expect(() => migrateNkc({ version: '2.1' })).toThrow(
      'name, nodes, and connections are required',
    );
  });
});
