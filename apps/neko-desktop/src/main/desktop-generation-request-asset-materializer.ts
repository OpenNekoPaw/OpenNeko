import { createNodeDocumentLowLevelAccess } from '@neko/content-domain/document/node';
import { createNodeHostContentReadService } from '@neko/content-domain/node';
import {
  createContentReadMediaRequestAssetMaterializer,
  type MediaRequestAssetMaterializer,
} from '@neko/generation-domain/media';

export function createDesktopGenerationRequestAssetMaterializer(
  workspaceRoot: string,
): MediaRequestAssetMaterializer {
  const documentEntries = createNodeDocumentLowLevelAccess();
  return createContentReadMediaRequestAssetMaterializer({
    contentRead: createNodeHostContentReadService({
      workspaceRoot,
      documentEntryReader: {
        readEntry: (sourcePath, entryPath) => documentEntries.readEntry(sourcePath, entryPath),
      },
    }),
    encodeBase64: (bytes) => Buffer.from(bytes).toString('base64'),
  });
}
