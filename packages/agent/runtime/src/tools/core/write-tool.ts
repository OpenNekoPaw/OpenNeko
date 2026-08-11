/**
 * Write Tool - Write content to a file
 *
 * Creates or freshness-replaces one Workspace content file.
 * Requires confirmation before execution.
 */

import {
  isContentFingerprint,
  type AuthorizedWorkspaceWriter,
  type ContentFingerprint,
} from '@neko/content';
import type {
  ToolResult,
  ToolCategory,
  ToolParameters,
  ToolExecuteOptions,
} from '@neko/agent-contracts';
import { BuiltinTool } from '../base';
import { createNoWorkspaceFileAccessPolicy, type CoreFileAccessPolicy } from './file-access-policy';
import {
  presentCoreFileAccessDenial,
  presentContentWriteDiagnostic,
  presentInvalidToolArguments,
  presentWriteFailure,
} from './core-tool-presentation';

export interface WriteToolOptions {
  readonly fileAccessPolicy?: CoreFileAccessPolicy;
  readonly workspaceWriter?: AuthorizedWorkspaceWriter;
}

export class WriteTool extends BuiltinTool {
  private readonly fileAccessPolicy?: CoreFileAccessPolicy;
  private readonly workspaceWriter?: AuthorizedWorkspaceWriter;

  constructor(options?: WriteToolOptions) {
    super();
    this.fileAccessPolicy = options?.fileAccessPolicy ?? createNoWorkspaceFileAccessPolicy();
    this.workspaceWriter = options?.workspaceWriter;
  }

  readonly name = 'Write';
  readonly description =
    'Create a Workspace content file, or replace one exact file state using freshness returned by Read.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description:
          'Path to the file to write. Relative paths are resolved against the workspace root.',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
      expected_fingerprint: {
        type: 'object',
        description:
          'Required when replacing an existing file. Use the exact fingerprint returned by Read.',
        properties: {
          strategy: { type: 'string', enum: ['sha256', 'mtime-size', 'provider'] },
          value: { type: 'string' },
        },
        required: ['strategy', 'value'],
        additionalProperties: false,
      },
    },
    required: ['file_path', 'content'],
  };
  readonly category: ToolCategory = 'file';
  override readonly requiresConfirmation = true;
  override readonly isDestructive = true;
  readonly requirements = {
    writableProject: true,
    authoringTargetKind: 'content-project',
  } as const;

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(presentInvalidToolArguments(this.name, options?.metadata?.['locale']));
    }

    const filePath = args.file_path as string;
    const content = args.content as string;
    const expectedFingerprint = parseExpectedFingerprint(args.expected_fingerprint);

    try {
      const authorization = this.fileAccessPolicy?.authorize(filePath, 'write');
      if (authorization && !authorization.allowed) {
        return this.error(
          presentCoreFileAccessDenial('write-file', authorization, options?.metadata?.['locale']),
        );
      }
      const workspacePath = authorization?.allowed ? authorization.contentLocator?.path : undefined;
      if (!workspacePath || !this.workspaceWriter) {
        throw new Error('Workspace Write requires a relative target and canonical Content writer.');
      }
      const bytes = new TextEncoder().encode(content);
      const result = await this.workspaceWriter.write(
        { kind: 'workspace-file', path: workspacePath },
        bytes,
        {
          conflict: expectedFingerprint ? 'replace' : 'fail-if-exists',
          ...(expectedFingerprint ? { expectedFingerprint } : {}),
          ...(options?.signal ? { signal: options.signal } : {}),
        },
      );
      if (result.status !== 'written') {
        return this.error(
          presentContentWriteDiagnostic(
            result.diagnostic.code,
            workspacePath,
            options?.metadata?.['locale'],
          ),
        );
      }
      if (!result.fingerprint) {
        throw new Error('Workspace writer did not return durable freshness.');
      }
      return this.success({
        ...(authorization?.allowed && authorization.contentLocator
          ? { contentLocator: authorization.contentLocator }
          : {}),
        operation: expectedFingerprint ? 'replace' : 'create',
        byteLength: result.byteLength,
        fingerprint: result.fingerprint,
      });
    } catch (err) {
      return this.error(
        presentWriteFailure(
          err instanceof Error ? err.message : String(err),
          options?.metadata?.['locale'],
        ),
      );
    }
  }
}

function parseExpectedFingerprint(value: unknown): ContentFingerprint | undefined {
  if (value === undefined) return undefined;
  if (!isContentFingerprint(value)) {
    throw new Error('Write expected_fingerprint is invalid.');
  }
  return value;
}
