export {
  createNodeDocumentLowLevelAccess,
  DEFAULT_DOCUMENT_ARCHIVE_ENTRY_MAX_BYTES,
  DEFAULT_DOCUMENT_RANGE_MAX_BYTES,
  DEFAULT_DOCUMENT_WHOLE_FILE_MAX_BYTES,
  type CreateNodeDocumentLowLevelAccessOptions,
  type NodeDocumentLowLevelAccess,
} from './node-document-low-level-access';

import {
  createDocumentAccessService,
  type IDocumentAccessService,
} from './document-access-service';
import {
  createDocumentReaderRuntime,
  type DocumentReaderLogger,
  type DocumentReaderRuntimeDeps,
} from './document-reader';
import {
  createNodeDocumentLowLevelAccess,
  type CreateNodeDocumentLowLevelAccessOptions,
} from './node-document-low-level-access';

export interface CreateNodeDocumentAccessServiceOptions extends CreateNodeDocumentLowLevelAccessOptions {
  readonly logger?: DocumentReaderLogger;
}

export function createNodeDocumentAccessService(
  options: CreateNodeDocumentAccessServiceOptions = {},
): IDocumentAccessService {
  const lowLevelAccess = createNodeDocumentLowLevelAccess(options);
  const runtime: DocumentReaderRuntimeDeps = {
    readTextFile: async (filePath) =>
      new TextDecoder().decode(await lowLevelAccess.readFile(filePath)),
    readBinaryFile: (filePath) => lowLevelAccess.readFile(filePath),
    readEntry: async (filePath, entryPath) => lowLevelAccess.readEntry(filePath, entryPath),
    loadModule: loadOptionalDocumentModule,
    ...(options.logger ? { logger: options.logger } : {}),
  };
  const reader = createDocumentReaderRuntime(runtime);
  return createDocumentAccessService({ reader, runtime, lowLevelAccess });
}

async function loadOptionalDocumentModule<T>(packageName: string): Promise<T | null> {
  try {
    const loaded = await import(packageName);
    return loaded.default ?? loaded;
  } catch (error) {
    if (isMissingModuleError(error)) return null;
    throw error;
  }
}

function isMissingModuleError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ('code' in error
      ? error.code === 'ERR_MODULE_NOT_FOUND'
      : /cannot find package/iu.test(error.message))
  );
}
