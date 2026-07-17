import { describe, expect, it } from 'vitest';
import {
  getNodeLibraryCreationPolicy,
  isNodeLibraryDirectCreateType,
  isNodeLibraryFileBoundType,
  isNodeLibraryVisibleCreateType,
  requiresNodeLibrarySourceAdd,
} from './nodeLibraryPolicy';

describe('node library creation policy', () => {
  it('allows direct creation for editable canvas nodes', () => {
    expect(getNodeLibraryCreationPolicy('annotation')).toMatchObject({
      kind: 'create',
      canDragToCreate: true,
    });
    expect(isNodeLibraryDirectCreateType('shot')).toBe(true);
  });

  it('routes file-bound nodes through canonical source add intent', () => {
    expect(getNodeLibraryCreationPolicy('script')).toMatchObject({
      kind: 'file-bound',
      canDragToCreate: false,
      requiresSourceAdd: true,
    });
    expect(requiresNodeLibrarySourceAdd('media')).toBe(true);
    expect(requiresNodeLibrarySourceAdd('project')).toBe(true);
    expect(isNodeLibraryFileBoundType('document')).toBe(true);
    expect(isNodeLibraryVisibleCreateType('document')).toBe(false);
  });

  it('keeps entity graph projection nodes out of manual empty creation', () => {
    expect(getNodeLibraryCreationPolicy('entity')).toMatchObject({
      kind: 'source-bound',
      canDragToCreate: false,
    });
    expect(getNodeLibraryCreationPolicy('generated-asset')).toMatchObject({
      kind: 'projection-only',
      canDragToCreate: false,
    });
    expect(isNodeLibraryDirectCreateType('occurrence')).toBe(false);
  });
});
