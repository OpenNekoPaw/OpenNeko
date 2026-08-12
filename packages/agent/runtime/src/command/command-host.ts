import { createHash } from 'node:crypto';
import { basename } from 'node:path';

import type { ExecutionEnv } from '@earendil-works/pi-agent-core';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { parse as parseYaml } from 'yaml';

export type CommandSource =
  | { readonly kind: 'personal' | 'project' }
  | { readonly kind: 'plugin'; readonly pluginId: string };

export interface CommandSourceRoot {
  readonly path: string;
  readonly source: CommandSource;
}

export interface CommandHostRecord {
  readonly name: string;
  readonly description: string;
  readonly source: CommandSource;
  readonly fingerprint: string;
  readonly activationId: string;
  readonly argumentHint?: string;
  readonly supportsArguments: boolean;
}

export interface CommandHostDiagnostic {
  readonly code:
    | 'file-info-failed'
    | 'invalid-root'
    | 'list-failed'
    | 'read-failed'
    | 'invalid-command'
    | 'duplicate-command';
  readonly message: string;
  readonly path: string;
  readonly source: CommandSource;
}

interface StoredCommand {
  readonly record: CommandHostRecord;
  readonly content: string;
  readonly path: string;
}

export class CommandHost {
  constructor(private readonly env: ExecutionEnv) {}

  async discover(roots: readonly CommandSourceRoot[]): Promise<CommandHostSnapshot> {
    const stored: StoredCommand[] = [];
    const diagnostics: CommandHostDiagnostic[] = [];
    for (const root of roots) {
      validateSource(root.source);
      const rootInfo = await this.env.fileInfo(root.path);
      if (!rootInfo.ok) {
        if (rootInfo.error.code !== 'not_found') {
          diagnostics.push(diagnostic('file-info-failed', rootInfo.error.message, root.path, root));
        }
        continue;
      }
      if (rootInfo.value.kind !== 'directory') {
        diagnostics.push(
          diagnostic('invalid-root', 'Command root must be a directory.', root.path, root),
        );
        continue;
      }
      const listed = await this.env.listDir(root.path);
      if (!listed.ok) {
        diagnostics.push(diagnostic('list-failed', listed.error.message, root.path, root));
        continue;
      }
      for (const file of [...listed.value].sort((left, right) =>
        left.name.localeCompare(right.name),
      )) {
        if (file.kind !== 'file' || !file.name.endsWith('.md')) continue;
        const content = await this.env.readTextFile(file.path);
        if (!content.ok) {
          diagnostics.push(diagnostic('read-failed', content.error.message, file.path, root));
          continue;
        }
        try {
          stored.push(parseCommand(content.value, file.path, root.source));
        } catch (error) {
          diagnostics.push(
            diagnostic(
              'invalid-command',
              error instanceof Error ? error.message : String(error),
              file.path,
              root,
            ),
          );
        }
      }
    }
    return new CommandHostSnapshot(selectCommands(stored, diagnostics), Object.freeze(diagnostics));
  }
}

export function createNodeCommandHost(cwd: string): CommandHost {
  return new CommandHost(new NodeExecutionEnv({ cwd }));
}

export class CommandHostSnapshot {
  private readonly byActivationId: ReadonlyMap<string, StoredCommand>;

  constructor(
    private readonly selected: readonly StoredCommand[],
    readonly diagnostics: readonly CommandHostDiagnostic[],
  ) {
    this.byActivationId = new Map(
      selected.map((command) => [command.record.activationId, command]),
    );
  }

  get records(): readonly CommandHostRecord[] {
    return Object.freeze(this.selected.map((command) => command.record));
  }

  invokeExact(name: string, activationId: string, args?: string): string {
    const command = this.byActivationId.get(activationId);
    if (!command || command.record.name !== name) {
      throw new Error(`Command activation ${activationId} for /${name} is stale or unavailable.`);
    }
    const value = args?.trim() ?? '';
    if (value && !command.record.supportsArguments) {
      throw new Error(`Command /${name} does not accept arguments.`);
    }
    return interpolateCommand(command.content, value);
  }
}

function parseCommand(content: string, filePath: string, source: CommandSource): StoredCommand {
  const normalized = content.replace(/\r\n?/gu, '\n');
  if (!normalized.startsWith('---\n')) throw new Error('Command requires YAML frontmatter.');
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) throw new Error('Command frontmatter is not terminated.');
  const parsed = parseYaml(normalized.slice(4, end));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Command frontmatter must be an object.');
  }
  const metadata = parsed as Record<string, unknown>;
  const allowed = new Set(['name', 'description', 'argument-hint', 'supports-arguments']);
  const unknown = Object.keys(metadata).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Command contains unsupported field '${unknown}'.`);
  const name = basename(filePath, '.md');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(name)) {
    throw new Error(`Command filename '${name}' is invalid.`);
  }
  if (metadata['name'] !== undefined && metadata['name'] !== name) {
    throw new Error(`Command name must match filename '${name}'.`);
  }
  const description = requireText(metadata['description'], 'Command description');
  if (description.length > 1024) throw new Error('Command description is too long.');
  const argumentHint = metadata['argument-hint'];
  if (argumentHint !== undefined && (typeof argumentHint !== 'string' || !argumentHint.trim())) {
    throw new Error('Command argument hint must be a non-empty string.');
  }
  const supportsArguments = metadata['supports-arguments'] ?? false;
  if (typeof supportsArguments !== 'boolean') {
    throw new Error('Command supports-arguments must be a boolean.');
  }
  const body = normalized.slice(end + 5).trim();
  if (!body) throw new Error('Command body is required.');
  const fingerprint = createHash('sha256')
    .update(sourceIdentity(source))
    .update('\0')
    .update(name)
    .update('\0')
    .update(description)
    .update('\0')
    .update(argumentHint ?? '')
    .update('\0')
    .update(supportsArguments ? 'arguments' : 'no-arguments')
    .update('\0')
    .update(body)
    .digest('hex');
  return {
    record: Object.freeze({
      name,
      description,
      source: Object.freeze({ ...source }),
      fingerprint,
      activationId: `command:${sourceIdentity(source)}:${fingerprint}`,
      ...(argumentHint === undefined ? {} : { argumentHint: argumentHint.trim() }),
      supportsArguments,
    }),
    content: body,
    path: filePath,
  };
}

function selectCommands(
  commands: readonly StoredCommand[],
  diagnostics: CommandHostDiagnostic[],
): readonly StoredCommand[] {
  const priority = { project: 3, personal: 2, plugin: 1 } as const;
  const selected = new Map<string, StoredCommand>();
  for (const command of [...commands].sort((left, right) => {
    const byPriority = priority[right.record.source.kind] - priority[left.record.source.kind];
    return (
      byPriority ||
      sourceIdentity(left.record.source).localeCompare(sourceIdentity(right.record.source))
    );
  })) {
    const current = selected.get(command.record.name);
    if (!current) {
      selected.set(command.record.name, command);
      continue;
    }
    diagnostics.push({
      code: 'duplicate-command',
      message: `Command /${command.record.name} from ${sourceIdentity(command.record.source)} is shadowed by ${sourceIdentity(current.record.source)}.`,
      path: command.path,
      source: command.record.source,
    });
  }
  return Object.freeze([...selected.values()]);
}

function interpolateCommand(content: string, args: string): string {
  const positional = parseArguments(args);
  return content
    .replaceAll('$ARGUMENTS', args)
    .replace(
      /\$(\d{1,2})(?!\d)/gu,
      (_match, ordinal: string) => positional[Number(ordinal) - 1] ?? '',
    );
}

function parseArguments(value: string): readonly string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/u.test(character)) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += character;
    }
  }
  if (escaped || quote) throw new Error('Command arguments contain an unfinished escape or quote.');
  if (current) args.push(current);
  return Object.freeze(args);
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function validateSource(source: CommandSource): void {
  if (
    source.kind === 'plugin' &&
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*@[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(source.pluginId)
  ) {
    throw new Error('Plugin id is invalid.');
  }
}

function sourceIdentity(source: CommandSource): string {
  return source.kind === 'plugin' ? `plugin:${source.pluginId}` : source.kind;
}

function diagnostic(
  code: CommandHostDiagnostic['code'],
  message: string,
  path: string,
  root: CommandSourceRoot,
): CommandHostDiagnostic {
  return { code, message, path, source: root.source };
}
