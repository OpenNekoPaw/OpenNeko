import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { DesktopRetiredJsonStatePort } from '@neko/local-metadata';

export function createDesktopRetiredJsonStatePort(options: {
  readonly shellStatePath: string;
  readonly applicationSettingsPath: string;
}): DesktopRetiredJsonStatePort {
  const paths = {
    shell: path.resolve(options.shellStatePath),
    'application-settings': path.resolve(options.applicationSettingsPath),
  } as const;
  return Object.freeze({
    read: (authority: 'shell' | 'application-settings') => readTextIfExists(paths[authority]),
    archive: async (authority: 'shell' | 'application-settings') => {
      const destination = `${paths[authority]}.migrated-v1`;
      if (await pathExists(destination)) {
        throw new Error(`Desktop legacy state archive already exists: ${destination}`);
      }
      await rename(paths[authority], destination);
    },
    publishPair: (input: { readonly shell: string; readonly applicationSettings: string }) =>
      publishPair(
        [
          { target: paths.shell, content: input.shell },
          {
            target: paths['application-settings'],
            content: input.applicationSettings,
          },
        ],
        randomUUID(),
      ),
  });
}

async function publishPair(
  entries: readonly { readonly target: string; readonly content: string }[],
  operationId: string,
): Promise<void> {
  const prepared = entries.map((entry) => ({
    ...entry,
    stage: `${entry.target}.export-${operationId}.tmp`,
    backup: `${entry.target}.export-${operationId}.bak`,
    hadOriginal: false,
    published: false,
  }));
  let preserveBackups = false;
  try {
    for (const entry of prepared) {
      await mkdir(path.dirname(entry.target), { recursive: true });
      await writeFile(entry.stage, entry.content, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      JSON.parse(await readFile(entry.stage, 'utf8'));
    }
    for (const entry of prepared) {
      if ((await readTextIfExists(entry.target)) === null) continue;
      await rename(entry.target, entry.backup);
      entry.hadOriginal = true;
    }
    for (const entry of prepared) {
      await rename(entry.stage, entry.target);
      entry.published = true;
    }
    await Promise.all(prepared.map((entry) => rm(entry.backup, { force: true })));
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const entry of [...prepared].reverse()) {
      try {
        if (entry.published) await rm(entry.target, { force: true });
        if (entry.hadOriginal) await rename(entry.backup, entry.target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      preserveBackups = true;
      throw new AggregateError(
        [error, ...rollbackErrors],
        'Desktop downgrade export failed and could not fully restore its destinations.',
      );
    }
    throw error;
  } finally {
    await Promise.all(
      prepared.flatMap((entry) => [
        rm(entry.stage, { force: true }),
        ...(preserveBackups ? [] : [rm(entry.backup, { force: true })]),
      ]),
    );
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return false;
    throw error;
  }
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return null;
    throw error;
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
