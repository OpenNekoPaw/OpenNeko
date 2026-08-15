import { createHash, randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  PROJECT_MEDIA_LIBRARY_BINDING_DIRECTORY,
  parseProjectMediaLibraryBindingJson,
  parseConfirmedProjectMediaLibraryRecovery,
  projectMediaLibraryBindingRelativePath,
  serializeProjectMediaLibraryBinding,
  type ConfirmedProjectMediaLibraryRecovery,
  type ProjectMediaLibraryBinding,
  type ProjectMediaLibraryDiagnostic,
} from '@neko/assets-domain/contracts';

const MAX_BINDING_BYTES = 64 * 1024;
const MAX_BINDING_RECORDS = 512;

export type ProjectMediaLibraryBindingReadResult =
  | { readonly status: 'absent'; readonly libraryName: string }
  | { readonly status: 'available'; readonly binding: ProjectMediaLibraryBinding }
  | {
      readonly status: 'invalid';
      readonly libraryName: string;
      readonly diagnostic: ProjectMediaLibraryDiagnostic;
    };

export interface ProjectMediaLibraryBindingListResult {
  readonly bindings: readonly ProjectMediaLibraryBinding[];
  readonly diagnostics: readonly ProjectMediaLibraryDiagnostic[];
}

export class ProjectMediaLibraryBindingRepository {
  private readonly directoryPath: string;

  constructor(
    private readonly workspaceRoot: string,
    private readonly projectId: string,
  ) {
    this.directoryPath = path.join(
      workspaceRoot,
      ...PROJECT_MEDIA_LIBRARY_BINDING_DIRECTORY.split('/'),
    );
  }

  async list(): Promise<ProjectMediaLibraryBindingListResult> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.directoryPath, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return { bindings: [], diagnostics: [] };
      throw error;
    }

    const recognized = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .sort((left, right) => left.name.localeCompare(right.name, 'en-US'));
    if (recognized.length > MAX_BINDING_RECORDS) {
      throw new Error(`Project Media Library binding count exceeds ${MAX_BINDING_RECORDS}.`);
    }

    const bindings: ProjectMediaLibraryBinding[] = [];
    const diagnostics: ProjectMediaLibraryDiagnostic[] = [];
    for (const entry of recognized) {
      const libraryName = entry.name.slice(0, -'.json'.length);
      let result: ProjectMediaLibraryBindingReadResult;
      try {
        result = await this.read(libraryName);
      } catch (error) {
        diagnostics.push(invalidDiagnostic(this.projectId, libraryName, String(error)));
        continue;
      }
      if (result.status === 'available') bindings.push(result.binding);
      if (result.status === 'invalid') diagnostics.push(result.diagnostic);
    }
    return { bindings, diagnostics };
  }

  async read(libraryName: string): Promise<ProjectMediaLibraryBindingReadResult> {
    const filePath = bindingPath(this.workspaceRoot, libraryName);
    try {
      const stat = await fs.lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BINDING_BYTES) {
        return invalidResult(
          this.projectId,
          libraryName,
          'Project Media Library binding must be one bounded regular file.',
        );
      }
      const binding = parseProjectMediaLibraryBindingJson(await fs.readFile(filePath, 'utf8'));
      if (
        binding.projectId !== this.projectId ||
        binding.libraryName !== libraryName ||
        binding.bindingFingerprint !== createProjectMediaLibraryBindingFingerprint(binding)
      ) {
        return invalidResult(
          this.projectId,
          libraryName,
          'Project Media Library binding identity or fingerprint does not match its owner.',
        );
      }
      return { status: 'available', binding };
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return { status: 'absent', libraryName };
      return invalidResult(
        this.projectId,
        libraryName,
        'Project Media Library binding could not be decoded.',
      );
    }
  }

  async applyRecovery(
    confirmation: ConfirmedProjectMediaLibraryRecovery,
  ): Promise<ProjectMediaLibraryBinding> {
    const parsedConfirmation = parseConfirmedProjectMediaLibraryRecovery(confirmation);
    if (parsedConfirmation.plan.projectId !== this.projectId) {
      throw new Error('Project Media Library recovery confirmation is invalid.');
    }
    const plan = parsedConfirmation.plan;
    const binding = await this.apply({
      libraryName: plan.libraryName,
      connectionId: plan.connectionId,
      expectedBindingFingerprint: plan.expectedBindingFingerprint,
    });
    if (binding.bindingFingerprint !== plan.replacementBindingFingerprint) {
      throw new Error('Project Media Library replacement fingerprint is invalid.');
    }
    return binding;
  }

  async apply(input: {
    readonly libraryName: string;
    readonly connectionId: string;
    readonly expectedBindingFingerprint: string | null;
  }): Promise<ProjectMediaLibraryBinding> {
    const binding: ProjectMediaLibraryBinding = {
      projectId: this.projectId,
      libraryName: input.libraryName,
      connectionId: input.connectionId,
      bindingFingerprint: createProjectMediaLibraryBindingFingerprint({
        projectId: this.projectId,
        libraryName: input.libraryName,
        connectionId: input.connectionId,
      }),
    };

    await this.assertExpectedBinding(input.libraryName, input.expectedBindingFingerprint);
    await fs.mkdir(this.directoryPath, { recursive: true });
    const destinationPath = bindingPath(this.workspaceRoot, input.libraryName);
    const temporaryPath = path.join(
      this.directoryPath,
      `.${input.libraryName}.${randomUUID()}.tmp`,
    );
    try {
      await fs.writeFile(temporaryPath, serializeProjectMediaLibraryBinding(binding), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await this.assertExpectedBinding(input.libraryName, input.expectedBindingFingerprint);
      await fs.rename(temporaryPath, destinationPath);
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
    return binding;
  }

  async remove(input: {
    readonly libraryName: string;
    readonly expectedBindingFingerprint: string;
  }): Promise<void> {
    const current = await this.read(input.libraryName);
    if (
      current.status !== 'available' ||
      current.binding.bindingFingerprint !== input.expectedBindingFingerprint
    ) {
      throw new Error('Project Media Library binding changed before removal.');
    }
    await fs.unlink(bindingPath(this.workspaceRoot, input.libraryName));
  }

  private async assertExpectedBinding(
    libraryName: string,
    expectedBindingFingerprint: string | null,
  ): Promise<void> {
    const current = await this.read(libraryName);
    if (current.status === 'invalid') {
      throw new Error('Invalid Project Media Library binding must be repaired explicitly.');
    }
    const actual = current.status === 'available' ? current.binding.bindingFingerprint : null;
    if (actual !== expectedBindingFingerprint) {
      throw new Error('Project Media Library binding changed after recovery was planned.');
    }
  }
}

export function createProjectMediaLibraryBindingFingerprint(input: {
  readonly projectId: string;
  readonly libraryName: string;
  readonly connectionId: string;
}): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([input.projectId, input.libraryName, input.connectionId]))
    .digest('base64url');
  return `sha256:${digest}`;
}

function bindingPath(workspaceRoot: string, libraryName: string): string {
  return path.join(
    workspaceRoot,
    ...projectMediaLibraryBindingRelativePath(libraryName).split('/'),
  );
}

function invalidResult(
  projectId: string,
  libraryName: string,
  message: string,
): ProjectMediaLibraryBindingReadResult {
  return {
    status: 'invalid',
    libraryName,
    diagnostic: invalidDiagnostic(projectId, libraryName, message),
  };
}

function invalidDiagnostic(
  projectId: string,
  libraryName: string,
  message: string,
): ProjectMediaLibraryDiagnostic {
  return { code: 'binding-invalid', projectId, libraryName, message };
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Reflect.get(error, 'code') === code
  );
}
