import type { ProjectFileDiagnostic } from './diagnostics';
import type {
  ProjectFileBackupRequest,
  ProjectFileLoadRequest,
  ProjectFileLoadResponse,
  ProjectFileSaveRequest,
  ProjectFileSaveResponse,
} from './store';

export type ProjectDocumentState = 'clean' | 'dirty' | 'saving' | 'readonly' | 'error';

export interface ProjectDocumentSnapshot<TDocument> {
  readonly filePath?: string;
  readonly formatId: string;
  readonly document: TDocument;
  readonly state: ProjectDocumentState;
  readonly version: number;
  readonly diagnostics: readonly ProjectFileDiagnostic[];
}

export interface ProjectDocumentEdit<TDocument> {
  readonly description?: string;
  apply(document: TDocument): TDocument;
}

export interface ProjectDocumentHost<TDocument> {
  readonly snapshot: ProjectDocumentSnapshot<TDocument>;
  applyEdit(edit: ProjectDocumentEdit<TDocument>): ProjectDocumentSnapshot<TDocument>;
  markClean(): ProjectDocumentSnapshot<TDocument>;
  markReadonly(diagnostics?: readonly ProjectFileDiagnostic[]): ProjectDocumentSnapshot<TDocument>;
  markError(diagnostics: readonly ProjectFileDiagnostic[]): ProjectDocumentSnapshot<TDocument>;
}

export interface ProjectDocumentPersistenceHost<TDocument> {
  load(request: ProjectFileLoadRequest<TDocument>): Promise<ProjectFileLoadResponse<TDocument>>;
  save(request: ProjectFileSaveRequest<TDocument>): Promise<ProjectFileSaveResponse>;
  saveAs(request: ProjectFileSaveRequest<TDocument>): Promise<ProjectFileSaveResponse>;
  backup(request: ProjectFileBackupRequest<TDocument>): Promise<ProjectFileSaveResponse>;
  revert(request: ProjectFileLoadRequest<TDocument>): Promise<ProjectFileLoadResponse<TDocument>>;
}

export class InMemoryProjectDocumentHost<TDocument> implements ProjectDocumentHost<TDocument> {
  private current: ProjectDocumentSnapshot<TDocument>;

  constructor(
    snapshot: Omit<ProjectDocumentSnapshot<TDocument>, 'state' | 'version'> & {
      readonly state?: ProjectDocumentState;
      readonly version?: number;
    },
  ) {
    this.current = {
      ...snapshot,
      state: snapshot.state ?? 'clean',
      version: snapshot.version ?? 0,
    };
  }

  get snapshot(): ProjectDocumentSnapshot<TDocument> {
    return this.current;
  }

  applyEdit(edit: ProjectDocumentEdit<TDocument>): ProjectDocumentSnapshot<TDocument> {
    this.current = {
      ...this.current,
      document: edit.apply(this.current.document),
      state: this.current.state === 'readonly' ? 'readonly' : 'dirty',
      version: this.current.version + 1,
    };
    return this.current;
  }

  markClean(): ProjectDocumentSnapshot<TDocument> {
    this.current = { ...this.current, state: 'clean', diagnostics: [] };
    return this.current;
  }

  markReadonly(
    diagnostics: readonly ProjectFileDiagnostic[] = this.current.diagnostics,
  ): ProjectDocumentSnapshot<TDocument> {
    this.current = { ...this.current, state: 'readonly', diagnostics };
    return this.current;
  }

  markError(diagnostics: readonly ProjectFileDiagnostic[]): ProjectDocumentSnapshot<TDocument> {
    this.current = { ...this.current, state: 'error', diagnostics };
    return this.current;
  }
}
