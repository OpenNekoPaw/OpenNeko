import { describe, expect, it } from 'vitest';
import { readFieldBinding, writeFieldBinding, writeJsonPointer } from '../fieldBinding';

describe('field binding utilities', () => {
  it('reads JSON Pointer-style paths from nested data', () => {
    const data = { cells: [{ prompt: 'front view' }] };

    expect(readFieldBinding(data, { path: '/cells/0/prompt' })).toEqual({
      found: true,
      value: 'front view',
    });
  });

  it('returns default value for missing fields without mutating data', () => {
    const data = { title: 'Scene' };

    expect(readFieldBinding(data, { path: '/missing', defaultValue: 'default' })).toEqual({
      found: false,
      value: 'default',
    });
    expect(data).toEqual({ title: 'Scene' });
  });

  it('writes nested values immutably', () => {
    const data = { cells: [{ prompt: 'old', label: 'front' }] };
    const result = writeFieldBinding(data, { path: '/cells/0/prompt' }, 'new');

    expect(result.changed).toBe(true);
    expect(result.data).toEqual({ cells: [{ prompt: 'new', label: 'front' }] });
    expect(data.cells[0]?.prompt).toBe('old');
  });

  it('creates missing intermediate objects', () => {
    const result = writeJsonPointer({}, '/preview/selected/id', 'candidate-1');

    expect(result.data).toEqual({ preview: { selected: { id: 'candidate-1' } } });
  });

  it('does not write read-only bindings', () => {
    const data = { title: 'Locked' };
    const result = writeFieldBinding(data, { path: '/title', mode: 'read' }, 'Changed');

    expect(result.changed).toBe(false);
    expect(result.data).toBe(data);
  });
});
