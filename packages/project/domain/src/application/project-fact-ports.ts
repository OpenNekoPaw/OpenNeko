import type {
  ProjectDependencySnapshot,
  ProjectEntityCharacterAssociationDiagnostic,
  ProjectEntityCharacterAssociationFact,
} from '../contracts';

export interface ProjectEntityCharacterAssociationCatalog {
  readonly associations: readonly ProjectEntityCharacterAssociationFact[];
  readonly diagnostics: readonly ProjectEntityCharacterAssociationDiagnostic[];
}

export interface ProjectEntityCharacterAssociationReaderPort {
  list(): Promise<ProjectEntityCharacterAssociationCatalog>;
}

export interface ProjectEntityCharacterAssociationWriterPort {
  save(association: ProjectEntityCharacterAssociationFact): Promise<void>;
}

export interface ProjectDependencyReaderPort {
  readDependencies(projectId: string, signal?: AbortSignal): Promise<ProjectDependencySnapshot>;
}
