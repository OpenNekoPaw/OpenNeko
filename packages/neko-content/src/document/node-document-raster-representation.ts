import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import type {
  ContentReadService,
  ContentRepresentationGenerator,
  ContentRepresentationGeneratorInput,
} from '@neko/shared';

interface PdfScreenshot {
  readonly data: Uint8Array;
  readonly pageNumber: number;
  readonly width: number;
  readonly height: number;
}

interface PdfScreenshotResult {
  readonly pages: readonly PdfScreenshot[];
}

interface PdfParser {
  getScreenshot(options: {
    readonly partial: number[];
    readonly scale: number;
    readonly imageDataUrl: false;
    readonly imageBuffer: true;
  }): Promise<PdfScreenshotResult>;
  destroy(): Promise<void>;
}

interface PdfParserConstructor {
  new (options: { readonly data: Uint8Array }): PdfParser;
}

interface PdfParseModule {
  readonly PDFParse: PdfParserConstructor;
}

export interface OfficeDocumentRasterizer {
  convertToPdf(input: {
    readonly sourcePath: string;
    readonly signal?: AbortSignal;
  }): Promise<Uint8Array>;
}

export interface NodeDocumentRasterRepresentationOptions {
  readonly workspaceRoot: string;
  readonly contentRead: ContentReadService;
  readonly officeRasterizer?: OfficeDocumentRasterizer;
  readonly loadPdfParse?: () => Promise<PdfParseModule>;
}

const MAX_DOCUMENT_SOURCE_BYTES = 512 * 1024 * 1024;
const PDF_EXTENSIONS = new Set(['.pdf']);
const OFFICE_EXTENSIONS = new Set(['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx']);

export function createNodeDocumentRasterRepresentationGenerator(
  options: NodeDocumentRasterRepresentationOptions,
): ContentRepresentationGenerator {
  const officeRasterizer = options.officeRasterizer ?? createLibreOfficeDocumentRasterizer();
  const loadPdfParse = options.loadPdfParse ?? loadPdfParseModule;
  return {
    id: 'neko-content.document-raster',
    revision: '1',
    kinds: ['raster-page'],
    generate: async (input) => {
      const request = readRasterRequest(input);
      const extension = sourceExtension(input);
      let pdfBytes: Uint8Array;
      if (PDF_EXTENSIONS.has(extension)) {
        const source = await options.contentRead.read(input.source, {
          maxBytes: MAX_DOCUMENT_SOURCE_BYTES,
          ...(input.signal ? { signal: input.signal } : {}),
        });
        if (source.status !== 'ready') {
          throw new Error(`Document raster source is unavailable: ${source.diagnostic.code}.`);
        }
        pdfBytes = source.bytes;
      } else if (OFFICE_EXTENSIONS.has(extension)) {
        pdfBytes = await officeRasterizer.convertToPdf({
          sourcePath: resolveWorkspaceSource(options.workspaceRoot, input),
          ...(input.signal ? { signal: input.signal } : {}),
        });
      } else {
        throw new Error(`Document raster source format is unsupported: ${extension || 'unknown'}.`);
      }

      const { PDFParse } = await loadPdfParse();
      const parser = new PDFParse({ data: pdfBytes });
      try {
        const result = await parser.getScreenshot({
          partial: [request.page],
          scale: request.scale,
          imageDataUrl: false,
          imageBuffer: true,
        });
        const page = result.pages[0];
        if (!page || page.pageNumber !== request.page || page.data.byteLength === 0) {
          throw new Error(`Document raster page ${request.page} was not produced.`);
        }
        return {
          bytes: page.data,
          metadata: {
            mimeType: 'image/png',
            byteLength: page.data.byteLength,
            width: page.width,
            height: page.height,
          },
        };
      } finally {
        await parser.destroy();
      }
    },
  };
}

export function createLibreOfficeDocumentRasterizer(
  executable = 'soffice',
): OfficeDocumentRasterizer {
  return {
    async convertToPdf({ sourcePath, signal }) {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-office-raster-'));
      try {
        await executeFile(
          executable,
          ['--headless', '--convert-to', 'pdf', '--outdir', tempRoot, sourcePath],
          signal,
        );
        const outputPath = path.join(tempRoot, `${path.parse(sourcePath).name}.pdf`);
        return await fs.readFile(outputPath);
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    },
  };
}

function readRasterRequest(input: ContentRepresentationGeneratorInput): {
  readonly page: number;
  readonly scale: number;
} {
  if (input.spec.kind !== 'raster-page') {
    throw new Error(`Document raster generator does not support ${input.spec.kind}.`);
  }
  if (input.spec.format && input.spec.format !== 'png') {
    throw new Error(`Document raster generator only produces PNG, not ${input.spec.format}.`);
  }
  return { page: input.spec.page, scale: input.spec.scale ?? 1 };
}

function sourceExtension(input: ContentRepresentationGeneratorInput): string {
  return input.source.kind === 'workspace-file'
    ? path.extname(input.source.path).toLowerCase()
    : '';
}

function resolveWorkspaceSource(
  workspaceRoot: string,
  input: ContentRepresentationGeneratorInput,
): string {
  if (input.source.kind !== 'workspace-file') {
    throw new Error('Office raster source must be a workspace file.');
  }
  const resolved = path.resolve(workspaceRoot, input.source.path);
  const relative = path.relative(workspaceRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Office raster source escapes the workspace.');
  }
  return resolved;
}

async function loadPdfParseModule(): Promise<PdfParseModule> {
  const { PDFParse } = await import('pdf-parse');
  return { PDFParse };
}

function executeFile(
  executable: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      { timeout: 120_000, ...(signal ? { signal } : {}) },
      (error, _stdout, stderr) => {
        if (error) {
          reject(
            new Error(`Office raster conversion failed: ${stderr.trim() || error.message}`, {
              cause: error,
            }),
          );
          return;
        }
        resolve();
      },
    );
  });
}
