import { createProjectFileDiagnostic, type ProjectFileDiagnostic } from './diagnostics';

export interface ProjectFormatLoadContext {
  readonly filePath?: string;
  readonly formatId?: string;
}

export interface ProjectFormatSaveContext {
  readonly filePath?: string;
  readonly formatId?: string;
  readonly indent?: number;
}

export interface ProjectFormatMigrationMetadata {
  readonly fromVersion?: string;
  readonly toVersion?: string;
  readonly appliedMigrations?: readonly string[];
  readonly warnings?: readonly string[];
}

export interface ProjectFormatCompatibility {
  readonly loadedVersion?: string;
  readonly currentVersion: string;
  readonly mode: 'current' | 'migrated' | 'future' | 'invalid';
  readonly readOnly: boolean;
  readonly warnings: readonly string[];
}

export interface ProjectFormatLoadResult<TDocument> {
  readonly document: TDocument;
  readonly diagnostics: readonly ProjectFileDiagnostic[];
  readonly migration?: ProjectFormatMigrationMetadata;
  readonly compatibility?: ProjectFormatCompatibility;
  readonly raw?: unknown;
}

export interface ProjectFormatSaveResult {
  readonly content: string;
  readonly diagnostics: readonly ProjectFileDiagnostic[];
}

export interface ProjectFormatCodec<TDocument> {
  readonly formatId: string;
  readonly fileExtensions: readonly string[];
  readonly currentVersion: string;
  load(json: string, context: ProjectFormatLoadContext): ProjectFormatLoadResult<TDocument>;
  save(document: TDocument, context: ProjectFormatSaveContext): ProjectFormatSaveResult;
}

export class ProjectFormatCodecRegistry {
  private readonly codecsByFormatId = new Map<string, ProjectFormatCodec<unknown>>();
  private readonly formatIdByExtension = new Map<string, string>();

  register<TDocument>(codec: ProjectFormatCodec<TDocument>): void {
    const formatId = normalizeFormatId(codec.formatId);
    if (!formatId) {
      throw new Error('Project format codec requires a formatId.');
    }

    if (this.codecsByFormatId.has(formatId)) {
      throw new Error(`Project format codec already registered: ${formatId}`);
    }

    this.codecsByFormatId.set(formatId, codec as ProjectFormatCodec<unknown>);

    for (const extension of codec.fileExtensions) {
      const normalized = normalizeExtension(extension);
      if (!normalized) continue;
      const existingFormatId = this.formatIdByExtension.get(normalized);
      if (existingFormatId && existingFormatId !== formatId) {
        throw new Error(
          `Project file extension ${normalized} already registered for ${existingFormatId}.`,
        );
      }
      this.formatIdByExtension.set(normalized, formatId);
    }
  }

  get(formatId: string): ProjectFormatCodec<unknown> | undefined {
    return this.codecsByFormatId.get(normalizeFormatId(formatId));
  }

  getByExtension(filePathOrExtension: string): ProjectFormatCodec<unknown> | undefined {
    const extension = normalizeExtension(getExtension(filePathOrExtension));
    if (!extension) return undefined;
    const formatId = this.formatIdByExtension.get(extension);
    return formatId ? this.codecsByFormatId.get(formatId) : undefined;
  }

  requireByExtension(filePathOrExtension: string): ProjectFormatCodec<unknown> {
    const codec = this.getByExtension(filePathOrExtension);
    if (!codec) {
      throw new Error(`No project format codec registered for ${filePathOrExtension}.`);
    }
    return codec;
  }

  list(): readonly ProjectFormatCodec<unknown>[] {
    return [...this.codecsByFormatId.values()];
  }
}

export function diagnosticFromUnknownError(
  code: ProjectFileDiagnostic['code'],
  messagePrefix: string,
  error: unknown,
): ProjectFileDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  return createProjectFileDiagnostic({
    code,
    message: `${messagePrefix}: ${message}`,
  });
}

function normalizeFormatId(formatId: string): string {
  return formatId.trim().toLowerCase();
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

function getExtension(filePathOrExtension: string): string {
  const normalized = filePathOrExtension.replace(/\\/g, '/');
  const fileName = normalized.split('/').pop() ?? normalized;
  const index = fileName.lastIndexOf('.');
  if (index < 0) return filePathOrExtension;
  return fileName.slice(index);
}
