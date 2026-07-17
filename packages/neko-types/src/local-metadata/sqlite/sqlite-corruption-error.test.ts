import { describe, expect, it } from 'vitest';
import { isSqliteCorruptionError } from './sqlite-corruption-error';

describe('SQLite corruption error classification', () => {
  it.each([
    { code: 'SQLITE_CORRUPT' },
    { code: 'SQLITE_NOTADB' },
    { errcode: 11 },
    { errcode: 26 },
    { message: 'database disk image is malformed' },
    { message: 'File is not a database' },
  ])('classifies the external SQLite corruption shape %#', (error) => {
    expect(isSqliteCorruptionError(error)).toBe(true);
  });

  it('does not classify lock contention or arbitrary failures as corruption', () => {
    expect(isSqliteCorruptionError({ code: 'SQLITE_BUSY', message: 'database is locked' })).toBe(
      false,
    );
    expect(isSqliteCorruptionError(new Error('permission denied'))).toBe(false);
  });
});
