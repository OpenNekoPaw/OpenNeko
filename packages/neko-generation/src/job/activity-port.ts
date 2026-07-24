import {
  createDomainActivityTracker,
  type DomainActivityPublisher,
  type DomainActivityTracker,
} from '@neko/shared/domain-activity';
import { projectGenerationJobActivity } from './activity';
import type {
  GenerationJobPort,
  GenerationJobSnapshot,
  SubmitGenerationJobInput,
  GenerationJobCommandInput,
  GenerationJobRef,
} from './contracts';

export interface GenerationJobActivityPort extends GenerationJobPort {
  installActivity(snapshot: GenerationJobSnapshot): void;
  disposeActivity(): Promise<void>;
}

export function createGenerationJobActivityPort(input: {
  readonly jobs: GenerationJobPort;
  readonly publisher: DomainActivityPublisher;
  readonly reportError: (error: Error, ref: GenerationJobRef) => void;
}): GenerationJobActivityPort {
  const tracker: DomainActivityTracker<GenerationJobSnapshot> = createDomainActivityTracker({
    observe: (ref, afterRevision) => input.jobs.observeGeneration(ref, afterRevision),
    project: projectGenerationJobActivity,
    publisher: input.publisher,
    reportError: input.reportError,
  });

  const install = (snapshot: GenerationJobSnapshot): GenerationJobSnapshot => {
    if (snapshot.lifecycleMode === 'detached') tracker.install(snapshot);
    return snapshot;
  };

  return Object.freeze({
    async submitGeneration(request: SubmitGenerationJobInput) {
      return install(await input.jobs.submitGeneration(request));
    },
    async describeGeneration(ref: GenerationJobRef) {
      return install(await input.jobs.describeGeneration(ref));
    },
    observeGeneration(ref: GenerationJobRef, afterRevision: number) {
      return input.jobs.observeGeneration(ref, afterRevision);
    },
    async cancelGeneration(command: GenerationJobCommandInput) {
      return install(await input.jobs.cancelGeneration(command));
    },
    async retryGeneration(command: GenerationJobCommandInput) {
      return install(await input.jobs.retryGeneration(command));
    },
    async reconcileGeneration(command: GenerationJobCommandInput) {
      return install(await input.jobs.reconcileGeneration(command));
    },
    installActivity: (snapshot: GenerationJobSnapshot) => {
      install(snapshot);
    },
    disposeActivity: () => tracker.dispose(),
  });
}
