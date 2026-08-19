/**
 * Read Tool - Read file contents with line numbers
 *
 * Supports offset/limit for partial reads and truncates long lines.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ContentFingerprint, ContentReadService } from '@neko/content';
import type {
  ToolResult,
  ToolCategory,
  ToolParameters,
  ToolExecuteOptions,
} from '@neko/agent-contracts';
import { BuiltinTool } from '../base';
import { classifyAgentContentPath } from '../../input/content-path-classification';
import { createNoWorkspaceFileAccessPolicy, type CoreFileAccessPolicy } from './file-access-policy';
import {
  presentCoreFileAccessDenial,
  presentInvalidToolArguments,
  presentLineTruncationMarker,
  presentReadFailure,
  presentReadTextBoundaryFailure,
  projectPortableIoFailure,
} from './core-tool-presentation';

const MAX_LINE_LENGTH = 2000;
const DEFAULT_LIMIT = 2000;
const MAX_TEXT_FILE_BYTES = 4 * 1024 * 1024;

export interface ReadToolOptions {
  readonly fileAccessPolicy?: CoreFileAccessPolicy;
  readonly workspaceReader?: ContentReadService;
}

export class ReadTool extends BuiltinTool {
  private readonly fileAccessPolicy?: CoreFileAccessPolicy;
  private readonly workspaceReader?: ContentReadService;

  constructor(options?: ReadToolOptions) {
    super();
    this.fileAccessPolicy = options?.fileAccessPolicy ?? createNoWorkspaceFileAccessPolicy();
    this.workspaceReader = options?.workspaceReader;
  }

  readonly name = 'Read';
  readonly description =
    'Read bounded UTF-8 text from a Workspace-relative or authorized absolute file path. Never use Read for .nkc or .otio structured project documents; use their exact domain Tools. Other structured documents and media also use their exact content Tools.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Normalized Workspace-relative or authorized absolute UTF-8 text file path.',
      },
      offset: {
        type: 'number',
        minimum: 1,
        description: 'Line number to start reading from (1-based). Optional.',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: DEFAULT_LIMIT,
        description: `Max number of lines to read. Default ${DEFAULT_LIMIT}.`,
      },
    },
    required: ['file_path'],
    additionalProperties: false,
  };
  readonly category: ToolCategory = 'file';
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (
      !validation.valid ||
      Object.keys(args).some((key) => !['file_path', 'offset', 'limit'].includes(key))
    ) {
      return this.error(presentInvalidToolArguments(this.name, options?.metadata?.['locale']));
    }

    const filePath = args.file_path as string;
    const offset = (args.offset as number | undefined) ?? 1;
    const limit = (args.limit as number | undefined) ?? DEFAULT_LIMIT;

    try {
      const authorization = this.fileAccessPolicy?.authorize(filePath, 'read');
      if (authorization && !authorization.allowed) {
        return this.error(
          presentCoreFileAccessDenial('read-file', authorization, options?.metadata?.['locale']),
        );
      }
      const resolved = authorization?.hostPath ?? path.resolve(filePath);
      const classification = classifyAgentContentPath(
        authorization?.allowed && authorization.workspacePath
          ? authorization.workspacePath
          : resolved,
      );
      if (classification.kind !== 'text' && classification.kind !== 'unknown') {
        return this.error(
          presentReadTextBoundaryFailure(
            'non-text',
            filePath,
            options?.metadata?.['locale'],
            classification.kind,
          ),
        );
      }
      const workspacePath = authorization?.allowed ? authorization.workspacePath : undefined;
      const loaded: { readonly bytes: Uint8Array; readonly fingerprint?: ContentFingerprint } =
        workspacePath
          ? await this.readWorkspaceFile(workspacePath, options?.signal)
          : await this.readExternalFile(resolved);
      let content: string;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(loaded.bytes);
      } catch {
        return this.error(
          presentReadTextBoundaryFailure('invalid-utf8', filePath, options?.metadata?.['locale']),
        );
      }
      if (content.includes('\u0000')) {
        return this.error(
          presentReadTextBoundaryFailure('contains-null', filePath, options?.metadata?.['locale']),
        );
      }
      const allLines = content.split('\n');
      const startIdx = Math.max(0, offset - 1);
      const endIdx = Math.min(allLines.length, startIdx + limit);
      const lines = allLines.slice(startIdx, endIdx);

      // Format with line numbers, truncate long lines
      const maxLineNum = endIdx;
      const padWidth = String(maxLineNum).length;
      const formatted = lines.map((line, i) => {
        const lineNum = String(startIdx + i + 1).padStart(padWidth, ' ');
        const truncated =
          line.length > MAX_LINE_LENGTH
            ? line.slice(0, MAX_LINE_LENGTH) +
              presentLineTruncationMarker(options?.metadata?.['locale'])
            : line;
        return `${lineNum}\t${truncated}`;
      });

      return this.success({
        ...(authorization?.allowed && authorization.contentLocator
          ? { contentLocator: authorization.contentLocator }
          : {}),
        ...(loaded.fingerprint ? { fingerprint: loaded.fingerprint } : {}),
        content: formatted.join('\n'),
        totalLines: allLines.length,
        linesShown: lines.length,
        startLine: startIdx + 1,
        endLine: endIdx,
      });
    } catch (err) {
      if (err instanceof TextReadBoundaryError) {
        return this.error(
          presentReadTextBoundaryFailure(err.code, filePath, options?.metadata?.['locale']),
        );
      }
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.error(presentReadFailure('not-found', filePath, options?.metadata?.['locale']));
      }
      if ((err as NodeJS.ErrnoException).code === 'EISDIR') {
        return this.error(
          presentReadFailure('is-directory', filePath, options?.metadata?.['locale']),
        );
      }
      return this.error(
        presentReadFailure(
          'read-failed',
          projectPortableIoFailure(err),
          options?.metadata?.['locale'],
        ),
      );
    }
  }

  private async readWorkspaceFile(
    workspacePath: string,
    signal: AbortSignal | undefined,
  ): Promise<{
    readonly bytes: Uint8Array;
    readonly fingerprint: ContentFingerprint;
  }> {
    if (!this.workspaceReader) {
      throw new Error('Workspace Read requires the canonical Content reader.');
    }
    const locator = { file: { authority: 'workspace' as const, path: workspacePath } };
    const stat = await this.workspaceReader.stat(locator, { ...(signal ? { signal } : {}) });
    if (stat.status !== 'ready') throw new Error(stat.diagnostic.code);
    if (stat.byteLength > MAX_TEXT_FILE_BYTES) throw new TextReadBoundaryError('too-large');
    const result = await this.workspaceReader.read(locator, {
      maxBytes: MAX_TEXT_FILE_BYTES,
      expectedFingerprint: stat.fingerprint,
      ...(signal ? { signal } : {}),
    });
    if (result.status !== 'ready') {
      if (result.diagnostic.code === 'content-too-large') {
        throw new TextReadBoundaryError('too-large');
      }
      throw new Error(result.diagnostic.code);
    }
    return {
      bytes: result.bytes,
      fingerprint: result.fingerprint,
    };
  }

  private async readExternalFile(filePath: string): Promise<{ readonly bytes: Uint8Array }> {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_TEXT_FILE_BYTES) throw new TextReadBoundaryError('too-large');
    return { bytes: await fs.readFile(filePath) };
  }
}

class TextReadBoundaryError extends Error {
  constructor(readonly code: 'too-large') {
    super(code);
    this.name = 'TextReadBoundaryError';
  }
}
