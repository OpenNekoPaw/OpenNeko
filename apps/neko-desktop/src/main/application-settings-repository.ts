import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
  DesktopApplicationSettingsContractError,
  parseDesktopApplicationPreferences,
} from '@neko/host/application-settings';
import type {
  DesktopApplicationSettingsRepositoryPort,
  DesktopApplicationSettingsStoredState,
} from '@neko/host/application-settings-service';

export interface DesktopApplicationSettingsFilePort {
  readTextIfExists(): Promise<string | null>;
  writeTextAtomic(content: string): Promise<void>;
}

export class DesktopApplicationSettingsRepository implements DesktopApplicationSettingsRepositoryPort {
  constructor(private readonly file: DesktopApplicationSettingsFilePort) {}

  async read(): Promise<DesktopApplicationSettingsStoredState> {
    const content = await this.file.readTextIfExists();
    if (content === null) return createDefaultDesktopApplicationSettingsState();
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw invalidState(
        `Desktop application settings are not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return parseDesktopApplicationSettingsStoredState(parsed);
  }

  async commit(
    expectedRevision: number,
    next: DesktopApplicationSettingsStoredState,
  ): Promise<DesktopApplicationSettingsStoredState> {
    const current = await this.read();
    if (current.storageRevision !== expectedRevision) {
      throw new DesktopApplicationSettingsContractError(
        'desktop-application-settings-stale-revision',
        `Desktop settings revision ${expectedRevision} is stale; current revision is ${current.storageRevision}.`,
      );
    }
    const parsed = parseDesktopApplicationSettingsStoredState(next);
    if (parsed.storageRevision !== expectedRevision + 1) {
      throw invalidState(
        `Desktop settings commit must advance revision from ${expectedRevision} to ${expectedRevision + 1}.`,
      );
    }
    await this.file.writeTextAtomic(`${JSON.stringify(parsed, null, 2)}\n`);
    return parsed;
  }
}

export function createNodeDesktopApplicationSettingsFilePort(
  filePath: string,
): DesktopApplicationSettingsFilePort {
  const absolutePath = path.resolve(filePath);
  return {
    async readTextIfExists(): Promise<string | null> {
      try {
        return await readFile(absolutePath, 'utf8');
      } catch (error) {
        if (hasNodeErrorCode(error, 'ENOENT')) return null;
        throw error;
      }
    },
    async writeTextAtomic(content: string): Promise<void> {
      const temporaryPath = `${absolutePath}.tmp-${randomUUID()}`;
      await mkdir(path.dirname(absolutePath), { recursive: true });
      try {
        await writeFile(temporaryPath, content, {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
        await rename(temporaryPath, absolutePath);
      } finally {
        await rm(temporaryPath, { force: true });
      }
    },
  };
}

function createDefaultDesktopApplicationSettingsState(): DesktopApplicationSettingsStoredState {
  return {
    schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
    storageRevision: 0,
    preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  };
}

function parseDesktopApplicationSettingsStoredState(
  value: unknown,
): DesktopApplicationSettingsStoredState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidState('Desktop application settings must be an object.');
  }
  const record = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record).sort();
  const expected = ['preferences', 'schemaVersion', 'storageRevision'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw invalidState(`Desktop application settings have unexpected fields: ${keys.join(', ')}.`);
  }
  const schemaVersion = record['schemaVersion'];
  if (schemaVersion !== 1 && schemaVersion !== DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION) {
    throw new DesktopApplicationSettingsContractError(
      'unsupported-desktop-application-settings-version',
      `Unsupported Desktop application settings version '${String(schemaVersion)}'.`,
    );
  }
  const storageRevision = parseStorageRevision(record['storageRevision']);
  if (schemaVersion === 1) {
    const migratedPreferences = parseDesktopApplicationPreferences(record['preferences']);
    return {
      schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
      storageRevision,
      preferences: {
        ...migratedPreferences,
        startupTarget: 'home',
      },
    };
  }
  return {
    schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
    storageRevision,
    preferences: parseDesktopApplicationPreferences(record['preferences']),
  };
}

function parseStorageRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidState('Desktop application settings storage revision is invalid.');
  }
  return value;
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === code
  );
}

function invalidState(message: string): DesktopApplicationSettingsContractError {
  return new DesktopApplicationSettingsContractError(
    'invalid-desktop-application-settings-payload',
    message,
  );
}
