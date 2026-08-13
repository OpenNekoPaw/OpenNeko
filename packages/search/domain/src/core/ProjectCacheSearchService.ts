import type {
  ProjectIndexChangeEvent,
  ProjectIndexChangedRef,
  ProjectIndexUpdateReason,
  ProjectSearchAdapter,
  ProjectSearchPartitionKind,
  ProjectSearchQuery,
  ProjectSearchResult,
  ProjectSemanticCoverageQuery,
  ProjectSemanticCoverageResult,
} from '../contracts';
import { ProjectIndexCoordinator } from './ProjectIndexCoordinator';
import type {
  ProjectSearchDisposable,
  ProjectSearchEvent,
  ProjectSearchRuntimePorts,
  ProjectSemanticCoverageProvider,
} from './ports';

export class ProjectCacheSearchService implements ProjectSearchDisposable {
  readonly onDidChangeProjectIndex: ProjectSearchEvent<ProjectIndexChangeEvent>;

  constructor(private readonly coordinator: ProjectIndexCoordinator) {
    this.onDidChangeProjectIndex = this.coordinator.onDidChangeProjectIndex;
  }

  static create(ports: ProjectSearchRuntimePorts): ProjectCacheSearchService {
    return new ProjectCacheSearchService(new ProjectIndexCoordinator(ports));
  }

  registerAdapter(adapter: ProjectSearchAdapter): ProjectSearchDisposable {
    return this.coordinator.registerAdapter(adapter);
  }

  registerSemanticCoverageProvider(
    provider: ProjectSemanticCoverageProvider,
  ): ProjectSearchDisposable {
    return this.coordinator.registerSemanticCoverageProvider(provider);
  }

  async ensureInitialized(projectRoot?: string): Promise<void> {
    await this.coordinator.ensureInitialized(projectRoot);
  }

  async query(query: ProjectSearchQuery): Promise<ProjectSearchResult> {
    const result = await this.coordinator.query(query);
    return {
      query,
      context: result.context,
      items: result.items,
      partitions: result.partitions,
      freshness: result.freshness,
    };
  }

  async querySemanticCoverage(
    query: ProjectSemanticCoverageQuery,
  ): Promise<ProjectSemanticCoverageResult> {
    return this.coordinator.querySemanticCoverage(query);
  }

  async refresh(
    projectRoot: string,
    reason: ProjectIndexUpdateReason,
    options: {
      readonly partition?: ProjectSearchPartitionKind;
      readonly changedRefs?: readonly ProjectIndexChangedRef[];
    } = {},
  ): Promise<void> {
    await this.coordinator.refresh(projectRoot, reason, options);
  }

  getStatus(projectRoot?: string) {
    return this.coordinator.getStatus(projectRoot);
  }

  dispose(): void {
    this.coordinator.dispose();
  }
}
