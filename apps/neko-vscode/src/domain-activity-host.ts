import type { GenerationJobPort } from '@neko/generation';
import { projectGenerationJobActivity } from '@neko/generation';
import {
  createDomainActivityProjector,
  type DomainActivityCommandExecutor,
  type DomainActivityCommandInput,
  type DomainActivityHost,
  type DomainActivityItem,
  type DomainActivityProjector,
} from '@neko/shared/domain-activity';

export class OpenNekoDomainActivityHost implements DomainActivityHost {
  private readonly projector: DomainActivityProjector = createDomainActivityProjector();
  private exportCommands: DomainActivityCommandExecutor | undefined;
  private disposed = false;

  constructor(
    private readonly resolveGenerationJobs: () => GenerationJobPort | undefined = () => undefined,
  ) {}

  readonly source = this.projector;
  readonly publisher = this.projector;

  installExportCommandExecutor(executor: DomainActivityCommandExecutor): {
    dispose(): void;
  } {
    this.assertAvailable();
    if (this.exportCommands) {
      throw new Error('Cut Export Job command executor is already installed.');
    }
    this.exportCommands = executor;
    return Object.freeze({
      dispose: () => {
        if (this.exportCommands !== executor) {
          throw new Error('Cut Export Job command executor identity mismatch during disposal.');
        }
        this.exportCommands = undefined;
      },
    });
  }

  async execute(input: DomainActivityCommandInput): Promise<DomainActivityItem> {
    this.assertAvailable();
    assertCommandInput(input);
    if (input.jobKind === 'generation') {
      const jobs = this.resolveGenerationJobs();
      if (!jobs) {
        throw new Error('Generation Job commands are unavailable without a workspace runtime.');
      }
      const ref = { kind: 'generation' as const, jobId: input.jobId };
      const command = { ref, expectedRevision: input.expectedRevision };
      const snapshot =
        input.command === 'cancel'
          ? await jobs.cancelGeneration(command)
          : input.command === 'retry'
            ? await jobs.retryGeneration(command)
            : await jobs.reconcileGeneration(command);
      return projectGenerationJobActivity(snapshot);
    }
    const exportCommands = this.exportCommands;
    if (!exportCommands) {
      throw new Error('Cut Export Job commands are unavailable.');
    }
    return exportCommands.execute(input);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.exportCommands = undefined;
    this.projector.dispose();
  }

  private assertAvailable(): void {
    if (this.disposed) throw new Error('Domain Activity Host is disposed.');
  }
}

function assertCommandInput(input: DomainActivityCommandInput): void {
  if (!input.jobId.trim()) throw new Error('Domain Job command requires a non-empty jobId.');
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision <= 0) {
    throw new Error('Domain Job command requires a positive expectedRevision.');
  }
}
