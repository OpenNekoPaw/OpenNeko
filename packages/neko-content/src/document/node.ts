export {
  createNodeDocumentLowLevelAccess,
  DEFAULT_DOCUMENT_ARCHIVE_ENTRY_MAX_BYTES,
  DEFAULT_DOCUMENT_RANGE_MAX_BYTES,
  DEFAULT_DOCUMENT_WHOLE_FILE_MAX_BYTES,
  type CreateNodeDocumentLowLevelAccessOptions,
  type NodeDocumentLowLevelAccess,
} from './node-document-low-level-access';

export {
  createLibreOfficeDocumentRasterizer,
  createNodeDocumentRasterRepresentationGenerator,
  type NodeDocumentRasterRepresentationOptions,
  type OfficeDocumentRasterizer,
} from './node-document-raster-representation';

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

export const NODE_DOCUMENT_MODULE_NAMES = Object.freeze([
  'adm-zip',
  'pdf-parse',
  'mammoth',
  'officeparser',
  'epub2',
  'node-unrar-js',
  'node-fetch',
  'cheerio',
  'xlsx',
  'fast-xml-parser',
] as const);

export function createNodeDocumentAccessService(
  options: CreateNodeDocumentAccessServiceOptions = {},
): IDocumentAccessService {
  const lowLevelAccess = createNodeDocumentLowLevelAccess(options);
  const runtime: DocumentReaderRuntimeDeps = {
    readTextFile: async (filePath) =>
      new TextDecoder().decode(await lowLevelAccess.readFile(filePath)),
    readBinaryFile: (filePath) => lowLevelAccess.readFile(filePath),
    readEntry: async (filePath, entryPath) => lowLevelAccess.readEntry(filePath, entryPath),
    loadModule: loadNodeDocumentModule,
    ...(options.logger ? { logger: options.logger } : {}),
  };
  const reader = createDocumentReaderRuntime(runtime);
  return createDocumentAccessService({ reader, runtime, lowLevelAccess });
}

export function loadNodeDocumentModule<T>(packageName: string): Promise<T>;
export async function loadNodeDocumentModule(packageName: string): Promise<unknown> {
  let loaded: unknown;
  switch (packageName) {
    case 'adm-zip':
      loaded = await import('adm-zip');
      break;
    case 'pdf-parse':
      loaded = await import('pdf-parse');
      break;
    case 'mammoth':
      loaded = await import('mammoth');
      break;
    case 'officeparser':
      loaded = await import('officeparser');
      break;
    case 'epub2':
      loaded = await import('epub2');
      break;
    case 'node-unrar-js':
      loaded = await import('node-unrar-js');
      break;
    case 'node-fetch':
      loaded = await import('node-fetch');
      break;
    case 'cheerio':
      loaded = await import('cheerio');
      break;
    case 'xlsx':
      loaded = await import('xlsx');
      break;
    case 'fast-xml-parser':
      loaded = await import('fast-xml-parser');
      break;
    default:
      throw new Error(`Unsupported Node document runtime module: ${packageName}`);
  }

  return normalizeNodeModule(loaded);
}

function normalizeNodeModule(moduleValue: unknown): unknown {
  if (
    (typeof moduleValue === 'object' && moduleValue !== null) ||
    typeof moduleValue === 'function'
  ) {
    const defaultValue = Reflect.get(moduleValue, 'default');
    return defaultValue ?? moduleValue;
  }
  return moduleValue;
}
