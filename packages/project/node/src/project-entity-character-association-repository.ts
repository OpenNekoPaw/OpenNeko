import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  PROJECT_ENTITY_CHARACTER_ASSOCIATION_DIRECTORY,
  decodeAssociationRecordName,
  parseProjectEntityCharacterAssociationJson,
  projectEntityCharacterAssociationRelativePath,
  serializeProjectEntityCharacterAssociationFact,
  type ProjectEntityCharacterAssociationDiagnostic,
  type ProjectEntityCharacterAssociationFact,
} from '@neko/project-domain/contracts';

const MAX_ASSOCIATION_BYTES = 64 * 1024;
const MAX_ASSOCIATIONS = 10_000;

export interface ProjectEntityCharacterAssociationListResult {
  readonly associations: readonly ProjectEntityCharacterAssociationFact[];
  readonly diagnostics: readonly ProjectEntityCharacterAssociationDiagnostic[];
}

export class ProjectEntityCharacterAssociationRepository {
  private readonly directoryPath: string;

  constructor(
    private readonly workspaceRoot: string,
    private readonly projectId: string,
  ) {
    if (!path.isAbsolute(workspaceRoot)) {
      throw new Error('Project association repository requires an absolute Workspace root.');
    }
    this.directoryPath = path.join(
      workspaceRoot,
      ...PROJECT_ENTITY_CHARACTER_ASSOCIATION_DIRECTORY.split('/'),
    );
  }

  async list(): Promise<ProjectEntityCharacterAssociationListResult> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.directoryPath, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return { associations: [], diagnostics: [] };
      throw error;
    }
    const records = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .sort((left, right) => left.name.localeCompare(right.name, 'en-US'));
    if (records.length > MAX_ASSOCIATIONS) {
      throw new Error(`Project association count exceeds ${MAX_ASSOCIATIONS}.`);
    }

    const associations: ProjectEntityCharacterAssociationFact[] = [];
    const diagnostics: ProjectEntityCharacterAssociationDiagnostic[] = [];
    for (const entry of records) {
      const recordName = entry.name.slice(0, -'.json'.length);
      try {
        const entityId = decodeAssociationRecordName(recordName);
        const filePath = path.join(this.directoryPath, entry.name);
        const stat = await fs.lstat(filePath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_ASSOCIATION_BYTES) {
          throw new Error('Association must be one bounded regular file.');
        }
        const association = parseProjectEntityCharacterAssociationJson(
          await fs.readFile(filePath, 'utf8'),
        );
        if (association.projectId !== this.projectId || association.entityId !== entityId) {
          throw new Error('Association identity does not match its Project-owned record path.');
        }
        associations.push(association);
      } catch (error) {
        diagnostics.push({
          code: 'project-entity-character-association-invalid',
          projectId: this.projectId,
          recordName,
          message: String(error),
        });
      }
    }
    return { associations, diagnostics };
  }

  async save(association: ProjectEntityCharacterAssociationFact): Promise<void> {
    if (association.projectId !== this.projectId) {
      throw new Error('Project association belongs to another Project.');
    }
    const relativePath = projectEntityCharacterAssociationRelativePath(association.entityId);
    const destinationPath = path.join(this.workspaceRoot, ...relativePath.split('/'));
    await fs.mkdir(this.directoryPath, { recursive: true });
    const temporaryPath = path.join(this.directoryPath, `.${randomUUID()}.tmp`);
    try {
      await fs.writeFile(
        temporaryPath,
        serializeProjectEntityCharacterAssociationFact(association),
        { encoding: 'utf8', flag: 'wx', mode: 0o600 },
      );
      await fs.rename(temporaryPath, destinationPath);
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  async remove(entityId: string): Promise<void> {
    const relativePath = projectEntityCharacterAssociationRelativePath(entityId);
    await fs.unlink(path.join(this.workspaceRoot, ...relativePath.split('/')));
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Reflect.get(error, 'code') === code
  );
}
