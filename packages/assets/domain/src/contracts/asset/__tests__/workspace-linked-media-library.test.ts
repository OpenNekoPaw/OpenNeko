import { describe, expect, it } from 'vitest';
import {
  validateWorkspaceLinkedMediaLibraryName,
  workspaceLinkedMediaLibraryPath,
} from '../workspace-linked-media-library';

describe('workspace-linked media library contract', () => {
  it.each(['Footage', 'Team Footage', '素材库-01'])('accepts portable name %s', (name) => {
    expect(validateWorkspaceLinkedMediaLibraryName(name)).toBeUndefined();
    expect(workspaceLinkedMediaLibraryPath(name)).toBe(`neko/assets/${name}`);
  });

  it.each([
    '',
    '.',
    '..',
    '.hidden',
    'library.json',
    'LIBRARY.JSON',
    'name/child',
    'name\\child',
    'name:',
    'name.',
    'name ',
    'CON',
    'com1.mov',
    'e\u0301',
  ])('rejects non-portable name %j', (name) => {
    expect(validateWorkspaceLinkedMediaLibraryName(name)?.code).toBe('invalid-library-name');
  });
});
