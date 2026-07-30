/**
 * Bash Tool - Execute shell commands
 *
 * Runs commands via bash with timeout and output limits.
 * Requires confirmation before execution.
 */

import { execFile } from 'node:child_process';
import type { ToolResult, ToolCategory, ToolParameters, ToolExecuteOptions } from '@neko/shared';
import { BuiltinTool } from '@neko/shared';
import {
  presentInvalidToolArguments,
  presentOutputTruncationMarker,
  presentOutputTruncationWarning,
  presentProcessFailure,
} from './core-tool-presentation';

const DEFAULT_TIMEOUT = 120_000;
const MAX_OUTPUT_BYTES = 100 * 1024; // 100KB

export interface BashToolOptions {
  defaultCwd?: string;
  timeout?: number;
}

export class BashTool extends BuiltinTool {
  readonly name = 'Bash';
  readonly description =
    'Execute a bash command and return its output. Use for system operations, running tests, builds, etc.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory. Optional.',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds. Default 120000.',
      },
    },
    required: ['command'],
  };
  readonly category: ToolCategory = 'system';
  override readonly requiresConfirmation = true;
  override readonly isDestructive = true;

  private defaultCwd?: string;
  private defaultTimeout: number;

  constructor(options?: BashToolOptions) {
    super();
    this.defaultCwd = options?.defaultCwd;
    this.defaultTimeout = options?.timeout ?? DEFAULT_TIMEOUT;
  }

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(presentInvalidToolArguments(this.name, options?.metadata?.['locale']));
    }

    const command = args.command as string;
    const cwd = (args.cwd as string | undefined) ?? this.defaultCwd;
    const timeout = (args.timeout as number | undefined) ?? this.defaultTimeout;

    return new Promise<ToolResult>((resolve) => {
      const proc = execFile(
        'bash',
        ['-c', command],
        {
          cwd,
          timeout,
          maxBuffer: MAX_OUTPUT_BYTES,
          env: { ...process.env, TERM: 'dumb' },
        },
        (error, stdout, stderr) => {
          const exitCode = error ? ((error as { code?: number }).code ?? 1) : 0;
          const truncatedStdout = truncateOutput(stdout, options?.metadata?.['locale']);
          const truncatedStderr = truncateOutput(stderr, options?.metadata?.['locale']);

          if (
            error &&
            (error as NodeJS.ErrnoException).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
          ) {
            resolve(
              this.success({
                stdout: truncatedStdout,
                stderr: truncatedStderr,
                exitCode,
                warning: presentOutputTruncationWarning(options?.metadata?.['locale']),
              }),
            );
            return;
          }

          resolve(
            this.success({
              stdout: truncatedStdout,
              stderr: truncatedStderr,
              exitCode,
            }),
          );
        },
      );

      // Handle timeout kill
      proc.on('error', (err) => {
        resolve(this.error(presentProcessFailure(err.message, options?.metadata?.['locale'])));
      });
    });
  }
}

function truncateOutput(output: string, locale: unknown): string {
  if (Buffer.byteLength(output, 'utf-8') > MAX_OUTPUT_BYTES) {
    const truncated = output.slice(0, MAX_OUTPUT_BYTES);
    return `${truncated}\n${presentOutputTruncationMarker(locale)}`;
  }
  return output;
}
