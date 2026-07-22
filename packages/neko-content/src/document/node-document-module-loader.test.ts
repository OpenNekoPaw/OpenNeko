import { describe, expect, it } from 'vitest';

import { NODE_DOCUMENT_MODULE_NAMES, loadNodeDocumentModule } from './node';

describe('Node document module loader', () => {
  it('loads every supported runtime module from the canonical literal map', async () => {
    await expect(
      Promise.all(
        NODE_DOCUMENT_MODULE_NAMES.map((packageName) => loadNodeDocumentModule(packageName)),
      ),
    ).resolves.toHaveLength(NODE_DOCUMENT_MODULE_NAMES.length);
  }, 30_000);

  it('loads the patched SheetJS runtime and preserves spreadsheet parsing APIs', async () => {
    const xlsxModule = await import('xlsx');
    const xlsx = await loadNodeDocumentModule<typeof import('xlsx')>('xlsx');
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
      ['Name', 'Count'],
      ['Neko', 3],
    ]);
    xlsx.utils.book_append_sheet(workbook, sheet, 'Sheet1');

    const bytes = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const parsed = xlsx.read(bytes, { type: 'buffer' });
    const parsedSheet = parsed.Sheets.Sheet1;
    if (!parsedSheet) throw new Error('Patched SheetJS runtime did not preserve Sheet1.');

    expect(xlsxModule.version).toBe('0.20.3');
    expect(xlsx.utils.sheet_to_json(parsedSheet, { header: 1 })).toEqual([
      ['Name', 'Count'],
      ['Neko', 3],
    ]);
  });

  it('fails visibly for an unsupported runtime module', async () => {
    await expect(loadNodeDocumentModule('unknown-document-module')).rejects.toThrow(
      'Unsupported Node document runtime module: unknown-document-module',
    );
  });
});
