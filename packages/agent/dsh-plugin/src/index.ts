import type { DshAcpHostToolPort, DshAcpJsonValue } from '@neko/agent-contracts/dsh-acp';
import {
  CREATE_SKILL_DSH_TOOL_NAME,
  CREATE_SKILL_DSH_TOOL_OPERATION,
  CREATE_SKILL_DSH_TOOL_PARAMETERS,
  decodeCreateDshSkillInput,
  decodeCreateDshSkillResult,
} from '@neko/agent-contracts/dsh-skill-authoring';
import type { Context } from '@deepseek-ai/cordis';
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import {
  defineTool,
  type JsonValue,
  type ToolExecution,
  type ToolRunContext,
} from '@deepseek-ai/dsh-tools';
import { extname, posix as portablePath } from 'node:path';

export const name = 'openneko-agent-tools';
export const inject = ['fs', 'opennekoHostTools', 'tools'];

const NATIVE_TEXT_FILE_TOOLS = new Set(['read', 'write', 'edit']);
const PROTECTED_STRUCTURED_PROJECT_EXTENSIONS = new Set(['.nkc', '.otio']);

declare module '@deepseek-ai/cordis' {
  interface Context {
    opennekoHostTools: DshAcpHostToolPort<ToolRunContext>;
  }
}

export function apply(ctx: Context): void {
  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: CREATE_SKILL_DSH_TOOL_NAME,
          description:
            'Create one DSH-native Skill in the exact current Conversation authority. The Host chooses the destination; this operation never overwrites an existing package.',
          parameters: CREATE_SKILL_DSH_TOOL_PARAMETERS,
          output: {
            schema: { type: 'json' },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
          },
          async execute(args, execution) {
            const input = decodeCreateDshSkillInput(args);
            const response = await ctx.opennekoHostTools.execute(
              {
                tool: CREATE_SKILL_DSH_TOOL_NAME,
                operation: CREATE_SKILL_DSH_TOOL_OPERATION,
                input: {
                  layout: input.layout,
                  skillMarkdown: input.skillMarkdown,
                  resources: input.resources.map((resource) => ({
                    path: resource.path,
                    content: resource.content,
                  })),
                },
              },
              execution,
            );
            if (response.outcome === 'failure') {
              throw new Error(`${response.diagnostic.code}: ${response.diagnostic.message}`);
            }
            return toDshJsonValue(decodeCreateDshSkillResult(response.result));
          },
        }),
      ),
    'openneko-agent-tools',
  );
  ctx.effect(
    () =>
      ctx.on('tools/pre-execute', async (execution, next) => {
        if (execution.name !== CREATE_SKILL_DSH_TOOL_NAME) return next();
        return {
          kind: 'ask',
          reason: 'Create a new DSH Skill in the exact current Conversation scope.',
        };
      }),
    'openneko-agent-tools-approval',
  );
  ctx.effect(
    () =>
      ctx.on('tools/pre-execute', async (execution, next) => {
        const denial = await nativeTextFileDenial(ctx.fs, execution);
        return denial === undefined ? next() : { kind: 'deny', reason: denial };
      }),
    'openneko-native-text-file-policy',
  );
}

export async function nativeTextFileDenial(
  fs: Pick<FileSystem, 'contains' | 'resolve'>,
  execution: Pick<ToolExecution, 'agent' | 'arguments' | 'name' | 'signal'>,
): Promise<string | undefined> {
  if (!NATIVE_TEXT_FILE_TOOLS.has(execution.name)) return undefined;
  const cwd = execution.agent?.session.header.cwd;
  if (cwd === undefined) {
    return `DSH ${execution.name} requires an exact Session Workspace.`;
  }
  const filePath = readFilePath(execution.arguments);
  if (filePath === undefined) {
    return `DSH ${execution.name} requires one non-empty file_path.`;
  }
  if (execution.name === 'write' && !isNormalizedWorkspaceRelativePath(filePath)) {
    return 'DSH write requires a normalized Workspace-relative file_path.';
  }

  let workspace;
  let target;
  try {
    [workspace, target] = await Promise.all([
      fs.resolve(cwd, { signal: execution.signal }),
      fs.resolve(filePath, { cwd, signal: execution.signal }),
    ]);
  } catch (error) {
    return `DSH ${execution.name} could not resolve the requested Workspace path: ${errorMessage(error)}`;
  }
  if (!fs.contains(workspace, target)) {
    return `DSH ${execution.name} denied a path outside the exact Session Workspace.`;
  }
  const extension = extname(target.displayPath).toLocaleLowerCase('en-US');
  if (PROTECTED_STRUCTURED_PROJECT_EXTENSIONS.has(extension)) {
    return `DSH ${execution.name} denied protected structured project format '${extension}'. Use its owning domain capability.`;
  }
  return undefined;
}

function readFilePath(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined;
  const value = Reflect.get(args, 'file_path');
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  return value;
}

function isNormalizedWorkspaceRelativePath(filePath: string): boolean {
  const segments = filePath.split('/');
  return (
    !filePath.includes('\\') &&
    !filePath.includes('\0') &&
    !filePath.startsWith('~') &&
    !portablePath.isAbsolute(filePath) &&
    portablePath.normalize(filePath) === filePath &&
    filePath !== '..' &&
    !filePath.startsWith('../') &&
    !segments.some((segment) => segment.length === 0 || segment.includes(':'))
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toDshJsonValue(value: DshAcpJsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(toDshJsonValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toDshJsonValue(item)]),
    );
  }
  return value;
}
