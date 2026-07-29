import { createNodeDocumentLowLevelAccess } from '@neko/content/document/node';
import type { ResourceRef } from '@neko/shared';
import type { NodeDocumentEntryReader } from '@neko/shared/content-access';

export function createCanvasDocumentEntryContentReader(): NodeDocumentEntryReader {
  const access = createNodeDocumentLowLevelAccess();
  return {
    async readEntry(sourcePath, entryPath) {
      const bytes = await access.readEntry(sourcePath, entryPath);
      if (!bytes) throw new Error(`Canvas document entry is missing: ${entryPath}`);
      return bytes;
    },
  };
}

export function readCanvasNativeDocumentEntryPath(ref: ResourceRef): string | undefined {
  if (ref.source.kind !== 'document') return undefined;
  const format = ref.source.document?.format;
  if (format !== 'epub' && format !== 'docx' && format !== 'cbz') return undefined;
  return ref.locator?.kind === 'document' ? ref.locator.entryPath : undefined;
}
