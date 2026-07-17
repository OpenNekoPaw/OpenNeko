import type { ILogger } from '../logger/types';
import type { ApplyPortableSourcePolicyOptions, PortableSourcePathPolicy } from './source-policy';
import type { ProjectFileDiagnostic } from './diagnostics';
import type { ProjectFileSaveReason, ProjectFileSaveResponse, ProjectFileStore } from './store';

export interface ProjectFileSaveSessionOptions<TDocument> {
  readonly formatId: string;
  readonly store: ProjectFileStore;
  readonly sourcePolicy?: PortableSourcePathPolicy<TDocument>;
  readonly createSourcePolicyOptions?: (
    uri: ProjectFileSaveTargetUri,
  ) => ApplyPortableSourcePolicyOptions;
  readonly logger?: Pick<ILogger, 'debug' | 'warn'>;
}

export interface ProjectFileSaveTargetUri {
  readonly fsPath: string;
}

export interface ProjectFileSaveSessionSaveRequest<TDocument> {
  readonly targetUri: ProjectFileSaveTargetUri;
  readonly document: TDocument;
  readonly saveReason?: ProjectFileSaveReason;
  readonly atomic?: boolean;
  readonly defaultMessage: string;
  readonly sourceUri?: ProjectFileSaveTargetUri;
  readonly sourcePolicyOptions?: ApplyPortableSourcePolicyOptions;
  readonly useSaveAs?: boolean;
}

export interface ProjectFileSaveSessionBackupRequest<TDocument> {
  readonly documentUri: ProjectFileSaveTargetUri;
  readonly backupUri: ProjectFileSaveTargetUri;
  readonly document: TDocument;
  readonly defaultMessage: string;
  readonly sourcePolicyOptions?: ApplyPortableSourcePolicyOptions;
}

export class ProjectFileSaveSession<TDocument> {
  protected readonly formatId: string;
  private readonly store: ProjectFileStore;
  private readonly sourcePolicy?: PortableSourcePathPolicy<TDocument>;
  private readonly createSourcePolicyOptions?: (
    uri: ProjectFileSaveTargetUri,
  ) => ApplyPortableSourcePolicyOptions;
  private readonly logger?: Pick<ILogger, 'debug' | 'warn'>;

  constructor(options: ProjectFileSaveSessionOptions<TDocument>) {
    this.formatId = options.formatId;
    this.store = options.store;
    this.sourcePolicy = options.sourcePolicy;
    this.createSourcePolicyOptions = options.createSourcePolicyOptions;
    this.logger = options.logger;
  }

  async save(
    request: ProjectFileSaveSessionSaveRequest<TDocument>,
  ): Promise<ProjectFileSaveResponse<TDocument>> {
    const sourcePolicyOptions =
      request.sourcePolicyOptions ??
      this.createSourcePolicyOptions?.(request.sourceUri ?? request.targetUri);
    const saveRequest = {
      filePath: request.targetUri.fsPath,
      formatId: this.formatId,
      document: request.document,
      ...(this.sourcePolicy ? { sourcePolicy: this.sourcePolicy } : {}),
      ...(sourcePolicyOptions ? { sourcePolicyOptions } : {}),
      saveReason: request.saveReason ?? 'manual',
      atomic: request.atomic ?? false,
    };
    const result = request.useSaveAs
      ? await this.store.saveAs<TDocument>(saveRequest)
      : await this.store.save<TDocument>(saveRequest);

    this.logSaveResult(request.targetUri, request.saveReason ?? 'manual', result);
    if (!result.ok) {
      throw new Error(formatProjectFileDiagnostics(result.diagnostics, request.defaultMessage));
    }
    return result;
  }

  async backup(
    request: ProjectFileSaveSessionBackupRequest<TDocument>,
  ): Promise<ProjectFileSaveResponse<TDocument>> {
    const sourcePolicyOptions =
      request.sourcePolicyOptions ?? this.createSourcePolicyOptions?.(request.documentUri);
    const result = await this.store.backup<TDocument>({
      filePath: request.documentUri.fsPath,
      backupPath: request.backupUri.fsPath,
      formatId: this.formatId,
      document: request.document,
      ...(this.sourcePolicy ? { sourcePolicy: this.sourcePolicy } : {}),
      ...(sourcePolicyOptions ? { sourcePolicyOptions } : {}),
      saveReason: 'backup',
    });

    this.logSaveResult(request.backupUri, 'backup', result);
    if (!result.ok) {
      throw new Error(formatProjectFileDiagnostics(result.diagnostics, request.defaultMessage));
    }
    return result;
  }

  private logSaveResult(
    uri: ProjectFileSaveTargetUri,
    saveReason: ProjectFileSaveReason,
    result: ProjectFileSaveResponse<TDocument>,
  ): void {
    if (!this.logger) return;
    const payload = {
      formatId: this.formatId,
      filePath: uri.fsPath,
      saveReason,
      written: result.written,
      diagnosticCodes: result.diagnostics.map((diagnostic) => diagnostic.code),
    };
    if (result.ok) {
      this.logger.debug('projectFile.saveSession', payload);
    } else {
      this.logger.warn('projectFile.saveSession', payload);
    }
  }
}

export function formatProjectFileDiagnostics(
  diagnostics: readonly Pick<ProjectFileDiagnostic, 'message'>[],
  defaultMessage: string,
): string {
  if (diagnostics.length === 0) return defaultMessage;
  return `${defaultMessage}: ${diagnostics.map((diagnostic) => diagnostic.message).join('; ')}`;
}
