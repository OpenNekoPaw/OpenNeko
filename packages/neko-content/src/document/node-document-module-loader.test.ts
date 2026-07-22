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

  it('fails visibly for an unsupported runtime module', async () => {
    await expect(loadNodeDocumentModule('unknown-document-module')).rejects.toThrow(
      'Unsupported Node document runtime module: unknown-document-module',
    );
  });
});
